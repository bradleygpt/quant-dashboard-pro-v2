// Faithful port of suggestions_v2.generate_suggestions_v2 — prescriptive,
// actionable portfolio recommendations. Built from the (parity-gated) analyze
// output + the scored universe. Deterministic.
import type { ViewRow } from "../store";
import type { PortfolioAnalysis } from "./portfolio";
import { INK, SEM } from "../theme";

const CONC_WARN = 15, CONC_CRIT = 25, DEAD = 1.0, SEC_WARN = 40, SEC_CRIT = 60, TAX = -10, MOM_EXIT = -15;

export interface Suggestion {
  type: "critical" | "warning" | "info" | "opportunity";
  priority: number; category: string; title: string; action: string; reasoning: string;
}
const TYPE_COLOR: Record<string, string> = { critical: "#DC2626", warning: "#F97316", info: "#EAB308", opportunity: SEM.pos };
const TYPE_ICON: Record<string, string> = { critical: "⚠", warning: "▲", info: "ℹ", opportunity: "✚" };
export const sugColor = (t: string) => TYPE_COLOR[t] ?? INK.ink3;
export const sugIcon = (t: string) => TYPE_ICON[t] ?? "•";

const money = (v: number) => `$${Math.round(v).toLocaleString()}`;

export function generateSuggestions(analysis: PortfolioAnalysis, rows: ViewRow[], maxSuggestions = 12): Suggestion[] {
  const s: Suggestion[] = [];
  const total = analysis.total_value;
  const stocks = analysis.positions.filter((p) => p.type === "stock");
  const held = new Set(analysis.positions.map((p) => p.ticker));
  const byTicker = new Map(rows.map((r) => [r.ticker, r]));

  // 1. concentration
  for (const p of analysis.positions) {
    const w = (p.weight ?? 0) * 100, mv = p.market_value ?? 0;
    if (w >= CONC_CRIT) {
      const tgt = total * 0.15, sell = mv - tgt, sh = p.price ? sell / p.price : 0;
      s.push({ type: "critical", priority: 1, category: "concentration", title: `TRIM ${p.ticker}: ${w.toFixed(1)}% is too concentrated`, action: `Sell ~${sh.toFixed(0)} shares (~${money(sell)})`, reasoning: `Single position exceeds ${CONC_CRIT}%. A 20% drawdown would cost ${money(mv * 0.2)}. Trim to 15%.` });
    } else if (w >= CONC_WARN) {
      s.push({ type: "warning", priority: 2, category: "concentration", title: `MONITOR ${p.ticker}: ${w.toFixed(1)}% concentration`, action: "Watch carefully; consider trimming on strength.", reasoning: `Position is ${w.toFixed(0)}% of portfolio. Not critical yet but warrants attention.` });
    }
  }
  // 2. dead weight
  const dead = analysis.positions.filter((p) => (p.weight ?? 0) * 100 < DEAD);
  if (dead.length >= 3) {
    const tot = dead.reduce((a, p) => a + (p.market_value ?? 0), 0);
    s.push({ type: "info", priority: 3, category: "consolidation", title: `CONSOLIDATE: ${dead.length} positions under ${DEAD}% each`, action: `Build to 5%+ or sell. Combined value: ${money(tot)}`, reasoning: `${dead.map((d) => d.ticker).join(", ")} add complexity without meaningful impact.` });
  } else for (const p of dead) {
    s.push({ type: "info", priority: 4, category: "consolidation", title: `DECIDE ${p.ticker}: ${((p.weight ?? 0) * 100).toFixed(2)}%`, action: `Build to 5%+ or exit. Currently ${money(p.market_value ?? 0)}.`, reasoning: "Position too small to matter. Commit or move on." });
  }
  // 3. sector concentration
  for (const [sector, d] of Object.entries(analysis.sector_weights)) {
    if (sector === "ETF") continue;
    const pct = d.weight * 100;
    if (pct >= SEC_CRIT) {
      const top = stocks.filter((p) => p.sector === sector).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 3).map((p) => p.ticker);
      s.push({ type: "critical", priority: 1, category: "sector", title: `REDUCE ${sector} exposure: ${pct.toFixed(0)}%`, action: `Trim largest ${sector}: ${top.join(", ")}`, reasoning: `Sector over ${SEC_CRIT}% creates macro risk. Target 30–45%.` });
    } else if (pct >= SEC_WARN) {
      s.push({ type: "warning", priority: 3, category: "sector", title: `HIGH ${sector} weight: ${pct.toFixed(0)}%`, action: `Diversify away from ${sector} on strength`, reasoning: `Above ${SEC_WARN}% in one sector reduces diversification.` });
    }
  }
  // 4. tax loss
  for (const p of stocks) {
    if (p.gain_pct != null && p.gain_pct <= TAX) {
      const loss = (p.cost_basis ?? 0) * p.shares - (p.market_value ?? 0);
      const sell = p.rating === "Strong Sell" || p.rating === "Sell";
      s.push({ type: "opportunity", priority: sell ? 2 : 3, category: "tax_loss", title: `TAX LOSS: ${p.ticker} down ${p.gain_pct.toFixed(1)}%`,
        action: sell ? `SELL ${p.ticker}: harvest ~${money(loss)} loss AND exit weak position` : `Consider harvesting ${money(loss)} loss on ${p.ticker}`,
        reasoning: sell ? `Down ${p.gain_pct.toFixed(1)}% AND rated ${p.rating}. Double reason to sell.` : `Down ${p.gain_pct.toFixed(1)}%. Sell + rebuy after 31 days to lock tax benefit.` });
    }
  }
  // 5. momentum exit
  for (const p of stocks) {
    const m3 = byTicker.get(p.ticker)?.raw.momentum_3m;
    if (m3 != null) {
      const pct = m3 * 100;
      if (pct <= MOM_EXIT && ["Sell", "Strong Sell", "Hold"].includes(p.rating)) {
        s.push({ type: "warning", priority: 2, category: "momentum_exit", title: `MOMENTUM BREAKDOWN: ${p.ticker}`, action: `Consider exiting ${p.ticker} (down ${pct.toFixed(0)}% in 3M)`, reasoning: `${p.ticker} rated ${p.rating} with deteriorating 3-month momentum (${pct.toFixed(0)}%).` });
      }
    }
  }
  // 6. specific buys (Strong Buy not held)
  const strongBuys = rows.filter((r) => r.rating === "Strong Buy" && !held.has(r.ticker) && r.sector !== "ETF");
  const portSectors = new Set(stocks.map((p) => p.sector));
  const under = strongBuys.filter((r) => !portSectors.has(r.sector)).slice(0, 3);
  const over = strongBuys.filter((r) => portSectors.has(r.sector)).slice(0, 2);
  const tgtDollar = total * 0.05;
  for (const r of [...under, ...over]) {
    const isNew = !portSectors.has(r.sector);
    const sh = r.price ? tgtDollar / r.price : 0;
    s.push({ type: "opportunity", priority: isNew ? 3 : 4, category: "new_position", title: `ADD ${r.ticker}: Strong Buy${isNew ? ` (adds ${r.sector})` : ""}`,
      action: `Buy ~${sh.toFixed(0)} shares at ${money(r.price ?? 0)} = ${money(tgtDollar)} (5%)`, reasoning: `${r.name ?? r.ticker} scores ${r.composite.toFixed(1)}/12. ${isNew ? "Diversifies portfolio." : "Quality addition."}` });
  }
  // 7. weak holdings
  for (const p of stocks) {
    if (p.rating === "Strong Sell" && !s.some((x) => x.title.includes(p.ticker) && ["tax_loss", "momentum_exit"].includes(x.category))) {
      s.push({ type: "warning", priority: 2, category: "weak_holding", title: `EXIT ${p.ticker}: Strong Sell (${((p.weight ?? 0) * 100).toFixed(1)}%)`, action: `Sell ~${money(p.market_value ?? 0)} position`, reasoning: `${p.ticker} in the bottom tier (${(p.composite ?? 0).toFixed(1)}/12). Opportunity cost vs better positions.` });
    }
  }
  // 8. ETF heavy
  if (analysis.etf_weight > 60) {
    s.push({ type: "info", priority: 5, category: "etf_heavy", title: `ETF-HEAVY: ${analysis.etf_weight.toFixed(0)}% in ETFs`, action: "Consider more direct stock exposure for alpha", reasoning: "ETFs cap upside; direct quant picks can outperform." });
  }
  s.sort((a, b) => a.priority - b.priority);
  return s.slice(0, maxSuggestions);
}

// ── Monte Carlo (GBM) projection from holdings — port of portfolio.run_monte_carlo intent ──
export interface MonteCarlo { horizonDays: number; sims: number; start: number; p5: number; p25: number; p50: number; p75: number; p95: number; pGain: number; pLoss20: number; expReturnPct: number; volPct: number }
// Deterministic PRNG (mulberry32) so results are reproducible run-to-run.
function mulberry32(a: number) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(rng: () => number) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export function runMonteCarlo(analysis: PortfolioAnalysis, rows: ViewRow[], priceSeriesByTicker: Map<string, number[]>, horizonDays = 252, sims = 2000): MonteCarlo | null {
  const stocks = analysis.positions.filter((p) => p.type === "stock" && p.weight != null && (p.weight ?? 0) > 0);
  if (!stocks.length || analysis.total_value <= 0) return null;
  // per-holding daily mean/vol from baked closes; fallback to broad assumptions
  const params = stocks.map((p) => {
    const closes = priceSeriesByTicker.get(p.ticker);
    let mu = 0.0003, sigma = 0.02; // defaults (~8%/yr, 32% vol)
    if (closes && closes.length > 30) {
      const rets: number[] = []; for (let i = 1; i < closes.length; i++) rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      const m = rets.reduce((a, b) => a + b, 0) / rets.length;
      const sd = Math.sqrt(rets.reduce((a, r) => a + (r - m) ** 2, 0) / (rets.length - 1));
      mu = Math.max(-0.001, Math.min(0.002, m)); sigma = Math.max(0.005, Math.min(0.06, sd));
    }
    return { w: p.weight!, mu, sigma };
  });
  const wsum = params.reduce((a, p) => a + p.w, 0);
  const rng = mulberry32(20260603);
  const finals: number[] = [];
  for (let s = 0; s < sims; s++) {
    let port = 0;
    for (const p of params) {
      // GBM with daily drift/vol over horizon (single shock approximation per step folded)
      let logRet = 0;
      for (let d = 0; d < horizonDays; d++) logRet += (p.mu - 0.5 * p.sigma ** 2) + p.sigma * gauss(rng);
      port += (p.w / wsum) * Math.exp(logRet);
    }
    finals.push(port); // multiple of starting value
  }
  finals.sort((a, b) => a - b);
  const q = (f: number) => finals[Math.floor(f * (finals.length - 1))];
  const start = analysis.total_value;
  const pGain = finals.filter((x) => x > 1).length / finals.length * 100;
  const pLoss20 = finals.filter((x) => x < 0.8).length / finals.length * 100;
  const mean = finals.reduce((a, b) => a + b, 0) / finals.length;
  const sd = Math.sqrt(finals.reduce((a, x) => a + (x - mean) ** 2, 0) / finals.length);
  return { horizonDays, sims, start, p5: q(0.05) * start, p25: q(0.25) * start, p50: q(0.5) * start, p75: q(0.75) * start, p95: q(0.95) * start, pGain, pLoss20, expReturnPct: (mean - 1) * 100, volPct: sd * 100 };
}
