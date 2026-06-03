// Parity gate for the interactive portfolio analytics. Diffs the TS port
// (src/lib/portfolio.ts) against the Python oracle (bake/portfolio_oracle.py)
// on identical inputs. Rounded fields must match EXACTLY; unrounded
// intermediates may differ within a tiny tolerance (sum-order ULP).
// Run: node --experimental-strip-types scripts/validate-portfolio.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analyzePortfolio, buildOptimalPortfolio, type Aggressiveness, type RawRef } from "../src/lib/portfolio.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "public", "data");
const J = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const oracle = J(join(here, "portfolio_oracle.json"));
const uni: Record<string, any> = {
  "0": J(join(dataDir, "universe_floor0.json")),
  "10": J(join(dataDir, "universe_floor10.json")),
};

const NEAR = 1e-9;
let exact = 0, near = 0, fails = 0, ties = 0;
const failMsgs: string[] = [];

function cmpNum(label: string, a: any, b: any) {
  if (a == null && b == null) { exact++; return; }
  if (a == null || b == null) { fails++; failMsgs.push(`${label}: null mismatch ts=${a} py=${b}`); return; }
  const d = Math.abs(a - b);
  if (d === 0) exact++;
  else if (d <= NEAR) near++;
  else { fails++; failMsgs.push(`${label}: ts=${a} py=${b} (Δ=${d.toExponential(2)})`); }
}
function cmpEq(label: string, a: any, b: any) {
  if (a === b) exact++;
  else { fails++; failMsgs.push(`${label}: ts=${JSON.stringify(a)} py=${JSON.stringify(b)}`); }
}

function rowsFor(floor: string, scheme: string) {
  return uni[floor].rows.map((r: any) => ({
    ...r, composite: r.byPreset[scheme].c, rating: r.byPreset[scheme].r,
  }));
}
// raw cache = full universe (floor 0) — gives sector/price for sub-floor holdings
const rawByTicker = new Map<string, RawRef>(
  uni["0"].rows.map((r: any) => [r.ticker, { sector: r.sector, price: r.price, isEtf: r.sector === "ETF" }]),
);

for (const [ctxKey, ctx] of Object.entries<any>(oracle.contexts)) {
  const li = ctxKey.lastIndexOf("_");
  const scheme = ctxKey.slice(0, li), floor = ctxKey.slice(li + 1);
  const rows = rowsFor(floor, scheme);
  const byTicker = new Map(rows.map((r: any) => [r.ticker, r]));

  // ── analyze ──
  for (const t of ctx.analyze) {
    const got = analyzePortfolio(t.holdings, byTicker as any, rows, rawByTicker);
    const exp = t.result;
    const L = `${ctxKey}/analyze/${t.id}`;
    if (!got) { if (!exp.error) { fails++; failMsgs.push(`${L}: TS null, PY ok`); } continue; }
    cmpNum(`${L}.total_value`, got.total_value, exp.total_value);
    cmpEq(`${L}.num_holdings`, got.num_holdings, exp.num_holdings);
    cmpEq(`${L}.num_stocks`, got.num_stocks, exp.num_stocks);
    cmpEq(`${L}.num_etfs`, got.num_etfs, exp.num_etfs);
    cmpEq(`${L}.num_unmatched`, got.num_unmatched, exp.num_unmatched);
    cmpEq(`${L}.unmatched`, [...got.unmatched_tickers].sort().join(","), [...exp.unmatched_tickers].sort().join(","));
    cmpNum(`${L}.stock_weight`, got.stock_weight, exp.stock_weight);
    cmpNum(`${L}.etf_weight`, got.etf_weight, exp.etf_weight);
    cmpNum(`${L}.weighted_composite`, got.weighted_composite, exp.weighted_composite);
    cmpEq(`${L}.weighted_rating`, got.weighted_rating, exp.weighted_rating);
    cmpNum(`${L}.hhi`, got.hhi, exp.hhi);
    cmpEq(`${L}.concentration`, got.concentration_level, exp.concentration_level);
    for (const pk of Object.keys(exp.pillar_scores)) cmpNum(`${L}.pillar.${pk}`, got.pillar_scores[pk], exp.pillar_scores[pk]);
    for (const rk of Object.keys(exp.rating_distribution)) cmpNum(`${L}.ratingdist.${rk}`, got.rating_distribution[rk], exp.rating_distribution[rk]);
    for (const sk of Object.keys(exp.sector_weights)) {
      const g = got.sector_weights[sk] ?? {}; const e = exp.sector_weights[sk];
      cmpNum(`${L}.sec.${sk}.weight`, g.weight, e.weight);
      cmpEq(`${L}.sec.${sk}.count`, g.count, e.count);
      cmpNum(`${L}.sec.${sk}.avg_score`, g.avg_score, e.avg_score);
    }
    for (const pk of Object.keys(exp.factor_tilts)) {
      const g = got.factor_tilts[pk] ?? {}; const e = exp.factor_tilts[pk];
      cmpNum(`${L}.tilt.${pk}.portfolio`, g.portfolio, e.portfolio);
      cmpNum(`${L}.tilt.${pk}.universe`, g.universe, e.universe);
      cmpNum(`${L}.tilt.${pk}.diff`, g.diff, e.diff);
      cmpEq(`${L}.tilt.${pk}.tilt`, g.tilt, e.tilt);
    }
    const gp = new Map(got.positions.map((p) => [p.ticker, p]));
    for (const ep of exp.positions) {
      const p = gp.get(ep.ticker); const PL = `${L}.pos.${ep.ticker}`;
      if (!p) { fails++; failMsgs.push(`${PL}: missing in TS`); continue; }
      cmpEq(`${PL}.type`, p.type, ep.type);
      cmpNum(`${PL}.market_value`, p.market_value, ep.market_value);
      cmpNum(`${PL}.weight`, p.weight, ep.weight);
      cmpNum(`${PL}.composite`, p.composite, ep.composite);
      cmpEq(`${PL}.rating`, p.rating, ep.rating);
      cmpNum(`${PL}.gain_pct`, p.gain_pct, ep.gain_pct);
    }
  }

  // ── quant ──
  for (const q of ctx.quant) {
    const got = buildOptimalPortfolio(rows, q.capital, q.aggressiveness as Aggressiveness, q.weight_scheme);
    const exp = q.positions;
    const L = `${ctxKey}/quant/${q.id}`;
    cmpEq(`${L}.count`, got.length, exp.length);
    const gp = new Map(got.map((p) => [p.ticker, p]));
    for (const ep of exp) {
      const p = gp.get(ep.ticker); const PL = `${L}.${ep.ticker}`;
      if (!p) { fails++; failMsgs.push(`${PL}: missing in TS`); continue; }
      cmpEq(`${PL}.sector`, p.sector, ep.sector);
      cmpEq(`${PL}.rating`, p.rating, ep.rating);
      cmpNum(`${PL}.composite`, p.composite_score, ep.composite_score);
      cmpNum(`${PL}.price`, p.price, ep.price);
      cmpNum(`${PL}.weight_pct`, p.weight_pct, ep.weight_pct);
      cmpNum(`${PL}.dollars`, p.dollars, ep.dollars);
      cmpNum(`${PL}.shares`, p.shares, ep.shares);
      cmpNum(`${PL}.market_cap_b`, p.market_cap_b, ep.market_cap_b);
    }
    // ordering check: a divergence is a genuine weight_pct tie iff re-sorting BOTH
    // by (weight_pct desc, ticker asc) yields the same sequence. Otherwise real fail.
    const gOrder = got.map((p) => p.ticker).join(",");
    const eOrder = exp.map((p: any) => p.ticker).join(",");
    if (gOrder !== eOrder) {
      const key = (p: any) => `${(-p.weight_pct).toFixed(6)}|${p.ticker}`;
      const gT = [...got].sort((a, b) => key(a).localeCompare(key(b))).map((p) => p.ticker).join(",");
      const eT = [...exp].sort((a: any, b: any) => key(a).localeCompare(key(b))).map((p: any) => p.ticker).join(",");
      if (gT === eT) ties++;
      else { fails++; failMsgs.push(`${L}: ORDER differs beyond ties ts=[${gOrder}] py=[${eOrder}]`); }
    }
  }
}

console.log(`exact=${exact}  near(≤1e-9)=${near}  weight-tie reorderings=${ties}  MISMATCH=${fails}`);
if (failMsgs.length) { console.log("\nfindings:"); for (const m of failMsgs.slice(0, 60)) console.log("  " + m); }
console.log(fails === 0
  ? `\nPORTFOLIO PARITY PASSED ✅  (${ties} m_heavy weight-tie reorderings = source-inherent pandas sort ambiguity, values identical)`
  : `\n${fails} numeric mismatches ❌`);
process.exit(fails === 0 ? 0 : 1);
