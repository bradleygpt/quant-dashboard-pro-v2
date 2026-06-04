// Faithful port of portfolio.run_monte_carlo (GBM with mean reversion, return
// caps, 0.45 cross-correlation, and macro scenario adjustment). Per-holding
// expected return / vol come from _estimate_holding_params, with momentum_1m/3m/
// 6m/12m derived from the baked per-holding close series (the same trailing
// returns the source pipeline computes upstream from prices).
import type { Position } from "./portfolio";
import type { ViewRow } from "../store";

const LONG_TERM_EQUITY_PREMIUM = 0.10;
const LONG_TERM_SMALL_CAP_PREMIUM = 0.12;
const LONG_TERM_SPECULATIVE_PREMIUM = 0.08;
const MAX_ANNUAL_RETURN = 0.40;
const MIN_ANNUAL_RETURN = -0.30;
const MEAN_REVERSION_WEIGHT = 0.60;
const VOL_FLOORS = { large: 0.20, mid: 0.30, small: 0.45, micro: 0.60, etf: 0.15 };
const SCENARIO_ADJ: Record<string, number> = { Bull: 0.08, Base: 0.0, Bear: -0.12 };

export type Scenario = "Blended" | "Bull" | "Base" | "Bear";
export interface McHoldingDetail { ticker: string; expReturnPct: number; volPct: number; weightPct: number }
export interface McFanPoint { day: number; p5: number; p25: number; p50: number; p75: number; p95: number }
export interface MonteCarlo {
  totalValue: number; sims: number; horizonDays: number; scenario: Scenario;
  expReturnPct: number; volPct: number;
  pPositive: number; pGain20: number; pGain50: number; pLoss10: number; pLoss20: number;
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  fan: McFanPoint[]; holdingDetails: McHoldingDetail[];
  modelParams: { meanReversionWeight: number; maxAnnualReturnCap: number; longTermPremium: number; avgCorrelation: number; scenarioAdjustmentPct: number };
}

function mulberry32(a: number) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(rng: () => number) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const pct = (sorted: number[], p: number) => { const i = (p / 100) * (sorted.length - 1); const lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

function momentum(closes: number[] | undefined, k: number): number | null {
  if (!closes || closes.length <= k) return null;
  const a = closes[closes.length - 1 - k], b = closes[closes.length - 1];
  return a > 0 ? b / a - 1 : null;
}

// portfolio._estimate_holding_params
function estimateParams(closes: number[] | undefined, mcapB: number | null, isEtf: boolean): { expRet: number; vol: number } {
  const m1 = momentum(closes, 21), m3 = momentum(closes, 63), m6 = momentum(closes, 126), m12 = momentum(closes, 252);
  let trailing: number;
  if (m12 != null) trailing = m12;
  else if (m6 != null) trailing = m6 * 2;
  else if (m3 != null) trailing = m3 * 4;
  else trailing = LONG_TERM_EQUITY_PREMIUM;

  let lt: number;
  if (isEtf) lt = LONG_TERM_EQUITY_PREMIUM;
  else if (mcapB != null && mcapB < 5) lt = LONG_TERM_SPECULATIVE_PREMIUM;
  else if (mcapB != null && mcapB < 20) lt = LONG_TERM_SMALL_CAP_PREMIUM;
  else lt = LONG_TERM_EQUITY_PREMIUM;

  let expRet = MEAN_REVERSION_WEIGHT * lt + (1 - MEAN_REVERSION_WEIGHT) * trailing;
  expRet = Math.max(MIN_ANNUAL_RETURN, Math.min(MAX_ANNUAL_RETURN, expRet));

  const periodRets: number[] = [];
  if (m1 != null) periodRets.push(m1 * 12);
  if (m3 != null) periodRets.push(m3 * 4);
  if (m6 != null) periodRets.push(m6 * 2);
  if (m12 != null) periodRets.push(m12);
  let vol: number;
  if (periodRets.length >= 2) {
    const mean = periodRets.reduce((a, b) => a + b, 0) / periodRets.length;
    const std = Math.sqrt(periodRets.reduce((a, r) => a + (r - mean) ** 2, 0) / periodRets.length); // population std (np.std)
    const avgAbs = periodRets.reduce((a, r) => a + Math.abs(r), 0) / periodRets.length;
    vol = Math.max(std, avgAbs * 0.5);
  } else vol = 0.30;
  if (isEtf) vol = Math.max(vol, VOL_FLOORS.etf);
  else if (mcapB != null && mcapB >= 50) vol = Math.max(vol, VOL_FLOORS.large);
  else if (mcapB != null && mcapB >= 10) vol = Math.max(vol, VOL_FLOORS.mid);
  else if (mcapB != null && mcapB >= 2) vol = Math.max(vol, VOL_FLOORS.small);
  else vol = Math.max(vol, VOL_FLOORS.micro);
  vol = Math.min(vol, 1.0);
  return { expRet, vol };
}

export function runMonteCarlo(
  positions: Position[], totalValue: number, byTicker: Map<string, ViewRow>, priceMap: Map<string, number[]>,
  opts: { sims?: number; horizonDays?: number; scenario?: Scenario } = {},
): MonteCarlo | null {
  const sims = opts.sims ?? 5000, nDays = opts.horizonDays ?? 252, scenario = opts.scenario ?? "Blended";
  const held = positions.filter((p) => p.weight != null && p.weight > 0);
  if (!held.length || totalValue <= 0) return null;

  const weights = held.map((p) => p.weight!);
  const details = held.map((p) => {
    const mcapB = byTicker.get(p.ticker)?.marketCapB ?? null;
    const { expRet, vol } = estimateParams(priceMap.get(p.ticker), mcapB, p.type === "etf");
    return { ticker: p.ticker, expRet, vol, weight: p.weight! };
  });

  const portReturn = details.reduce((a, d, i) => a + weights[i] * d.expRet, 0);
  const avgCorr = 0.45;
  const wsig = details.map((d, i) => weights[i] * d.vol);
  const sumWsig = wsig.reduce((a, b) => a + b, 0);
  const sumWsig2 = wsig.reduce((a, b) => a + b * b, 0);
  let portVol = Math.sqrt(Math.max(0, sumWsig2 + avgCorr * (sumWsig * sumWsig - sumWsig2)));
  portVol = Math.max(portVol, 0.12);

  const scenarioAdj = scenario === "Blended"
    ? 0.25 * SCENARIO_ADJ.Bull + 0.50 * SCENARIO_ADJ.Base + 0.25 * SCENARIO_ADJ.Bear
    : (SCENARIO_ADJ[scenario] ?? 0);
  const adjustedReturn = portReturn + scenarioAdj;

  const dailyMu = (adjustedReturn - 0.5 * portVol * portVol) / 252;
  const dailySigma = portVol / Math.sqrt(252);

  // sampled days for the fan chart (≤60 points incl. final day)
  const step = Math.max(1, Math.floor(nDays / 60));
  const sampleDays: number[] = [];
  for (let d = step; d < nDays; d += step) sampleDays.push(d);
  sampleDays.push(nDays);
  const bySample: number[][] = sampleDays.map(() => []);
  const sampleIdx = new Map(sampleDays.map((d, i) => [d, i]));

  const rng = mulberry32(42);
  const finals: number[] = new Array(sims);
  for (let s = 0; s < sims; s++) {
    let cum = 0;
    for (let d = 1; d <= nDays; d++) {
      cum += dailyMu + dailySigma * gauss(rng);
      const j = sampleIdx.get(d);
      if (j !== undefined) bySample[j].push(totalValue * Math.exp(cum));
    }
    finals[s] = totalValue * Math.exp(cum);
  }
  finals.sort((a, b) => a - b);
  const q = (p: number) => pct(finals, p);
  const fan: McFanPoint[] = sampleDays.map((day, i) => {
    const col = bySample[i].sort((a, b) => a - b);
    return { day, p5: pct(col, 5), p25: pct(col, 25), p50: pct(col, 50), p75: pct(col, 75), p95: pct(col, 95) };
  });

  const above = (mult: number) => finals.filter((x) => x > totalValue * mult).length / sims * 100;
  const below = (mult: number) => finals.filter((x) => x < totalValue * mult).length / sims * 100;
  const mean = finals.reduce((a, b) => a + b, 0) / sims;

  return {
    totalValue, sims, horizonDays: nDays, scenario,
    expReturnPct: Math.round(adjustedReturn * 1000) / 10,
    volPct: Math.round(portVol * 1000) / 10,
    pPositive: above(1), pGain20: above(1.20), pGain50: above(1.50), pLoss10: below(0.90), pLoss20: below(0.80),
    percentiles: { p5: q(5), p25: q(25), p50: q(50), p75: q(75), p95: q(95) },
    fan, holdingDetails: details.map((d) => ({ ticker: d.ticker, expReturnPct: Math.round(d.expRet * 1000) / 10, volPct: Math.round(d.vol * 1000) / 10, weightPct: Math.round(d.weight * 1000) / 10 })),
    modelParams: { meanReversionWeight: MEAN_REVERSION_WEIGHT, maxAnnualReturnCap: MAX_ANNUAL_RETURN, longTermPremium: LONG_TERM_EQUITY_PREMIUM, avgCorrelation: avgCorr, scenarioAdjustmentPct: Math.round(scenarioAdj * 1000) / 10 },
  };
}
