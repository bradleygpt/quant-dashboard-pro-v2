import { useEffect, useState } from "react";
import { useStore } from "../store";
import { Card } from "./ui";
import { loadDataJSON } from "../lib/data";

// Thematic Explorer — the "AI" theme (flagship). Grounded in real data: stocks ranked by return-
// correlation to an AI-compute proxy basket + an LLM map of which buildout layers benefit. ai_theme.json.
const BASE = `${import.meta.env.BASE_URL}data`;
interface Corr { ticker: string; name: string; sector: string; corr: number; composite: number }
interface Theme { generated_at: string; theme: string; window_days: number; proxy_basket: string[]; correlations: Corr[]; narrative: string }
let cache: Theme | null = null;

export default function ThematicExplorer() {
  const { goToDetail } = useStore();
  const [data, setData] = useState<Theme | null>(cache);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (cache) return;
    loadDataJSON<Theme>("ai_theme.json").then((j) => { cache = j; setData(j); });
  }, []);
  if (!data) return null;

  return (
    <Card title={`🧠 Thematic Explorer — ${data.theme}`}
      sub={`Stocks ranked by ${data.window_days}-day return-correlation to an AI-compute proxy (${data.proxy_basket.slice(0, 5).join(" / ")}…) — the picks-and-shovels of the AI buildout.`}>
      {data.narrative && <p className="mb-3 text-sm leading-relaxed text-ink-2">{data.narrative}</p>}
      <div className="overflow-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-panel text-left text-[11px] uppercase tracking-wide text-mute">
              <th className="px-3 py-2">Ticker</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Sector</th>
              <th className="px-3 py-2 text-right">Corr to AI</th><th className="px-3 py-2 text-right">Quant score</th>
            </tr>
          </thead>
          <tbody>
            {data.correlations.slice(0, show ? 35 : 12).map((c) => (
              <tr key={c.ticker} className="border-t border-line-faint hover:bg-panel">
                <td className="px-3 py-1.5 font-semibold"><button onClick={() => goToDetail(c.ticker)} className="text-link hover:underline">{c.ticker}</button></td>
                <td className="px-3 py-1.5 text-ink-2">{c.name}</td>
                <td className="px-3 py-1.5 text-ink-3">{c.sector}</td>
                <td className="px-3 py-1.5 text-right font-mono text-pos-soft">{c.corr.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right text-ink-2">{c.composite != null ? c.composite.toFixed(1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.correlations.length > 12 && (
        <button onClick={() => setShow((s) => !s)} className="mt-2 text-xs text-link hover:underline">
          {show ? "Show fewer" : `Show all ${Math.min(35, data.correlations.length)}`}
        </button>
      )}
    </Card>
  );
}
