// Faithful TS port of portfolio.analyze_portfolio and
// quant_portfolio.build_optimal_portfolio. Verified bit-for-bit against the
// Python oracle (bake/portfolio_oracle.py) — see web/scripts/validate-portfolio.ts.
//
// Parity notes (mirrors the source exactly):
//  - A holding in the scored universe is type "stock" — INCLUDING ETFs (Python's
//    `if ticker in scored_df.index` branch). Only tickers absent from the scored
//    universe but present in the raw fundamentals cache hit the ETF/"Not Scored"
//    branch (rawByTicker), where composite is null (skipped in the weighted mean)
//    but the pillar contribution is 0 (dilutes the pillar mean).
//  - All round() calls are Python round-half-to-even (pyRound).
//  - weighted_rating is computed on the UNROUNDED weighted composite; the
//    reported weighted_composite is that value rounded to 2dp.
import type { ViewRow } from "../store";
import { pyRound, pyRound2, PILLARS } from "./scoring.ts";

export interface Holding { ticker: string; shares: number; cost_basis?: number | null }
export interface RawRef { sector: string | null; price: number | null; isEtf: boolean }

export interface Position {
  ticker: string; name: string | null; shares: number; price: number | null;
  market_value: number; cost_basis?: number | null; gain_pct: number | null;
  sector: string | null; type: "stock" | "etf"; composite: number | null; rating: string;
  weight: number; pillars: Record<string, number>;
}
export interface PortfolioAnalysis {
  total_value: number;
  num_holdings: number; num_stocks: number; num_etfs: number; num_unmatched: number;
  unmatched_tickers: string[];
  stock_weight: number; etf_weight: number;
  weighted_composite: number; weighted_rating: string;
  pillar_scores: Record<string, number>;
  rating_distribution: Record<string, number>;
  sector_weights: Record<string, { weight: number; count: number; avg_score: number }>;
  hhi: number; concentration_level: string;
  factor_tilts: Record<string, { portfolio: number; universe: number; diff: number; tilt: string }>;
  positions: Position[];
}

// portfolio.py _score_to_rating_simple
function ratingSimple(s: number): string {
  if (s >= 9.0) return "Strong Buy";
  if (s >= 8.0) return "Buy";
  if (s >= 6.0) return "Hold";
  if (s >= 5.0) return "Sell";
  return "Strong Sell";
}

export function analyzePortfolio(
  holdings: Holding[],
  byTicker: Map<string, ViewRow>,
  allRows: ViewRow[],
  rawByTicker?: Map<string, RawRef>,
): PortfolioAnalysis | null {
  if (!holdings.length) return null;
  const positions: Position[] = [];
  const unmatched: string[] = [];
  // Python counts num_stocks/num_etfs by LIST membership, not by `type`:
  // matched_stocks = scored-branch holdings; matched_etfs = raw-cache-branch holdings
  // (a sub-floor "stock" lands in matched_etfs). Track the branch to match exactly.
  let nScored = 0, nRaw = 0;

  for (const h of holdings) {
    const tk = h.ticker.toUpperCase();
    const r = byTicker.get(tk);
    if (r) {
      nScored++;
      // in scored_df.index -> "stock" branch (ETFs included)
      const price = r.price ?? 0;
      const cb = h.cost_basis;
      const pillars: Record<string, number> = {};
      for (const p of PILLARS) pillars[p] = pyRound2(r.pillars[p] ?? 0);
      positions.push({
        ticker: tk, name: r.name, shares: h.shares, price: r.price, market_value: h.shares * price,
        cost_basis: cb, gain_pct: cb && cb > 0 ? (price - cb) / cb * 100 : null,
        sector: r.sector, type: "stock", composite: r.composite, rating: r.rating, weight: 0, pillars,
      });
      continue;
    }
    const raw = rawByTicker?.get(tk);
    if (raw) {
      nRaw++;
      const price = raw.price ?? 0;
      const cb = h.cost_basis;
      const pillars: Record<string, number> = {};
      for (const p of PILLARS) pillars[p] = 0;
      positions.push({
        ticker: tk, name: tk, shares: h.shares, price: raw.price, market_value: h.shares * price,
        cost_basis: cb, gain_pct: cb && cb > 0 ? (price - cb) / cb * 100 : null,
        sector: raw.sector ?? (raw.isEtf ? "ETF" : "Unknown"),
        type: raw.isEtf ? "etf" : "stock",
        composite: null, rating: raw.isEtf ? "N/A (ETF)" : "Not Scored", weight: 0, pillars,
      });
      continue;
    }
    unmatched.push(tk);
  }
  if (!positions.length) return null;

  const total = positions.reduce((a, p) => a + p.market_value, 0);
  for (const p of positions) p.weight = total > 0 ? p.market_value / total : 0;

  const stocks = positions.filter((p) => p.type === "stock");
  const stocksW = stocks.reduce((a, p) => a + p.weight, 0);
  // numerator skips null composite (pandas skipna); denominator = all stock weights
  const wcNum = stocks.reduce((a, p) => a + (p.composite != null ? p.weight * p.composite : 0), 0);
  const weightedCompositeRaw = stocks.length && stocksW > 0 ? wcNum / stocksW : 0;
  const etfW = positions.filter((p) => p.type === "etf").reduce((a, p) => a + p.weight, 0);
  const stockW = 1 - etfW;

  // pillar weighted avgs (stocks only); raw-branch pillars are 0 -> dilute
  const pillarScores: Record<string, number> = {};
  for (const pk of PILLARS) {
    pillarScores[pk] = stocks.length && stocksW > 0
      ? stocks.reduce((a, p) => a + p.weight * (p.pillars[pk] ?? 0), 0) / stocksW : 0;
  }
  // universe avgs over ALL rows (incl ETFs), rounded pillar columns
  const uniAvg: Record<string, number> = {};
  for (const pk of PILLARS) {
    let s = 0, n = 0;
    for (const r of allRows) { const v = r.pillars[pk]; if (v != null) { s += pyRound2(v); n++; } }
    uniAvg[pk] = n ? s / n : 0;
  }
  const factor: PortfolioAnalysis["factor_tilts"] = {};
  for (const pk of PILLARS) {
    const pv = pillarScores[pk], uv = uniAvg[pk], diff = pv - uv;
    factor[pk] = {
      portfolio: pyRound(pv, 1), universe: pyRound(uv, 1), diff: pyRound(diff, 1),
      tilt: diff > 1.0 ? "Overweight" : diff < -1.0 ? "Underweight" : "Neutral",
    };
  }
  // rating distribution (stocks only, by weight)
  const ratingDist: Record<string, number> = {};
  for (const p of stocks) ratingDist[p.rating] = (ratingDist[p.rating] ?? 0) + p.weight;
  // sector weights + hhi (over ALL positions)
  const secMap = new Map<string, { weight: number; count: number; scores: number[] }>();
  for (const p of positions) {
    const k = p.sector ?? "Unknown";
    const e = secMap.get(k) ?? { weight: 0, count: 0, scores: [] };
    e.weight += p.weight; e.count++; if (p.composite != null) e.scores.push(p.composite);
    secMap.set(k, e);
  }
  const sectorWeights: PortfolioAnalysis["sector_weights"] = {};
  for (const [sec, e] of [...secMap.entries()].sort((a, b) => b[1].weight - a[1].weight)) {
    sectorWeights[sec] = {
      weight: e.weight, count: e.count,
      avg_score: e.scores.length ? e.scores.reduce((a, b) => a + b, 0) / e.scores.length : 0,
    };
  }
  const hhi = [...secMap.values()].reduce((a, e) => a + e.weight * e.weight, 0);

  return {
    total_value: total,
    num_holdings: positions.length,
    num_stocks: nScored,
    num_etfs: nRaw,
    num_unmatched: unmatched.length, unmatched_tickers: unmatched,
    stock_weight: pyRound(stockW * 100, 1), etf_weight: pyRound(etfW * 100, 1),
    weighted_composite: pyRound2(weightedCompositeRaw), weighted_rating: ratingSimple(weightedCompositeRaw),
    pillar_scores: pillarScores, rating_distribution: ratingDist, sector_weights: sectorWeights,
    hhi: pyRound(hhi, 3),
    concentration_level: hhi < 0.15 ? "Diversified" : hhi < 0.25 ? "Moderate" : "Concentrated",
    factor_tilts: factor, positions,
  };
}

// ── Quant Portfolio builder ───────────────────────────────────────
export type Aggressiveness = "Conservative" | "Balanced" | "Aggressive";
const QP_PRESETS: Record<Aggressiveness, { max_positions: number; sector_cap: number; position_ceiling: number; score_floor: number; min_market_cap_b: number; weight_power: number }> = {
  Conservative: { max_positions: 30, sector_cap: 0.25, position_ceiling: 0.08, score_floor: 7.5, min_market_cap_b: 5.0, weight_power: 1.5 },
  Balanced: { max_positions: 20, sector_cap: 0.35, position_ceiling: 0.12, score_floor: 8.0, min_market_cap_b: 2.0, weight_power: 2.0 },
  Aggressive: { max_positions: 12, sector_cap: 0.50, position_ceiling: 0.20, score_floor: 8.5, min_market_cap_b: 1.0, weight_power: 2.5 },
};
function resolvePower(preset: Aggressiveness, weightScheme: string): number {
  if (weightScheme === "m_heavy") return 1.0;
  return QP_PRESETS[preset].weight_power;
}

export interface QpPosition {
  ticker: string; sector: string | null; rating: string; composite_score: number;
  price: number; weight_pct: number; dollars: number; shares: number; market_cap_b: number;
}

function selectWithSectorCap(cands: ViewRow[], maxPos: number, sectorCap: number, power: number): ViewRow[] {
  let selected = cands.slice(0, maxPos);
  for (let it = 0; it < maxPos; it++) {
    if (!selected.length) break;
    const raw = selected.map((r) => Math.pow(r.composite, power));
    const totalW = raw.reduce((a, b) => a + b, 0);
    if (totalW <= 0) break;
    const sectorTotals = new Map<string, number>();
    selected.forEach((r, i) => {
      const k = r.sector ?? "Unknown";
      sectorTotals.set(k, (sectorTotals.get(k) ?? 0) + raw[i] / totalW);
    });
    // violators sorted; pandas idxmax picks the FIRST max-labelled sector
    let worst: string | null = null, worstVal = sectorCap;
    for (const [s, v] of sectorTotals) if (v > worstVal) { worst = s; worstVal = v; }
    if (worst == null) break;
    const members = selected.filter((r) => (r.sector ?? "Unknown") === worst);
    if (members.length <= 1) break;
    // drop lowest-composite member of the worst sector (pandas idxmin = first min)
    let lowest = members[0];
    for (const r of members) if (r.composite < lowest.composite) lowest = r;
    selected = selected.filter((r) => r.ticker !== lowest.ticker);
  }
  return selected;
}

export function buildOptimalPortfolio(
  rows: ViewRow[], capital: number, preset: Aggressiveness, weightScheme: string, minPositionDollars = 200,
): QpPosition[] {
  const s = QP_PRESETS[preset];
  // dropna(required) + filters; mcap uses RAW marketCap (>= min_b * 1e9)
  let cands = rows.filter((r) =>
    r.composite != null && r.marketCap != null && r.price != null && r.sector != null &&
    r.composite >= s.score_floor && r.marketCap >= s.min_market_cap_b * 1e9 && r.price > 0);
  cands = [...cands].sort((a, b) => b.composite - a.composite).slice(0, s.max_positions * 2);
  if (!cands.length) return [];
  const power = resolvePower(preset, weightScheme);
  const selected = selectWithSectorCap(cands, s.max_positions, s.sector_cap, power);
  if (!selected.length) return [];

  // raw_weight = score^power; normalize; clip ceiling; renormalize
  let wp = selected.map((r) => Math.pow(r.composite, power));
  let tot = wp.reduce((a, b) => a + b, 0);
  wp = wp.map((w) => w / tot);
  wp = wp.map((w) => Math.min(w, s.position_ceiling));
  tot = wp.reduce((a, b) => a + b, 0);
  wp = wp.map((w) => w / tot);

  // dollars (banker's 2dp); drop sub-minimum; renormalize; dollars again
  let rec = selected.map((r, i) => ({ r, weight: wp[i], dollars: pyRound(wp[i] * capital, 2) }));
  rec = rec.filter((o) => o.dollars >= minPositionDollars);
  if (!rec.length) return [];
  const tot2 = rec.reduce((a, o) => a + o.weight, 0);
  rec = rec.map((o) => ({ ...o, weight: o.weight / tot2 }));

  const out = rec.map((o) => ({
    ticker: o.r.ticker, sector: o.r.sector, rating: o.r.rating, composite_score: o.r.composite,
    price: o.r.price!, weight_pct: pyRound(o.weight * 100, 2),
    dollars: pyRound(o.weight * capital, 2),
    shares: pyRound(pyRound(o.weight * capital, 2) / o.r.price!, 3),
    market_cap_b: pyRound((o.r.marketCap ?? 0) / 1e9, 2),
  }));
  return out.sort((a, b) => b.weight_pct - a.weight_pct);
}
