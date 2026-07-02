import { SEM } from "../theme";
// Faithful port of pullback_pressure.py — the "Why?" breakdown. Composite =
// weighted blend of VIX (40%), SPY vs 50-SMA (20%), SPY vs 200-SMA (20%),
// universe breadth (10%), SPY 3-month return (10%). Inputs come from /api/market
// (SPY price/SMAs, VIX) + breadth computed from the baked universe.
const clip = (x: number) => Math.max(0, Math.min(100, x));

export interface PullbackComponent { name: string; value: string; score: number; interp: string }
export interface Pullback {
  score: number; level: string; level_color: string;
  deploy_pct: number; deploy_strategy: string; components: PullbackComponent[];
}

export function computePullback(
  spy: { price?: number | null; sma50?: number | null; sma200?: number | null; ret_3m_pct?: number | null } | null,
  vixNow: number | null,
  breadthPctAbove50: number | null,
): Pullback | null {
  if (!spy?.price) return null;
  const comps: PullbackComponent[] = [];
  const scores: Record<string, number> = {};

  // VIX (40%)
  if (vixNow != null) {
    const s = clip(100 - (vixNow - 10) * 5);
    const interp = vixNow < 12 ? "Extreme complacency" : vixNow < 15 ? "Low volatility" : vixNow < 20 ? "Normal" : vixNow < 28 ? "Elevated fear" : "Extreme fear";
    scores.vix = s; comps.push({ name: "VIX", value: vixNow.toFixed(1), score: Math.round(s), interp });
  }
  // SPY vs 50-SMA (20%)
  if (spy.sma50) {
    const pct = ((spy.price - spy.sma50) / spy.sma50) * 100;
    const s = clip(50 + pct * 5);
    const interp = pct > 10 ? "Very stretched" : pct > 5 ? "Stretched" : pct > 0 ? "Above trend" : pct > -5 ? "Below trend" : "Well below trend";
    scores.vs_50sma = s; comps.push({ name: "SPY vs 50-SMA", value: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, score: Math.round(s), interp });
  }
  // SPY vs 200-SMA (20%)
  if (spy.sma200) {
    const pct = ((spy.price - spy.sma200) / spy.sma200) * 100;
    const s = clip(50 + pct * 3);
    const interp = pct > 10 ? "Very stretched" : pct > 5 ? "Stretched" : pct > 0 ? "Above trend" : pct > -5 ? "Below trend" : "Well below trend";
    scores.vs_200sma = s; comps.push({ name: "SPY vs 200-SMA", value: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, score: Math.round(s), interp });
  }
  // Universe breadth (10%)
  if (breadthPctAbove50 != null) {
    const s = breadthPctAbove50 > 75 ? 70 : breadthPctAbove50 > 65 ? 60 : breadthPctAbove50 < 35 ? 30 : 50;
    scores.breadth = s; comps.push({ name: "Universe breadth", value: `${breadthPctAbove50.toFixed(0)}% > 50-SMA`, score: s, interp: breadthPctAbove50 > 65 ? "Broad participation" : breadthPctAbove50 < 35 ? "Narrow / weak" : "Mixed" });
  }
  // SPY 3-month return (10%)
  if (spy.ret_3m_pct != null) {
    const pct = spy.ret_3m_pct;
    const s = clip(50 + pct * 3);
    const interp = pct > 12 ? "Mean-reversion pressure" : pct > 6 ? "Solid gains" : pct > 0 ? "Modest gains" : pct > -6 ? "Recent weakness" : "Often a buy signal";
    scores.momentum = s; comps.push({ name: "SPY 3-month return", value: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, score: Math.round(s), interp });
  }

  const W: Record<string, number> = { vix: 0.4, vs_50sma: 0.2, vs_200sma: 0.2, breadth: 0.1, momentum: 0.1 };
  let composite = 0;
  for (const k of Object.keys(W)) composite += (scores[k] ?? 50) * W[k];
  composite = Math.round(composite * 10) / 10;

  const [level, level_color] =
    composite >= 75 ? ["Extreme", SEM.negDeep] : composite >= 60 ? ["Elevated", SEM.warnHot] :
    composite >= 40 ? ["Moderate", SEM.warn] : composite >= 25 ? ["Low", SEM.posSoft] : ["Very Low", SEM.pos];

  let deploy_pct: number, deploy_strategy: string;
  if (composite >= 80) { deploy_pct = 25; deploy_strategy = "Conditions stretched. Deploy 25% now, hold 75% for a pullback or DCA over 8–12 weeks."; }
  else if (composite >= 65) { deploy_pct = 50; deploy_strategy = "Elevated risk. Deploy 50% now, hold 50% for opportunistic adds on weakness."; }
  else if (composite >= 45) { deploy_pct = 75; deploy_strategy = "Mixed signals. Deploy 75% now, keep 25% reserve for tactical deployment."; }
  else if (composite >= 25) { deploy_pct = 100; deploy_strategy = "Conditions favorable. Deploy fully now."; }
  else { deploy_pct = 100; deploy_strategy = "Market under pressure / fear — historically good entry points. Deploy fully."; }

  return { score: composite, level, level_color, deploy_pct, deploy_strategy, components: comps };
}
