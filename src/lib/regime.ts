// Faithful ports of sentiment.compute_market_breadth + compute_fear_greed.
// Breadth is computed from the baked scored universe (client-side); fear & greed
// composites the live market payload (/api/market) with that breadth.
import type { ViewRow } from "../store";

export interface Breadth {
  pct_above_50sma: number; pct_above_200sma: number;
  pct_positive_1m: number; pct_positive_3m: number;
  buy_pct: number; sell_pct: number; breadth_score: number;
}

export function computeBreadth(rows: ViewRow[]): Breadth {
  const pctPositive = (key: string): number => {
    const vals = rows.map((r) => r.raw[key]).filter((v): v is number => v != null && Number.isFinite(v));
    return vals.length ? (vals.filter((v) => v > 0).length / vals.length) * 100 : 50;
  };
  const n = rows.length || 1;
  const a50 = pctPositive("momentum_vs_sma50");
  const a200 = pctPositive("momentum_vs_sma200");
  const p1 = pctPositive("momentum_1m");
  const p3 = pctPositive("momentum_3m");
  const buy = rows.filter((r) => r.rating === "Strong Buy" || r.rating === "Buy" || r.rating === "Strong Buy+").length / n * 100;
  const sell = rows.filter((r) => r.rating === "Sell" || r.rating === "Strong Sell").length / n * 100;
  return {
    pct_above_50sma: a50, pct_above_200sma: a200, pct_positive_1m: p1, pct_positive_3m: p3,
    buy_pct: buy, sell_pct: sell,
    breadth_score: a50 * 0.3 + a200 * 0.3 + p1 * 0.2 + p3 * 0.2,
  };
}

export interface FearGreed { score: number; classification: string; color: string }

export function computeFearGreed(
  vix: { score?: number } | null, breadth: Breadth,
  spDistancePct: number | null, buffett: { score?: number } | null,
  creditScore: number | null = null,
): FearGreed {
  const base: [number, number][] = [
    [vix?.score ?? 50, 0.25],
    [breadth.pct_above_50sma, 0.20],
    [breadth.pct_above_200sma, 0.15],
    [breadth.pct_positive_1m, 0.15],
    [Math.max(0, Math.min(100, 100 + (spDistancePct ?? 0) * 3.33)), 0.15],
    [buffett?.score ?? 50, 0.10],
  ];
  // Credit-stress (HY OAS): tight spreads = risk-on greed, wide = fear. A genuine
  // risk-appetite gauge — fold it in when available, renormalizing the existing
  // weights so the composite still sums to 1 (and stays identical when it's absent).
  let components = base;
  if (creditScore != null) {
    const cw = 0.12;
    components = base.map(([s, w]) => [s, w * (1 - cw)] as [number, number]);
    components.push([creditScore, cw]);
  }
  let composite = components.reduce((a, [s, w]) => a + s * w, 0);
  composite = Math.round(Math.max(0, Math.min(100, composite)) * 10) / 10;
  const [classification, color] =
    composite >= 80 ? ["Extreme Greed", "#00C805"] :
    composite >= 60 ? ["Greed", "#8BC34A"] :
    composite >= 45 ? ["Neutral", "#FFC107"] :
    composite >= 25 ? ["Fear", "#FF5722"] : ["Extreme Fear", "#D32F2F"];
  return { score: composite, classification, color };
}
