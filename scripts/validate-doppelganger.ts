// Parity gate for the Doppelganger TS port vs the Python oracle.
// Run: node --experimental-strip-types scripts/validate-doppelganger.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { findDoppelgangers, aggregateForwardReturns, type DoppelDB } from "../src/lib/doppelganger.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "public", "data");
const J = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const oracle = J(join(here, "doppelganger_oracle.json"));
const db = J(join(dataDir, "doppelganger.json")) as DoppelDB;
const uni = J(join(dataDir, "universe_floor0.json"));
const byTicker = new Map<string, any>(uni.rows.map((r: any) => [r.ticker, { ...r, composite: r.byPreset.equal.c, rating: r.byPreset.equal.r }]));

let exact = 0, fails = 0; const msgs: string[] = [];
const cmp = (label: string, a: any, b: any) => {
  if (a === b) { exact++; return; }
  if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= 1e-9) { exact++; return; }
  fails++; if (msgs.length < 40) msgs.push(`${label}: ts=${JSON.stringify(a)} py=${JSON.stringify(b)}`);
};

for (const c of oracle.cases) {
  const row = byTicker.get(c.ticker);
  const L = `${c.ticker}/${c.opts.sector_filter}/dedupe=${c.opts.dedupe_eras}/tag=${c.opts.tag_filter}`;
  if (!row) { fails++; msgs.push(`${L}: ticker missing in universe`); continue; }
  const got = findDoppelgangers(row, db, {
    topN: 5, sectorFilter: c.opts.sector_filter, tagFilter: c.opts.tag_filter, dedupeEras: c.opts.dedupe_eras,
  });
  cmp(`${L}.nMatches`, got.length, c.matches.length);
  const n = Math.min(got.length, c.matches.length);
  for (let i = 0; i < n; i++) {
    cmp(`${L}[${i}].key`, got[i].match_key, c.matches[i].match_key);
    cmp(`${L}[${i}].sim`, got[i].similarity, c.matches[i].similarity);
    cmp(`${L}[${i}].bucket`, got[i].era_bucket, c.matches[i].era_bucket);
    cmp(`${L}[${i}].same_sector`, got[i].same_sector, c.matches[i].same_sector);
  }
  const agg = aggregateForwardReturns(got, db.forward_returns);
  if (c.agg == null) cmp(`${L}.agg`, agg, null);
  else if (!agg) { fails++; msgs.push(`${L}.agg: ts null, py present`); }
  else for (const k of ["weighted_1yr_pct", "weighted_3yr_pct", "weighted_5yr_pct", "median_1yr_pct", "best_1yr", "worst_1yr", "contributing_count", "missing_count"])
    cmp(`${L}.agg.${k}`, (agg as any)[k], c.agg[k]);
}

console.log(`exact=${exact}  MISMATCH=${fails}`);
if (msgs.length) { console.log("\nfindings:"); for (const m of msgs) console.log("  " + m); }
console.log(fails === 0 ? "\nDOPPELGANGER PARITY PASSED ✅" : `\n${fails} mismatches ❌`);
process.exit(fails === 0 ? 0 : 1);
