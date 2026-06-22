import { useEffect, useState } from "react";
import { useStore } from "../store";
import { Card } from "./ui";

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
    fetch(`${BASE}/anomalies.json`).then((r) => (r.ok ? r.json() : null)).then((j) => { cache = j; setData(j); }).catch(() => {});
  }, []);

  const list = (data?.anomalies ?? []).filter((a) => a.warning);
  if (!list.length) return null;

  return (
    <Card title="AI Anomaly Watch" sub="Names whose quant pillars most diverge — the “is this sustainable / value trap?” tensions, with the risk to watch. Fed only pillar grades.">
      <div className="space-y-2.5">
        {list.slice(0, 12).map((a) => (
          <div key={a.ticker} className="border-b border-[#161D29] pb-2 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button onClick={() => goToDetail(a.ticker)} className="font-semibold text-[#5BA8FF] hover:underline">{a.ticker}</button>
              <span className="text-[#9CA7BB]">{a.name}</span>
              <span className="rounded-sm bg-[#11243B] px-1.5 py-0.5 text-[10px] font-medium text-[#9CB6E0]">↑ {a.strong} · ↓ {a.weak}</span>
              <span className="text-[11px] text-[#7C879B]">score {a.composite}</span>
            </div>
            <p className="mt-0.5 text-sm leading-relaxed text-[#C3CAD7]">{a.warning}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
