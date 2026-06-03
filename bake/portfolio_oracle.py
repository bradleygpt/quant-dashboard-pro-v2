"""Parity oracle for the interactive portfolio analytics. Runs the repo's REAL
portfolio.analyze_portfolio and quant_portfolio.build_optimal_portfolio over a
fixed set of representative test portfolios, across 3 (weight_scheme, floor)
contexts, and emits inputs + exact outputs to web/scripts/portfolio_oracle.json
so the TS port can be diffed on identical inputs.
"""
import json, math, os, sys
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT); sys.path.insert(0, ROOT)

import numpy as np
import pandas as pd
from config import WEIGHT_PRESETS
from data_fetcher import get_broad_universe, fetch_universe_data
from scoring import score_universe, get_sector_stats
from portfolio import analyze_portfolio
from quant_portfolio import build_optimal_portfolio
import price_cache


def log(*a): print(*a, file=sys.stderr)


def clean(v):
    if isinstance(v, (np.integer,)): return int(v)
    if isinstance(v, (np.floating, float)):
        f = float(v); return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(v, np.bool_): return bool(v)
    if v is None: return None
    return v


def deep(o):
    if isinstance(o, dict): return {k: deep(x) for k, x in o.items()}
    if isinstance(o, (list, tuple)): return [deep(x) for x in o]
    return clean(o)


# ── shared price histories (once) ──
log("loading price histories...")
base_tickers = get_broad_universe(0)
base_raw = fetch_universe_data(base_tickers, 0, lambda p, m: None)
prev = score_universe(base_raw, WEIGHT_PRESETS["equal"]["weights"], sector_relative=True, preset_name="equal")
end = datetime.now().date(); start = end - timedelta(days=400)
PH = {}
for t in prev[prev["sector"] != "ETF"].index.tolist():
    try:
        pr = price_cache.get_prices(t, start, end)
        if pr is not None and len(pr) >= 50: PH[t] = pr
    except Exception:
        pass
log(f"  {len(PH)} histories")


def build_scored(scheme, floor):
    tickers = get_broad_universe(floor)
    raw = fetch_universe_data(tickers, floor, lambda p, m: None)
    ph = {t: PH[t] for t in PH if t in raw}
    return score_universe(raw, WEIGHT_PRESETS[scheme]["weights"], sector_relative=True,
                          preset_name=scheme, price_histories=ph)


def make_portfolios(scored):
    """Deterministic, reproducible test portfolios derived from the scored df."""
    stocks = scored[scored["sector"] != "ETF"].sort_values("composite_score", ascending=False)
    st = stocks.index.tolist()
    etfs = scored[scored["sector"] == "ETF"].index.tolist()
    P = []
    # P1: top-5, equal shares
    P.append(("top5_equal", [{"ticker": st[i], "shares": 10} for i in range(5)]))
    # P2: varied sizes + cost basis (gain/loss)
    idx = [0, 3, 8, 20, 50]
    shares = [100, 5, 33, 12, 7]
    cbs = [None, 50.0, 1000.0, 25.0, 80.0]
    P.append(("varied_sizes", [{"ticker": st[i], "shares": s, "cost_basis": c}
                               for i, s, c in zip(idx, shares, cbs)]))
    # P3: single largest sector (5 names)
    top_sector = stocks["sector"].value_counts().index[0]
    sect = stocks[stocks["sector"] == top_sector].index.tolist()[:5]
    P.append(("single_sector", [{"ticker": t, "shares": 20} for t in sect]))
    # P4: ETFs + a stock + an unmatched ticker
    p4 = [{"ticker": t, "shares": 15} for t in etfs[:2]] + \
         [{"ticker": st[2], "shares": 40}, {"ticker": "ZZZZ_NOPE", "shares": 3}]
    P.append(("etf_and_unmatched", p4))
    # P5: many holdings across sectors
    P.append(("many", [{"ticker": st[i], "shares": (i % 7) + 1} for i in range(0, 30, 2)]))
    return P


def serialize_analysis(a):
    if not a or "error" in a:
        return {"error": a.get("error") if a else "empty"}
    pdf = a.get("holdings_df")
    positions = []
    if pdf is not None:
        for _, r in pdf.iterrows():
            positions.append({
                "ticker": r["ticker"], "type": r["type"],
                "market_value": clean(r["market_value"]), "weight": clean(r["weight"]),
                "composite": clean(r.get("composite_score")), "rating": r.get("overall_rating"),
                "sector": r.get("sector"), "gain_pct": clean(r.get("gain_pct")),
            })
    return {
        "total_value": clean(a["total_value"]), "num_holdings": a["num_holdings"],
        "num_stocks": a["num_stocks"], "num_etfs": a["num_etfs"],
        "num_unmatched": a["num_unmatched"], "unmatched_tickers": a["unmatched_tickers"],
        "stock_weight": clean(a["stock_weight"]), "etf_weight": clean(a["etf_weight"]),
        "weighted_composite": clean(a["weighted_composite"]), "weighted_rating": a["weighted_rating"],
        "pillar_scores": {k: clean(v) for k, v in a["pillar_scores"].items()},
        "rating_distribution": {k: clean(v) for k, v in a["rating_distribution"].items()},
        "hhi": clean(a["hhi"]), "concentration_level": a["concentration_level"],
        "sector_weights": {k: {kk: clean(vv) for kk, vv in v.items()}
                           for k, v in a["sector_weights"].items()},
        "factor_tilts": deep(a["factor_tilts"]),
        "positions": positions,
    }


def serialize_quant(df):
    if df is None or df.empty: return []
    out = []
    for _, r in df.iterrows():
        out.append({k: clean(r.get(k)) for k in
                    ["ticker", "sector", "rating", "composite_score", "price",
                     "weight_pct", "dollars", "shares", "market_cap_b"]})
    return out


CONTEXTS = [("equal", 0), ("m_heavy", 0), ("equal", 10)]
QUANT_CFGS = [
    (100000, "Balanced"), (25000, "Conservative"), (50000, "Aggressive"), (250000, "Balanced"),
]

result = {"generated_at": datetime.now().isoformat(timespec="seconds"), "contexts": {}}
for scheme, floor in CONTEXTS:
    key = f"{scheme}_{floor}"
    log(f"=== context {key} ===")
    scored = build_scored(scheme, floor)
    portfolios = make_portfolios(scored)
    # sub-floor test: holdings present in the full fundamentals cache but below the
    # current floor -> exercises analyze_portfolio's raw_cache "Not Scored"/ETF branch
    if floor != 0:
        sub = [t for t in prev.index if t not in scored.index]
        sub_stocks = [t for t in sub if prev.loc[t, "sector"] != "ETF"][:2]
        sub_etfs = [t for t in sub if prev.loc[t, "sector"] == "ETF"][:1]
        in_uni = scored[scored["sector"] != "ETF"].index.tolist()[:1]
        holdings = ([{"ticker": t, "shares": 10} for t in in_uni] +
                    [{"ticker": t, "shares": 25, "cost_basis": 20.0} for t in sub_stocks] +
                    [{"ticker": t, "shares": 8} for t in sub_etfs])
        if len(holdings) > 1:
            portfolios.append(("sub_floor_mix", holdings))
    analyze_out = []
    for pid, holdings in portfolios:
        a = analyze_portfolio(holdings, scored)
        analyze_out.append({"id": pid, "holdings": holdings, "result": serialize_analysis(a)})
    quant_out = []
    for capital, level in QUANT_CFGS:
        df = build_optimal_portfolio(scored, capital, preset=level, weight_scheme=scheme)
        quant_out.append({"id": f"{level}_{capital}", "capital": capital,
                          "aggressiveness": level, "weight_scheme": scheme,
                          "positions": serialize_quant(df)})
    result["contexts"][key] = {"analyze": analyze_out, "quant": quant_out}

outpath = os.path.join(ROOT, "web", "scripts", "portfolio_oracle.json")
json.dump(result, open(outpath, "w"), indent=2)
log(f"wrote {outpath}")
# quick summary
for key, c in result["contexts"].items():
    log(f"  {key}: {len(c['analyze'])} portfolios, {len(c['quant'])} quant configs")
