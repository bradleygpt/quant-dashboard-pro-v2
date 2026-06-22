import { useEffect, useState } from "react";
import { Card } from "./ui";

// AI Market Summary — "the universe in a paragraph" over universe-wide quant stats (universe_summary.json).
const BASE = `${import.meta.env.BASE_URL}data`;
let cache: { summary?: string; generated_at?: string } | null = null;

export default function UniverseSummary() {
  const [d, setD] = useState(cache);
  useEffect(() => {
    if (cache) return;
    fetch(`${BASE}/universe_summary.json`).then((r) => (r.ok ? r.json() : null)).then((j) => { cache = j; setD(j); }).catch(() => {});
  }, []);
  if (!d?.summary) return null;
  return (
    <Card title="AI Market Summary" sub={`The universe in a paragraph · ${d.generated_at ?? ""}`}>
      <p className="text-sm leading-relaxed text-[#C3CAD7]">{d.summary}</p>
    </Card>
  );
}
