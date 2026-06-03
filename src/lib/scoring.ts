// Client-side scoring. For the three validated presets we use the AUTHORITATIVE
// composite_score + overall_rating baked from scoring.py (exact parity). This
// module re-derives them only for CUSTOM weights, faithfully reproducing
// scoring.py: composite = Σ(pillar_score × weight); Top-25 non-ETF stocks are
// tier-classified by price vs Fair Value / Quant Buy Point; the rest fall to
// Hold/Sell/Strong Sell score bands.

import type { Row, PresetName } from "./types";

export const PILLARS = ["Valuation", "Growth", "Profitability", "Momentum", "EPS Revisions"];
export const TOP_PORTFOLIO_N = 25;

// Python's round() is round-half-to-even (banker's rounding); JS Math.round is
// round-half-up. Match Python so client recompute equals scoring.py bit-for-bit.
export function pyRound(x: number, nd: number): number {
  if (!Number.isFinite(x)) return x;
  const m = Math.pow(10, nd);
  const y = x * m;
  const floor = Math.floor(y);
  const frac = y - floor;
  let r: number;
  if (frac === 0.5) r = floor % 2 === 0 ? floor : floor + 1; // exact tie -> even
  else r = Math.round(y);
  return r / m;
}
export const pyRound2 = (x: number): number => pyRound(x, 2);

export function composite(row: Row, weights: Record<string, number>): number {
  let sum = 0;
  for (const p of PILLARS) sum += (row.pillars[p] ?? 0) * (weights[p] ?? 0);
  return pyRound2(sum);
}

// scoring.py _score_to_rating_band_capped_at_hold
function scoreBand(score: number): string {
  if (!Number.isFinite(score)) return "Hold";
  if (score >= 6.0) return "Hold";
  if (score >= 5.0) return "Sell";
  return "Strong Sell";
}

// scoring.py _classify_top25_tier (fv/qbp already computed in bake)
function classifyTier(price: number | null, fv: number | null, qbp: number | null): string {
  if (!price || price <= 0) return "Buy";
  if (fv == null) return "Buy";
  if (price > fv) return "Buy";
  if (qbp == null || price > qbp) return "Strong Buy";
  return "Strong Buy+";
}

export interface Scored {
  composite: number;
  rating: string;
}

/** Returns a map ticker -> {composite, rating} for the given weights. */
export function scoreUniverse(rows: Row[], weights: Record<string, number>): Map<string, Scored> {
  const out = new Map<string, Scored>();
  // composite for all
  const comp = new Map<string, number>();
  for (const r of rows) comp.set(r.ticker, composite(r, weights));
  // base band rating
  for (const r of rows) out.set(r.ticker, { composite: comp.get(r.ticker)!, rating: scoreBand(comp.get(r.ticker)!) });
  // top-25 non-ETF by composite get tier classification
  const stocks = rows.filter((r) => r.sector !== "ETF");
  stocks.sort((a, b) => (comp.get(b.ticker)! - comp.get(a.ticker)!));
  const top = stocks.slice(0, Math.min(TOP_PORTFOLIO_N, stocks.length));
  for (const r of top) {
    out.set(r.ticker, { composite: comp.get(r.ticker)!, rating: classifyTier(r.price, r.fv, r.qbp) });
  }
  return out;
}

/** Resolve composite+rating for a preset: authoritative when validated, else recompute. */
export function resolveScores(
  rows: Row[],
  preset: PresetName | "Custom",
  customWeights: Record<string, number>,
): Map<string, Scored> {
  if (preset !== "Custom") {
    const m = new Map<string, Scored>();
    for (const r of rows) {
      const cell = r.byPreset[preset];
      m.set(r.ticker, { composite: cell?.c ?? 0, rating: cell?.r ?? "Hold" });
    }
    return m;
  }
  return scoreUniverse(rows, customWeights);
}
