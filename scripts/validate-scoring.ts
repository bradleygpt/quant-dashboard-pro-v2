// Parity gate: the client-side scoreUniverse() (used for Custom weights) must
// reproduce the AUTHORITATIVE baked composite_score + overall_rating for the
// three validated presets at every floor. Run: node --experimental-strip-types
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scoreUniverse } from "../src/lib/scoring.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "public", "data");
const meta = JSON.parse(readFileSync(join(dataDir, "meta.json"), "utf8"));

let failures = 0;
for (const floor of meta.floors) {
  const uni = JSON.parse(readFileSync(join(dataDir, `universe_floor${floor}.json`), "utf8"));
  const rows = uni.rows;
  for (const preset of Object.keys(meta.presets)) {
    const weights = meta.presets[preset].weights;
    const got = scoreUniverse(rows, weights);
    // composite of the 25th-ranked non-ETF stock (authoritative) = tie boundary
    const stockComps = rows.filter((r: any) => r.sector !== "ETF")
      .map((r: any) => r.byPreset[preset].c).filter((c: any) => c != null)
      .sort((a: number, b: number) => b - a);
    const boundaryC = stockComps[24] ?? -Infinity;
    let cMism = 0, rMism = 0, ties = 0, firstC = "", firstR = "";
    for (const r of rows) {
      const auth = r.byPreset[preset];
      const g = got.get(r.ticker);
      if (auth.c != null && g && Math.round(g.composite * 100) !== Math.round(auth.c * 100)) {
        if (!firstC) firstC = `${r.ticker}: ts=${g.composite} auth=${auth.c}`;
        cMism++;
      }
      if (auth.r != null && g && g.rating !== auth.r) {
        // boundary tie: composite equals the 25th-place composite -> source sort is
        // non-deterministic among equal-composite stocks. Not a parity bug.
        if (auth.c != null && Math.abs(auth.c - boundaryC) < 1e-9) { ties++; continue; }
        if (!firstR) firstR = `${r.ticker}: ts=${g?.rating} auth=${auth.r}`;
        rMism++;
      }
    }
    const ok = cMism === 0 && rMism === 0;
    if (!ok) failures++;
    console.log(
      `floor ${floor} / ${preset}: composite=${cMism} rating=${rMism}${ties ? ` (+${ties} boundary-tie)` : ""} ${ok ? "✅" : "❌"}`,
      cMism ? `  e.g. ${firstC}` : "", rMism ? `  e.g. ${firstR}` : "",
    );
  }
}
console.log(failures === 0 ? "\nALL PARITY CHECKS PASSED ✅" : `\n${failures} preset/floor combos FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);
