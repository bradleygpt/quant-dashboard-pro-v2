"""Fold the MLPred 12-month forecast (pred_12m) into the composite Fair Value as a
5th method: "ML 12-Month Target", weight 0.20 (matches Analyst Consensus, the other
12-month forward target). RELATIVE/demeaned tilt: fv_ml = price * (1 + (pred_12m - median)),
so the ML pulls FV UP for its favoured names and DOWN for the rest, neutral on average
(pred_12m is all-positive +4..29%, a ranking signal; using it raw would shift every FV up).

Operates on the EXISTING baked JSONs (which already carry each method's fair_value), so it
needs no scored_df / full re-bake. Mirrors fairvalue.py's composite + verdict logic exactly.
Source (fairvalue.py + bake.py) is updated separately so the next native bake reproduces this.
"""
import json, statistics as st
from pathlib import Path

DATA = Path(__file__).parent / "public" / "data"
ML_WEIGHT = 0.20
BASE_W = {"PEG Fair Value": 0.30, "Earnings Capitalization": 0.25, "Analyst Consensus": 0.20}
def weight_of(mn):
    if mn == "ML 12-Month Target": return ML_WEIGHT
    if "Quality-Adj" in mn: return 0.25
    return BASE_W.get(mn, 0.15)

def verdict_of(pd_pct):
    if pd_pct < -30: return "Deeply Undervalued", "#00C805"
    if pd_pct < -15: return "Undervalued", "#8BC34A"
    if pd_pct < 25:  return "Fairly Valued", "#FFC107"
    if pd_pct < 50:  return "Overvalued", "#FF5722"
    return "Significantly Overvalued", "#D32F2F"

def composite_of(methods, price):
    wsum = tw = 0.0
    for mn, md in methods.items():
        fv = md.get("fair_value", 0)
        if fv and fv > 0 and 0.2 < fv / price < 3.0:
            w = weight_of(mn); wsum += fv * w; tw += w
    return (wsum / tw) if tw > 0 else 0.0

# --- ML predictions + cross-sectional median (the demean center) ---
ml = json.load(open(DATA / "mlpred.json"))
pred = {r["ticker"]: r["pred_12m"] for r in ml["rows"] if r.get("pred_12m") is not None}
MED = st.median(pred.values())
print(f"pred_12m: {len(pred)} names, cross-sectional median {MED*100:.2f}% (demean center)")

def fold_shard(fv, tk):
    """Add/refresh the ML method on a detail-shard fv dict; recompute composite+verdict. Returns True if changed."""
    p = pred.get(tk); price = fv.get("current_price", 0)
    if p is None or not price or price <= 0: return False
    methods = {k: v for k, v in fv["methods"].items() if k != "ML 12-Month Target"}  # idempotent
    tilt = p - MED
    fv_ml = round(price * (1 + tilt), 2)
    methods["ML 12-Month Target"] = {
        "fair_value": fv_ml,
        "premium_discount_pct": round((price - fv_ml) / fv_ml * 100, 1) if fv_ml > 0 else 0,
        "assumptions": {
            "pred_12m": f"{p*100:.1f}%", "cohort_median": f"{MED*100:.1f}%",
            "relative_tilt": f"{tilt*100:+.1f}%", "source": "MLPred v7 12-month forecast",
            "method": "price * (1 + (pred_12m - cohort median)); demeaned relative tilt, weight 0.20",
        },
    }
    comp = composite_of(methods, price)
    if comp <= 0: return False
    pd_pct = (price - comp) / comp * 100
    vd, vc = verdict_of(pd_pct)
    fv["methods"] = methods
    fv["composite_fair_value"] = round(comp, 2)
    fv["premium_discount_pct"] = round(pd_pct, 1)
    fv["verdict"], fv["verdict_color"] = vd, vc
    fv["margin_of_safety"] = round(max(0, -pd_pct), 1)
    fv["num_methods_used"] = len(methods)
    return True

for floor in (0, 1):
    # recompute every detail shard, build a ticker->(fv,premium,verdict) map for the universe rows
    ddir = DATA / "detail" / f"floor{floor}"
    upd = {}
    nshard = 0
    for sh in sorted(ddir.glob("*.json")):
        d = json.load(open(sh))
        fvd = d.get("fv")
        if not isinstance(fvd, dict) or "methods" not in fvd: continue
        tk = fvd.get("ticker") or sh.stem
        if fold_shard(fvd, tk):
            json.dump(d, open(sh, "w"), separators=(",", ":"), allow_nan=False)
            upd[tk] = (fvd["composite_fair_value"], fvd["premium_discount_pct"], fvd["verdict"])
            nshard += 1
    # patch the lean universe rows
    uf = DATA / f"universe_floor{floor}.json"
    u = json.load(open(uf))
    rows = u if isinstance(u, list) else u["rows"]
    npatched = 0
    for r in rows:
        t = r.get("ticker")
        if t in upd:
            r["fv"], r["fvPremium"], r["fvVerdict"] = upd[t]
            npatched += 1
    json.dump(u, open(uf, "w"), separators=(",", ":"), allow_nan=False)
    print(f"floor{floor}: {nshard} shards recomputed, {npatched}/{len(rows)} universe rows patched")

print("done -> FV now folds in ML 12-month (relative tilt, weight 0.20)")
