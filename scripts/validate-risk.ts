// Parity gate for the risk-metrics TS port vs risk_metrics.py, on identical
// baked close series. Run: node --experimental-strip-types scripts/validate-risk.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeRisk } from "../src/lib/risk.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "public", "data");
const oracle = JSON.parse(readFileSync(join(here, "risk_oracle.json"), "utf8"));

let exact = 0, near = 0, fails = 0; const msgs: string[] = [];
const cmp = (label: string, a: number | null, b: number | null) => {
  if (a == null && b == null) { exact++; return; }
  if (a == null || b == null) { fails++; msgs.push(`${label}: ts=${a} py=${b}`); return; }
  const d = Math.abs(a - b);
  if (d < 1e-9) exact++;
  else if (d <= 1e-6 * Math.max(1, Math.abs(b))) near++;
  else { fails++; msgs.push(`${label}: ts=${a} py=${b} Δ=${d.toExponential(2)}`); }
};

for (const [t, exp] of Object.entries<any>(oracle)) {
  const closes = JSON.parse(readFileSync(join(dataDir, "prices", `${t}.json`), "utf8")).close;
  const g = computeRisk(closes)!;
  cmp(`${t}.cagr`, g.cagr_pct, exp.cagr_pct);
  cmp(`${t}.sharpe`, g.sharpe, exp.sharpe);
  cmp(`${t}.sortino`, g.sortino, exp.sortino);
  cmp(`${t}.calmar`, g.calmar, exp.calmar);
  cmp(`${t}.maxdd`, g.max_drawdown_pct, exp.max_drawdown_pct);
  cmp(`${t}.vol`, g.volatility_pct, exp.volatility_pct);
  cmp(`${t}.curdd`, g.current_drawdown_pct, exp.current_drawdown_pct);
}
console.log(`exact=${exact}  near(≤1e-6 rel)=${near}  MISMATCH=${fails}`);
if (msgs.length) { console.log("findings:"); msgs.slice(0, 20).forEach((m) => console.log("  " + m)); }
console.log(fails === 0 ? "RISK PARITY PASSED ✅" : `${fails} mismatches ❌`);
process.exit(fails === 0 ? 0 : 1);
