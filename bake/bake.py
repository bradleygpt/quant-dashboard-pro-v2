"""Build-time bake: run the repo's real scoring pipeline and emit static JSON
for the React app. Source of truth = scoring.py / fairvalue.py / buy_point.py.

Run from anywhere: `python bake/bake.py`. Writes directly into
web/public/data/. Outputs:
  universe_floor{0,1,10}.json  lean rows for tables (pillar scores/grades, raw
                               metrics, FV/QBP composite, currentPrice, sector)
  detail_floor{0,1,10}.json    per-ticker: full FV dict, full QBP dict,
                               pillar_detail, + sector_stats for the floor
  prices.json                  per-ticker recent daily close (floor-independent)
  meta.json                    presets, thresholds, backtest stats, colors,
                               grade maps, sector list, generated stamp

Preset/custom-weight switching is done CLIENT-SIDE: composite = Σ(pillar×weight),
ratings re-derived from composite + FV/QBP (all preset-independent here).
"""
import json, math, sys, os
from datetime import datetime, timedelta

# Run the repo's real modules: make the repo root importable and the cwd, so
# `import config` resolves and the cache files (read by relative path) are found.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
sys.path.insert(0, ROOT)

import numpy as np
import pandas as pd

from config import (DEFAULT_PILLAR_WEIGHTS, WEIGHT_PRESETS, ABSOLUTE_THRESHOLDS,
                    ABSOLUTE_THRESHOLD_STATS, PILLAR_METRICS, GRADE_PERCENTILE_MAP,
                    GRADE_SCORES, RATING_MAPS_PER_PRESET, RATING_COLORS, GRADE_COLORS,
                    DEFAULT_PRESET)
from data_fetcher import get_broad_universe, fetch_universe_data
from scoring import (score_universe, get_sector_stats, get_pillar_detail)
from fairvalue import compute_fair_value
from buy_point import compute_buy_point
import price_cache

FLOORS = [0, 1, 10]
EQUAL = dict(DEFAULT_PILLAR_WEIGHTS)
OUT = os.path.join(ROOT, "web", "public", "data")
os.makedirs(OUT, exist_ok=True)
PILLARS = list(PILLAR_METRICS.keys())  # Valuation, Growth, Profitability, Momentum, EPS Revisions
RAW_KEYS = [k for metrics in PILLAR_METRICS.values() for (k, _, _) in metrics]


def log(*a): print(*a, file=sys.stderr)


# Windows reserved device names: CON.json etc. write to the console device, not a
# file. Map reserved tickers (e.g. CON) to CON_.json on disk; data.ts mirrors this.
import urllib.parse
RESERVED_NAMES = {"CON", "PRN", "AUX", "NUL"} | {f"COM{i}" for i in range(1, 10)} | {f"LPT{i}" for i in range(1, 10)}
def shard_filename(ticker) -> str:
    name = str(ticker)
    if name.upper() in RESERVED_NAMES:
        name = name + "_"
    return urllib.parse.quote(name, safe="") + ".json"


def unrounded_pillars(raw):
    """Reproduce scoring.score_universe's pillar averages WITHOUT the .round(2)
    that scoring applies when writing result columns. Uses scoring's own
    _percentile_to_grade + GRADE_SCORES so the math is identical, giving
    full-precision pillar scores for exact client-side composite recompute."""
    from scoring import _percentile_to_grade
    df = pd.DataFrame.from_dict(raw, orient="index")
    out = {}
    for pillar_name, metrics in PILLAR_METRICS.items():
        metric_scores = []
        for yf_key, _disp, higher in metrics:
            if yf_key not in df.columns:
                continue
            col = pd.to_numeric(df[yf_key], errors="coerce")
            if higher:
                pct = col.groupby(df["sector"]).rank(pct=True, na_option="bottom") * 100
            else:
                pct = (1 - col.groupby(df["sector"]).rank(pct=True, na_option="bottom")) * 100
            grades = pct.apply(_percentile_to_grade)
            metric_scores.append(grades.map(GRADE_SCORES).fillna(1))
        if metric_scores:
            out[pillar_name] = pd.concat(metric_scores, axis=1).mean(axis=1)
        else:
            out[pillar_name] = pd.Series(1.0, index=df.index)
    return pd.DataFrame(out)


def clean(v):
    """JSON-safe scalar: NaN/inf -> None, numpy -> python."""
    if v is None: return None
    if isinstance(v, (np.integer,)): return int(v)
    if isinstance(v, (np.floating, float)):
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(v, np.bool_): return bool(v)
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)): return None
    return v


def num(v):
    """to float or None"""
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return None


def deep_clean(o):
    if isinstance(o, dict): return {k: deep_clean(x) for k, x in o.items()}
    if isinstance(o, (list, tuple)): return [deep_clean(x) for x in o]
    return clean(o)


# ── load all price histories once (full no-floor universe) ──
log("Loading no-floor universe for price histories...")
base_tickers = get_broad_universe(0)
base_raw = fetch_universe_data(base_tickers, 0, lambda p, m: None)
base_preview = score_universe(base_raw, EQUAL, sector_relative=True, preset_name="equal")
end = datetime.now().date()
start = end - timedelta(days=400)
PH = {}
for t in base_preview[base_preview["sector"] != "ETF"].index.tolist():
    try:
        pr = price_cache.get_prices(t, start, end)
        if pr is not None and len(pr) >= 50:
            PH[t] = pr
    except Exception:
        continue
log(f"  {len(PH)} price histories loaded")

# ── per-ticker price shards (floor-independent) ── perf: Stock Detail fetches one
# ~5KB file instead of a 6.6MB monolith. Recent daily closes only (not 5.8M rows).
import urllib.parse
PRICES_DIR = os.path.join(OUT, "prices")
os.makedirs(PRICES_DIR, exist_ok=True)
n_price = 0
for t, pr in PH.items():
    col = "close" if "close" in pr.columns else ("Close" if "Close" in pr.columns else None)
    if col is None:
        continue
    s = pr[col].astype(float)
    dates = [d.strftime("%Y-%m-%d") for d in pd.to_datetime(s.index)]
    closes = [round(float(x), 4) for x in s.values]
    fn = shard_filename(t)
    json.dump({"dates": dates, "close": closes}, open(os.path.join(PRICES_DIR, fn), "w"))
    n_price += 1
log(f"  wrote {n_price} per-ticker price shards")


def bake_floor(floor):
    log(f"=== floor {floor} ===")
    tickers = get_broad_universe(floor)
    raw = fetch_universe_data(tickers, floor, lambda p, m: None)
    ph = {t: PH[t] for t in PH if t in raw}
    scored = score_universe(raw, EQUAL, sector_relative=True, preset_name="equal",
                            price_histories=ph)
    # Authoritative per-preset composite_score + overall_rating (exact parity).
    # FV/QBP/pillars are preset-independent; only composite & rating change.
    by_preset = {}
    for pname, pinfo in WEIGHT_PRESETS.items():
        sc = score_universe(raw, pinfo["weights"], sector_relative=True,
                            preset_name=pname, price_histories=ph)
        by_preset[pname] = {tk: (num(r.get("composite_score")), r.get("overall_rating"))
                            for tk, r in sc.iterrows()}
        log(f"  scored preset {pname}")
    # M&A scores (non-critical)
    try:
        from ma_analysis import add_ma_target_scores_to_universe
        ss_for_ma = get_sector_stats(scored)
        scored = add_ma_target_scores_to_universe(scored, ss_for_ma)
    except Exception as e:
        log(f"  ma_analysis skipped: {e}")
    sector_stats = get_sector_stats(scored)
    upil = unrounded_pillars(raw)  # full-precision pillar scores for exact custom recompute
    # sanity: rounding the reproduction must equal scoring's stored columns
    _bad = 0
    for p in PILLARS:
        diff = (upil[p].round(2) - scored[f"{p}_score"]).abs()
        _bad += int((diff > 1e-9).sum())
    log(f"  unrounded-pillar reproduction mismatches vs stored (should be 0): {_bad}")

    rows = []
    detail_dir = os.path.join(OUT, "detail", f"floor{floor}")
    os.makedirs(detail_dir, exist_ok=True)
    ma_col = next((c for c in scored.columns if "ma_" in c.lower() and "score" in c.lower()), None)
    n_detail = 0

    for tk, r in scored.iterrows():
        sector = r.get("sector")
        is_etf = sector == "ETF"
        pillars = {p: num(upil.loc[tk, p]) for p in PILLARS}
        grades = {p: r.get(f"{p}_grade") for p in PILLARS}

        # ── rich detail FIRST (non-ETF get FV/QBP; all get pillar detail) ──
        # Mirror scoring.py _classify_top25_tier: FV/QBP wrapped in try/except so
        # string-typed cache fields silently yield None (matches universe columns).
        d = {"pillar_detail": deep_clean(get_pillar_detail(tk, scored, sector_stats)),
             "fv": None, "qbp": None}
        if not is_etf:
            fv_comp = None
            try:
                fv = compute_fair_value(tk, scored)
                if "error" not in fv:
                    d["fv"] = deep_clean(fv)
                    fv_comp = fv.get("composite_fair_value")
            except Exception:
                pass
            ph_t = ph.get(tk)
            if ph_t is not None:
                try:
                    qbp = compute_buy_point(tk, scored, fair_value=fv_comp, price_history=ph_t)
                    if "error" not in qbp:
                        d["qbp"] = deep_clean(qbp)
                except Exception:
                    pass
        # per-ticker detail shard
        fn = shard_filename(tk)
        json.dump(d, open(os.path.join(detail_dir, fn), "w"))
        n_detail += 1

        row = {
            "ticker": tk,
            "name": r.get("shortName"),
            "sector": sector,
            "industry": r.get("industry"),
            "marketCapB": num(r.get("marketCapB")),
            "marketCap": num(r.get("marketCap")),
            "price": num(r.get("currentPrice")),
            "fv": num(r.get("fair_value")),
            "qbp": num(r.get("buy_point")),
            # screener display fields, pulled from the Python FV/QBP dicts (parity-safe)
            "fvVerdict": (d["fv"] or {}).get("verdict"),
            "fvPremium": (d["fv"] or {}).get("premium_discount_pct"),
            "qbpDistance": (d["qbp"] or {}).get("distance_pct"),
            "qbpSignal": (d["qbp"] or {}).get("signal"),
            "pillars": pillars,
            "grades": grades,
            "raw": {k: num(r.get(k)) for k in RAW_KEYS if k in scored.columns},
        }
        if ma_col:
            row["ma_score"] = num(r.get(ma_col))
        # authoritative per-preset composite + rating
        row["byPreset"] = {p: {"c": by_preset[p].get(tk, (None, None))[0],
                               "r": by_preset[p].get(tk, (None, None))[1]}
                           for p in WEIGHT_PRESETS}
        rows.append(row)

    meta = {
        "floor": floor,
        "n_total": len(rows),
        "n_stocks": int((scored["sector"] != "ETF").sum()),
        "n_etf": int((scored["sector"] == "ETF").sum()),
        "sectors": sorted([s for s in scored["sector"].dropna().unique().tolist()]),
    }
    json.dump({"meta": meta, "rows": rows}, open(f"{OUT}/universe_floor{floor}.json", "w"))
    log(f"  wrote universe_floor{floor}.json ({len(rows)} rows) + {n_detail} detail shards")
    return meta


metas = {str(f): bake_floor(f) for f in FLOORS}

meta = {
    "generated_at": datetime.now().isoformat(timespec="seconds"),
    "source_commit": os.popen("git rev-parse --short HEAD").read().strip(),
    "default_preset": DEFAULT_PRESET,
    "default_floor": 0,
    "floors": FLOORS,
    "presets": WEIGHT_PRESETS,
    "absolute_thresholds": ABSOLUTE_THRESHOLDS,
    "absolute_threshold_stats": ABSOLUTE_THRESHOLD_STATS,
    "pillars": PILLARS,
    "pillar_metrics": {p: [{"key": k, "name": n, "higher_is_better": h}
                          for (k, n, h) in m] for p, m in PILLAR_METRICS.items()},
    "grade_percentile_map": {g: list(v) for g, v in GRADE_PERCENTILE_MAP.items()},
    "grade_scores": GRADE_SCORES,
    "rating_maps_per_preset": {p: {r: list(v) for r, v in m.items()}
                               for p, m in RATING_MAPS_PER_PRESET.items()},
    "rating_colors": RATING_COLORS,
    "grade_colors": GRADE_COLORS,
    "top_portfolio_n": 25,
    "floor_meta": metas,
}
try:
    import advanced_screener as _advs
    meta["screener"] = {"filterable_metrics": _advs.FILTERABLE_METRICS,
                        "preset_screens": _advs.PRESET_SCREENS}
except Exception as e:
    log(f"screener config skipped: {e}")
json.dump(meta, open(f"{OUT}/meta.json", "w"), indent=2)
log("wrote meta.json")

# ── help content (static strings from help_content.py) ──
try:
    import help_content as hc
    help_keys = ["GETTING_STARTED", "PILLAR_METHODOLOGY", "RATING_SYSTEM", "FAIR_VALUE",
                 "BUY_POINT", "DOPPELGANGER", "MONTE_CARLO", "PGI", "PRO_CHARTS",
                 "ETF_CENTER", "BEST_PRACTICES", "DATA_SOURCES", "DISCLAIMER"]
    help_out = {k: getattr(hc, k) for k in help_keys if isinstance(getattr(hc, k, None), str)}
    json.dump(help_out, open(f"{OUT}/help.json", "w"), indent=2)
    log(f"wrote help.json ({len(help_out)} sections)")
except Exception as e:
    log(f"help.json skipped: {e}")

# ── pundits cache (cache-backed; the source renders this verbatim) ──
try:
    import shutil
    for p in ("pundits_cache.json", os.path.join("data_cache", "pundits_cache.json")):
        if os.path.exists(p):
            shutil.copyfile(p, f"{OUT}/pundits.json"); log("wrote pundits.json"); break
    else:
        log("pundits.json skipped: cache not found")
except Exception as e:
    log(f"pundits.json skipped: {e}")

# ── quarterly history (for Stock Detail quarterly earnings/margins trend) ──
try:
    qmap = {}
    for tk, d in base_raw.items():
        qh = d.get("quarterly_history")
        if isinstance(qh, list) and qh:
            qmap[tk] = qh
    json.dump(qmap, open(f"{OUT}/quarterly.json", "w"))
    log(f"wrote quarterly.json ({len(qmap)} tickers)")
except Exception as e:
    log(f"quarterly.json skipped: {e}")

# ── indicator snapshots (for Home market-health 1W/1M deltas) ──
try:
    import shutil
    for p in ("indicator_snapshots.json", os.path.join("data_cache", "indicator_snapshots.json")):
        if os.path.exists(p):
            shutil.copyfile(p, f"{OUT}/snapshots.json"); log("wrote snapshots.json"); break
    else:
        log("snapshots.json skipped: not found")
except Exception as e:
    log(f"snapshots.json skipped: {e}")

# ── doppelganger DBs (static analog + forward-return tables; algorithm ported to TS) ──
try:
    import doppelganger as _dg, doppelganger_returns as _dgr
    json.dump({
        "fingerprint_dimensions": _dg.FINGERPRINT_DIMENSIONS,
        "historical_analogs": _dg.HISTORICAL_ANALOGS,
        "forward_returns": _dgr.FORWARD_RETURNS,
        "stats": _dg.get_database_stats(),
        "tags": _dg.get_tags_list(),
    }, open(f"{OUT}/doppelganger.json", "w"), indent=2)
    log(f"wrote doppelganger.json ({len(_dg.HISTORICAL_ANALOGS)} analogs)")
except Exception as e:
    log(f"doppelganger.json skipped: {e}")

# ── ETF center: static templates/maps + per-ETF cache fields ──
try:
    import etf_center as _ec
    etf_fields = ["shortName", "industry", "expenseRatio", "totalAssets", "navPrice",
                  "ytdReturn", "threeYearReturn", "fiveYearReturn", "currentPrice", "beta3Year",
                  "yield", "momentum_1m", "momentum_3m", "momentum_6m", "momentum_12m"]
    etfs = {}
    for t, d in base_raw.items():
        if d.get("type") == "etf" or d.get("sector") == "ETF":
            etfs[t] = {k: clean(d.get(k)) for k in etf_fields}
    json.dump({
        "templates": _ec.PORTFOLIO_TEMPLATES,
        "sector_map": _ec.SECTOR_ETF_MAP,
        "theme_map": _ec.THEME_ETF_MAP,
        "etfs": etfs,
    }, open(f"{OUT}/etf.json", "w"), indent=2)
    log(f"wrote etf.json ({len(etfs)} ETFs)")
except Exception as e:
    log(f"etf.json skipped: {e}")

# ── market regime static (network-free pieces; live market data via /api/market) ──
try:
    import macro as _mc, sentiment as _sent
    _md = _mc.MACRO_DATA
    market_static = {
        "macro_data": _md,
        "earnings_forecast": _mc.compute_earnings_forecast(
            _md.get("cpi_current"), _md.get("unemployment_current"), _md.get("ism_composite")),
        "fed_outlook": _mc.get_fed_rate_outlook(),
        "economic_calendar": _mc.fetch_economic_calendar(),
        "coming_soon_indicators": getattr(_sent, "COMING_SOON_INDICATORS", []),
        "us_gdp_trillions": _mc.MACRO_DATA.get("us_gdp_trillions", 29.7),
    }
    try:
        from fed_calendar import _FALLBACK_2026_MEETINGS, _FALLBACK_2027_MEETINGS
        market_static["fomc_meetings"] = list(_FALLBACK_2026_MEETINGS) + list(_FALLBACK_2027_MEETINGS)
    except Exception:
        market_static["fomc_meetings"] = []
    json.dump(deep_clean(market_static), open(f"{OUT}/market_static.json", "w"), indent=2)
    log("wrote market_static.json")
except Exception as e:
    log(f"market_static.json skipped: {e}")

log("DONE")
