import { SEM } from "../theme";
// Faithful TS port of quant-historical/mlpred_v7/scripts/pullback_pressure_index.py
// (the c78q PPI). 7 weighted components, thresholds copied verbatim. Each component
// returns the neutral-50 fallback on insufficient/missing data, exactly as the Python
// score_* functions do. Breadth is supplied from the app's baked universe (% above
// 50-SMA) instead of scanning per-stock parquets — the documented source of any drift.

export const PPI_WEIGHTS = {
  mri: 0.20, rsi14_sustained: 0.15, rsi2_extreme: 0.10, vix_structure: 0.15,
  vvix_spike: 0.10, breadth: 0.15, drawdown_from_peak: 0.15,
} as const;
type Key = keyof typeof PPI_WEIGHTS;

// Labels name what each component MEASURES (higher component score = more pullback
// pressure), not the raw indicator — e.g. "RSI-14 sustained 10" misread as an RSI
// value; it's the count of days RSI14>70 in the last 10 (overbought persistence).
const NICE: Record<Key, string> = {
  mri: "MRI", rsi14_sustained: "Overbought persistence (RSI14>70, 10d)", rsi2_extreme: "Short-term extreme (RSI2)",
  vix_structure: "VIX structure", vvix_spike: "VVIX spike", breadth: "Breadth",
  drawdown_from_peak: "Drawdown from peak",
};

const clip = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

// RSI with simple rolling-mean gains/losses (matches the Python compute_rsi: rolling().mean()).
function computeRSI(closes: number[], window: number): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = closes.map(() => null);
  if (n < window + 1) return out;
  const gain: number[] = [0], loss: number[] = [0];
  for (let i = 1; i < n; i++) { const d = closes[i] - closes[i - 1]; gain.push(d > 0 ? d : 0); loss.push(d < 0 ? -d : 0); }
  // rolling mean over `window` (min_periods=window) — valid from index `window`
  for (let i = window; i < n; i++) {
    let g = 0, l = 0;
    for (let j = i - window + 1; j <= i; j++) { g += gain[j]; l += loss[j]; }
    const avgG = g / window, avgL = l / window;
    if (avgL === 0) { out[i] = null; continue; } // rs = NaN → rsi NaN (Python replaces 0→nan)
    const rs = avgG / avgL;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

export interface PpiComponent { key: Key; name: string; weight: number; score: number; detail: string; available: boolean }
export interface PpiResult {
  score: number; level: string; color: string; action: string; band_deploy_pct: number;
  components: PpiComponent[];
}

function scoreMri(spy: number[]): { score: number; detail: string } {
  if (spy.length < 252) return { score: 50, detail: "insufficient data" };
  const cur12m = spy[spy.length - 1] / spy[spy.length - 252] - 1;
  const totalReturn = spy[spy.length - 1] / spy[0] - 1;
  const nYears = spy.length / 252;
  const avgAnnual = Math.pow(1 + totalReturn, 1 / Math.max(nYears, 0.5)) - 1;
  const dr: number[] = []; for (let i = 1; i < spy.length; i++) dr.push((spy[i] - spy[i - 1]) / spy[i - 1]);
  const mean = dr.reduce((a, b) => a + b, 0) / dr.length;
  const annualVol = Math.sqrt(dr.reduce((a, r) => a + (r - mean) ** 2, 0) / dr.length) * Math.sqrt(252); // population std
  const mri = (cur12m - avgAnnual) / Math.max(annualVol, 0.01);
  return { score: clip(50 + mri * 20), detail: `12m ${(cur12m * 100 >= 0 ? "+" : "")}${(cur12m * 100).toFixed(1)}%, MRI ${mri >= 0 ? "+" : ""}${mri.toFixed(2)}` };
}

function scoreRsi14(spy: number[]): { score: number; detail: string } {
  if (spy.length < 30) return { score: 50, detail: "insufficient data" };
  const rsi = computeRSI(spy, 14);
  const recent = rsi.slice(-10).filter((x): x is number => x != null);
  if (!recent.length) return { score: 50, detail: "no RSI values" };
  const current = recent[recent.length - 1];
  const daysAbove = recent.filter((x) => x > 70).length;
  let score = daysAbove * 10;
  if (current > 80) score = Math.min(score + 20, 100);
  return { score, detail: `RSI14 ${current.toFixed(1)}, days>70: ${daysAbove}/10` };
}

function scoreRsi2(spy: number[]): { score: number; detail: string } {
  if (spy.length < 10) return { score: 50, detail: "insufficient data" };
  const rsi2 = computeRSI(spy, 2).filter((x): x is number => x != null);
  if (!rsi2.length) return { score: 50, detail: "RSI-2 all NaN" };
  const current = rsi2[rsi2.length - 1];
  return { score: clip(current), detail: `RSI2 ${current.toFixed(1)}` };
}

function scoreVix(vix: number[] | null): { score: number; detail: string } {
  if (!vix || vix.length < 20) return { score: 50, detail: "no VIX data" };
  const current = vix[vix.length - 1];
  const v5 = vix.length >= 5 ? vix[vix.length - 5] : current;
  const chg = (current - v5) / Math.max(v5, 0.01);
  let base: number;
  if (current < 14) base = 55; else if (current < 20) base = 30; else if (current < 30) base = 50; else base = 80;
  if (current < 20 && chg > 0.15) base += 20; else if (chg > 0.30) base += 15;
  return { score: clip(base), detail: `VIX ${current.toFixed(1)}, 5d ${chg * 100 >= 0 ? "+" : ""}${(chg * 100).toFixed(1)}%` };
}

function scoreVvix(vvix: number[] | null): { score: number; detail: string } {
  if (!vvix || !vvix.length) return { score: 50, detail: "no VVIX data" };
  const current = vvix[vvix.length - 1];
  let score: number;
  if (current > 130) score = 90; else if (current > 120) score = 75; else if (current > 100) score = 55; else if (current > 80) score = 35; else score = 45;
  return { score, detail: `VVIX ${current.toFixed(1)}` };
}

// breadthPct: % of baked universe above its 50-SMA (0–100), or null if unavailable.
function scoreBreadth(breadthPct: number | null): { score: number; detail: string } {
  if (breadthPct == null) return { score: 50, detail: "breadth unavailable" };
  const pct = breadthPct / 100;
  let score: number;
  if (pct > 0.70) score = 20; else if (pct > 0.55) score = 35; else if (pct > 0.40) score = 55; else if (pct > 0.25) score = 75; else score = 90;
  return { score, detail: `${breadthPct.toFixed(0)}% above 50-SMA (baked universe)` };
}

function scoreDrawdown(spy: number[]): { score: number; detail: string } {
  if (spy.length < 252) return { score: 50, detail: "insufficient data" };
  const window = spy.slice(-252);
  const high = Math.max(...window);
  const current = spy[spy.length - 1];
  const dd = (current - high) / high;
  let score: number;
  if (dd > -0.02) score = 45; else if (dd > -0.05) score = 55; else if (dd > -0.10) score = 70; else if (dd > -0.15) score = 80; else if (dd > -0.20) score = 90; else score = 95;
  return { score, detail: `${dd * 100 >= 0 ? "+" : ""}${(dd * 100).toFixed(1)}% from 52w high` };
}

export function computePpi(
  spy: number[] | null | undefined, vix: number[] | null | undefined, vvix: number[] | null | undefined,
  breadthPct: number | null,
): PpiResult | null {
  if (!spy || spy.length < 30) return null;
  const raw: Record<Key, { score: number; detail: string }> = {
    mri: scoreMri(spy),
    rsi14_sustained: scoreRsi14(spy),
    rsi2_extreme: scoreRsi2(spy),
    vix_structure: scoreVix(vix ?? null),
    vvix_spike: scoreVvix(vvix ?? null),
    breadth: scoreBreadth(breadthPct),
    drawdown_from_peak: scoreDrawdown(spy),
  };
  // All components contribute (neutral-50 fallback already applied per-component).
  const keys = Object.keys(PPI_WEIGHTS) as Key[];
  const score = keys.reduce((a, k) => a + raw[k].score * PPI_WEIGHTS[k], 0);

  let level: string, color: string, action: string, band: number;
  if (score < 20) { level = "LOW"; color = SEM.pos; action = "Market healthy. Deploy normally."; band = 100; }
  else if (score < 40) { level = "MODERATE"; color = SEM.posSoft; action = "Normal fluctuation. No timing concern."; band = 100; }
  else if (score < 60) { level = "ELEVATED"; color = SEM.warnHot; action = "Consider scaling in vs full deployment."; band = 50; }
  else if (score < 80) { level = "HIGH"; color = SEM.neg; action = "Delay new deployment. Pullback likely."; band = 25; }
  else { level = "EXTREME"; color = SEM.negDeep; action = "Active correction. Wait for resolution."; band = 0; }

  const components: PpiComponent[] = keys.map((k) => ({
    key: k, name: NICE[k], weight: PPI_WEIGHTS[k], score: Math.round(raw[k].score), detail: raw[k].detail,
    available: !raw[k].detail.includes("unavailable") && !raw[k].detail.includes("no ") && !raw[k].detail.includes("insufficient"),
  }));

  return { score: Math.round(score * 10) / 10, level, color, action, band_deploy_pct: band, components };
}
