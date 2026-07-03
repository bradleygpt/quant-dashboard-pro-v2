import { useEffect, useState } from "react";
import { Card } from "./ui";
import { loadDataJSON } from "../lib/data";

// AI Market Summary — "the universe in a paragraph" over universe-wide quant stats (universe_summary.json).
const BASE = `${import.meta.env.BASE_URL}data`;
let cache: { summary?: string; generated_at?: string } | null = null;

export default function UniverseSummary() {
  const [d, setD] = useState(cache);
  useEffect(() => {
    if (cache) return;
    loadDataJSON<any>("universe_summary.json").then((j) => { cache = j; setD(j); });
  }, []);
  if (!d?.summary) return null;
  return (
    <Card title="AI Market Summary" sub={`The universe in a paragraph · ${d.generated_at ?? ""}`}>
      <p className="text-sm leading-relaxed text-ink-2">{d.summary}</p>
    </Card>
  );
}
