import { useEffect, useState } from "react";
import { Card } from "./ui";
import { loadDataJSON } from "../lib/data";
import { SEM } from "../theme";

// AI Market Summary — "the universe in a paragraph" over universe-wide quant stats
// (universe_summary.json, baked weekly by ops/etf_lookthrough_weekly.ps1 on the quant
// machine — zero-cost local Ollama, never per-visitor generation). S4: generation
// failure keeps last-good content; staleness past 10 days badges loudly (weekly
// cadence budget + slack) instead of letting an old paragraph read as current.
let cache: { summary?: string; generated_at?: string } | null = null;

export default function UniverseSummary() {
  const [d, setD] = useState(cache);
  useEffect(() => {
    if (cache) return;
    loadDataJSON<any>("universe_summary.json").then((j) => { cache = j; setD(j); });
  }, []);
  if (!d?.summary) return null;
  const ageDays = d.generated_at ? (Date.now() - Date.parse(d.generated_at)) / 86_400_000 : null;
  const stale = ageDays != null && ageDays > 10;
  return (
    <Card title="AI Market Summary" sub={`The universe in a paragraph · as of ${d.generated_at ?? "?"} · weekly refresh`}>
      {stale && (
        <div className="mb-2 inline-block rounded border px-2 py-0.5 text-[11px] font-semibold" style={{ color: SEM.warn, borderColor: SEM.warn }}>
          STALE — last generated {d.generated_at} ({Math.floor(ageDays!)} days ago); the weekly refresh has missed at least one cycle
        </div>
      )}
      <p className="text-sm leading-relaxed text-ink-2">{d.summary}</p>
    </Card>
  );
}
