import { useEffect, useState } from "react";
import { useStore } from "../store";
import { Card } from "./ui";
import { loadDataJSON } from "../lib/data";

// AI Anomaly Watch: stocks whose quant pillars most diverge (strong momentum vs weak valuation, etc.)
// with an LLM thesis-risk note. Fed only the pillar grades — never invents (anomalies.json).
const BASE = `${import.meta.env.BASE_URL}data`;
interface Anom { ticker: string; name: string; sector: string; composite: number; strong: string; weak: string; rating?: string; warning: string }
let cache: { anomalies: Anom[] } | null = null;

export default function AnomalyCallouts() {
  const { goToDetail } = useStore();
  const [data, setData] = useState<{ anomalies: Anom[] } | null>(cache);
  useEffect(() => {
    if (cache) return;
    loadDataJSON<{ anomalies: Anom[] }>("anomalies.json").then((j) => { cache = j; setData(j); });
  }, []);

  const list = (data?.anomalies ?? []).filter((a) => a.warning);
  if (!list.length) return null;

  return (
    <Card title="AI Anomaly Watch" sub="Names whose quant pillars most diverge — the “is this sustainable / value trap?” tensions, with the risk to watch. Fed only pillar grades.">
      <div className="space-y-2.5">
        {list.slice(0, 12).map((a) => (
          <div key={a.ticker} className="border-b border-line-faint pb-2 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button onClick={() => goToDetail(a.ticker)} className="font-semibold text-link hover:underline">{a.ticker}</button>
              <span className="text-ink-3">{a.name}</span>
              <span className="rounded-sm bg-link/15 px-1.5 py-0.5 text-[10px] font-medium text-link/75">↑ {a.strong} · ↓ {a.weak}</span>
              <span className="text-[11px] text-mute">score {a.composite}</span>
            </div>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{a.warning}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
