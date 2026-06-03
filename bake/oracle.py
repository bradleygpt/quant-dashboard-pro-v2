"""Parity oracle: reproduce app.py load_and_score() default state exactly,
without Streamlit. Default state = floor 0, equal preset, sector_relative=True.
Emits the scored universe + screener top-25 + sample FV/QBP for parity checks.
"""
import json, sys
from config import DEFAULT_PILLAR_WEIGHTS, DEFAULT_PRESET
from data_fetcher import get_broad_universe, fetch_universe_data
from scoring import score_universe, get_sector_stats

MCAP = 0
PRESET = DEFAULT_PRESET            # "equal"
WEIGHTS = dict(DEFAULT_PILLAR_WEIGHTS)
SR = True

def load_universe_price_histories(scored_preview):
    import price_cache
    from datetime import datetime, timedelta
    stocks = scored_preview[scored_preview["sector"] != "ETF"].copy()
    all_tickers = stocks.index.tolist()
    end = datetime.now().date()
    start = end - timedelta(days=400)
    histories = {}
    for ticker in all_tickers:
        try:
            prices = price_cache.get_prices(ticker, start, end)
            if prices is not None and len(prices) >= 50:
                histories[ticker] = prices
        except Exception:
            continue
    return histories

print("Loading universe...", file=sys.stderr)
tickers = get_broad_universe(MCAP)
raw = fetch_universe_data(tickers, MCAP, lambda p, m: None)
print(f"  {len(raw)} tickers loaded", file=sys.stderr)

print("First-pass scoring...", file=sys.stderr)
scored_preview = score_universe(raw, WEIGHTS, sector_relative=SR, preset_name=PRESET)

print("Loading price histories (heavy)...", file=sys.stderr)
ph = load_universe_price_histories(scored_preview) if not scored_preview.empty else {}
print(f"  {len(ph)} price histories", file=sys.stderr)

print("Second-pass scoring with FV/QBP...", file=sys.stderr)
scored = score_universe(raw, WEIGHTS, sector_relative=SR, preset_name=PRESET, price_histories=ph)

# Screener view = non-ETF, sorted by composite desc
stocks = scored[scored["sector"] != "ETF"].copy()
cols = ["shortName", "sector", "composite_score", "overall_rating",
        "currentPrice", "fair_value", "buy_point",
        "Valuation_score", "Growth_score", "Profitability_score",
        "Momentum_score", "EPS Revisions_score"]
top = stocks.head(30)[cols]

out = {
    "meta": {
        "n_total": int(len(scored)),
        "n_stocks": int(len(stocks)),
        "n_etf": int((scored["sector"] == "ETF").sum()),
        "preset": PRESET, "mcap_floor": MCAP, "sector_relative": SR,
        "n_price_histories": len(ph),
    },
    "rating_counts": stocks["overall_rating"].value_counts().to_dict(),
    "top30": [],
}
for tk, r in top.iterrows():
    out["top30"].append({
        "ticker": tk,
        "name": r["shortName"],
        "sector": r["sector"],
        "score": round(float(r["composite_score"]), 4),
        "rating": r["overall_rating"],
        "price": None if r["currentPrice"] is None else round(float(r["currentPrice"]), 2),
        "fv": None if r["fair_value"] != r["fair_value"] else round(float(r["fair_value"]), 2),
        "qbp": None if r["buy_point"] != r["buy_point"] else round(float(r["buy_point"]), 2),
        "pillars": {
            "Val": round(float(r["Valuation_score"]), 3),
            "Gro": round(float(r["Growth_score"]), 3),
            "Pro": round(float(r["Profitability_score"]), 3),
            "Mom": round(float(r["Momentum_score"]), 3),
            "EPS": round(float(r["EPS Revisions_score"]), 3),
        },
    })

json.dump(out, open("_oracle_out.json", "w"), indent=2)
print("WROTE _oracle_out.json", file=sys.stderr)
print(json.dumps(out["meta"]))
print(json.dumps(out["rating_counts"]))
