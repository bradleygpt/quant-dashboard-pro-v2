import { useState } from "react";
import { Card, Pill, Spinner, Unavailable } from "../components/ui";
import { fmtPct } from "../lib/format";
import { useLiveData } from "../lib/live";

const BASE = `${import.meta.env.BASE_URL}data`;

interface Commentator {
  name: string; firm?: string; stance?: string; key_quote?: string; quote_source?: string;
  quote_date?: string; key_views?: string[]; price_target_or_view?: string; price_target?: string;
  btc_view?: string; eth_view?: string;
}
interface PunditSection { commentators?: Commentator[]; synthesis?: string; themes?: string[] }
interface Pundits {
  ok?: boolean; last_updated_human?: string; market_context?: Record<string, number>;
  equity?: PunditSection; crypto?: PunditSection; equity_status?: string; crypto_status?: string;
}
interface Poly { ok?: boolean; markets?: { question: string; category?: string; yes_prob: number | null; volume_24h: number | null; end_date?: string }[] }

function stanceColor(s = ""): string {
  const l = s.toLowerCase();
  if (l.includes("very bull") || l.includes("bullish")) return "#00C805";
  if (l.includes("cautiously bull")) return "#8BC34A";
  if (l.includes("neutral")) return "#FFC107";
  if (l.includes("caution")) return "#FF9800";
  if (l.includes("bear")) return "#FF5722";
  return "#9CA7BB";
}

function Commentators({ section }: { section?: PunditSection }) {
  if (!section?.commentators?.length) return <div className="text-sm text-[#7C879B]">No commentary available.</div>;
  return (
    <div className="space-y-3">
      {section.synthesis && <Card title="Synthesis"><p className="text-sm leading-relaxed text-[#C3CAD7]">{section.synthesis}</p>
        {section.themes && <div className="mt-2 flex flex-wrap gap-1">{section.themes.map((t, i) => <span key={i} className="rounded-full bg-[#1A2130] px-2 py-0.5 text-[11px] text-[#9CA7BB]">{t}</span>)}</div>}</Card>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {section.commentators.map((c, i) => (
          <Card key={i} title={c.name} sub={[c.firm, c.quote_date].filter(Boolean).join(" · ")}>
            {c.stance && <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold" style={{ color: stanceColor(c.stance), background: `${stanceColor(c.stance)}22` }}>{c.stance}</span>}
            {c.key_quote && <p className="mt-2 border-l-2 border-[#2A3242] pl-2 text-sm italic text-[#C3CAD7]">“{c.key_quote}”{c.quote_source ? <span className="not-italic text-[#7C879B]"> — {c.quote_source}</span> : null}</p>}
            {(c.price_target_or_view || c.price_target) && <div className="mt-2 text-xs text-[#9CA7BB]"><strong className="text-[#C3CAD7]">Target/View:</strong> {c.price_target_or_view || c.price_target}</div>}
            {c.btc_view && <div className="text-xs text-[#9CA7BB]"><strong className="text-[#C3CAD7]">BTC:</strong> {c.btc_view}</div>}
            {c.key_views?.length ? <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[#9CA7BB]">{c.key_views.map((v, j) => <li key={j}>{v}</li>)}</ul> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}

function Predictions() {
  const poly = useLiveData<Poly>("/api/polymarket");
  if (poly.status === "loading") return <Spinner label="Loading prediction markets…" />;
  if (poly.status === "unavailable" || !poly.data?.markets?.length)
    return <Unavailable what="Prediction markets" detail="Live Polymarket data is fetched server-side on the deployed app. In a static preview (no serverless), this shows unavailable — by design." />;
  return (
    <Card title="Top prediction markets" sub="Polymarket · politics / economics / finance / crypto / geopolitics (sports & entertainment excluded) · by 24h volume">
      <table className="w-full text-sm">
        <thead><tr><th className="py-1 text-left text-xs uppercase text-[#7C879B]">Market</th><th className="py-1 text-left text-xs uppercase text-[#7C879B]">Category</th><th className="py-1 text-right text-xs uppercase text-[#7C879B]">Yes</th><th className="py-1 text-right text-xs uppercase text-[#7C879B]">24h Vol</th></tr></thead>
        <tbody>
          {poly.data.markets.slice(0, 30).map((m, i) => (
            <tr key={i} className="border-t border-[#161D29]">
              <td className="py-1.5 pr-3 text-[#C3CAD7]">{m.question}</td>
              <td className="py-1.5 pr-3"><span className="rounded-full bg-[#1A2130] px-2 py-0.5 text-[10px] capitalize text-[#9CA7BB]">{m.category ?? "—"}</span></td>
              <td className="py-1.5 text-right font-semibold" style={{ color: (m.yes_prob ?? 0) >= 0.5 ? "#00C805" : "#FF9800" }}>{m.yes_prob == null ? "—" : fmtPct(m.yes_prob * 100, 0)}</td>
              <td className="py-1.5 text-right text-[#9CA7BB]">{m.volume_24h == null ? "—" : `$${Math.round(m.volume_24h).toLocaleString()}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function PunditViewsTab() {
  const pundits = useLiveData<Pundits>(`${BASE}/pundits.json`);
  const [view, setView] = useState<"equity" | "crypto" | "predictions">("equity");

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-white">Pundit Views & Predictions</h2>
        <p className="text-xs text-[#7C879B]">
          Market commentator views (refreshed daily, AI-summarized with web grounding) + live prediction markets.
          {pundits.data?.last_updated_human ? ` Commentary as of ${pundits.data.last_updated_human}.` : ""}
        </p>
      </div>
      <div className="flex gap-2">
        <Pill active={view === "equity"} onClick={() => setView("equity")}>Equity Commentators</Pill>
        <Pill active={view === "crypto"} onClick={() => setView("crypto")}>Crypto Voices</Pill>
        <Pill active={view === "predictions"} onClick={() => setView("predictions")}>Prediction Markets</Pill>
      </div>
      {view === "predictions" ? <Predictions />
        : pundits.status === "loading" ? <Spinner />
        : pundits.status === "unavailable" ? <Unavailable what="Pundit commentary" />
        : <Commentators section={view === "equity" ? pundits.data?.equity : pundits.data?.crypto} />}
    </div>
  );
}
