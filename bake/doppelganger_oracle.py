"""Parity oracle for the Doppelganger feature. Runs the REAL doppelganger.py
find_doppelgangers + doppelganger_returns.aggregate_forward_returns over fixed
test tickers/options, emits results for the TS port to diff."""
import json, os, sys
from datetime import datetime, timedelta
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT); sys.path.insert(0, ROOT)

from config import WEIGHT_PRESETS
from data_fetcher import get_broad_universe, fetch_universe_data
from scoring import score_universe
from doppelganger import find_doppelgangers
from doppelganger_returns import aggregate_forward_returns
import price_cache

tickers = get_broad_universe(0)
raw = fetch_universe_data(tickers, 0, lambda p, m: None)
# price histories for momentum/FV parity with the bake (equal, floor 0)
prev = score_universe(raw, WEIGHT_PRESETS["equal"]["weights"], sector_relative=True, preset_name="equal")
end = datetime.now().date(); start = end - timedelta(days=400)
PH = {}
for t in prev[prev["sector"] != "ETF"].index.tolist():
    try:
        pr = price_cache.get_prices(t, start, end)
        if pr is not None and len(pr) >= 50: PH[t] = pr
    except Exception:
        pass
scored = score_universe(raw, WEIGHT_PRESETS["equal"]["weights"], sector_relative=True,
                        preset_name="equal", price_histories=PH)

stocks = scored[scored["sector"] != "ETF"].sort_values("composite_score", ascending=False)
# representative set: top 12 + one per distinct sector
test_tickers = list(dict.fromkeys(
    stocks.index.tolist()[:12] +
    [stocks[stocks["sector"] == s].index[0] for s in stocks["sector"].dropna().unique()]
))[:25]

OPTS = [
    {"sector_filter": "same", "dedupe_eras": True, "tag_filter": None},
    {"sector_filter": "any", "dedupe_eras": True, "tag_filter": None},
    {"sector_filter": "any", "dedupe_eras": False, "tag_filter": None},
    {"sector_filter": "any", "dedupe_eras": True, "tag_filter": "bubble-era"},
]

out = {"tickers": test_tickers, "cases": []}
for tk in test_tickers:
    for opts in OPTS:
        matches = find_doppelgangers(tk, scored, top_n=5, **opts)
        agg = aggregate_forward_returns(matches)
        out["cases"].append({
            "ticker": tk, "opts": opts,
            "matches": [{"match_key": m["match_key"], "similarity": m["similarity"],
                         "era_bucket": m["era_bucket"], "same_sector": m["same_sector"]} for m in matches],
            "agg": None if agg is None else {k: agg[k] for k in
                   ["weighted_1yr_pct", "weighted_3yr_pct", "weighted_5yr_pct",
                    "median_1yr_pct", "best_1yr", "worst_1yr", "contributing_count", "missing_count"]},
        })

json.dump(out, open(os.path.join(ROOT, "web", "scripts", "doppelganger_oracle.json"), "w"), indent=2)
print(f"wrote doppelganger_oracle.json: {len(test_tickers)} tickers x {len(OPTS)} opts = {len(out['cases'])} cases", file=sys.stderr)
