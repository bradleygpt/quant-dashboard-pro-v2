import { useState } from "react";
import { Card, Pill, Spinner, Unavailable } from "../components/ui";
import { fmtPct } from "../lib/format";
import { useLiveData } from "../lib/live";
import { INK, SEM } from "../theme";

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
interface Poly { ok?: boolean; markets?: { question: string; category?: string; leading_outcome?: string | null; n_outcomes?: number; yes_prob: number | null; volume_24h: number | null; end_date?: string }[] }

function stanceColor(s = ""): string {
  const l = s.toLowerCase();
  if (l.includes("very bull") || l.includes("bullish")) return SEM.pos;
  if (l.includes("cautiously bull")) return SEM.posSoft;
  if (l.includes("neutral")) return SEM.warn;
  if (l.includes("caution")) return SEM.warnHot;
  if (l.includes("bear")) return SEM.neg;
  return INK.ink3;
}

function Commentators({ section }: { section?: PunditSection }) {
  if (!section?.commentators?.length) return <div className="text-sm text-mute">No commentary available.</div>;
  return (
    <div className="space-y-3">
      {section.synthesis && <Card title="Synthesis"><p className="text-sm leading-relaxed text-ink-2">{section.synthesis}</p>
        {section.themes && <div className="mt-2 flex flex-wrap gap-1">{section.themes.map((t, i) => <span key={i} className="rounded-full bg-raised px-2 py-0.5 text-[11px] text-ink-3">{t}</span>)}</div>}</Card>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {section.commentators.map((c, i) => (
          <Card key={i} title={c.name} sub={[c.firm, c.quote_date].filter(Boolean).join(" · ")}>
            {c.stance && <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold" style={{ color: stanceColor(c.stance), background: `${stanceColor(c.stance)}22` }}>{c.stance}</span>}
            {c.key_quote && <p className="mt-2 border-l-2 border-line-2 pl-2 text-sm italic text-ink-2">“{c.key_quote}”{c.quote_source ? <span className="not-italic text-mute"> — {c.quote_source}</span> : null}</p>}
            {(c.price_target_or_view || c.price_target) && <div className="mt-2 text-xs text-ink-3"><strong className="text-ink-2">Target/View:</strong> {c.price_target_or_view || c.price_target}</div>}
            {c.btc_view && <div className="text-xs text-ink-3"><strong className="text-ink-2">BTC:</strong> {c.btc_view}</div>}
            {c.key_views?.length ? <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-ink-3">{c.key_views.map((v, j) => <li key={j}>{v}</li>)}</ul> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}

function Predictions() {
  const poly = useLiveData<Poly>("/api/polymarket");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<"volume" | "prob">("volume");
  const [limit, setLimit] = useState(30);
  if (poly.status === "loading") return <Spinner label="Loading prediction markets…" />;
  if (poly.status === "unavailable" || !poly.data?.markets?.length)
    return <Unavailable what="Prediction markets" detail="Live Polymarket data is fetched server-side on the deployed app. In a static preview (no serverless), this shows unavailable — by design." />;
  const cats = ["all", ...Array.from(new Set(poly.data.markets.map((m) => m.category).filter(Boolean) as string[])).sort()];
  const shown = poly.data.markets
    .filter((m) => cat === "all" || m.category === cat)
    .sort((a, b) => sort === "volume" ? (b.volume_24h ?? 0) - (a.volume_24h ?? 0) : (b.yes_prob ?? 0) - (a.yes_prob ?? 0))
    .slice(0, limit);
  return (
    <Card title="Macro prediction markets" sub="Polymarket · macro/event markets relevant to equities (Fed, CPI, recession, BTC/ETH, tariffs…). One row per event; multi-candidate elections & sports excluded.">
      <div className="mb-2 flex flex-wrap items-end gap-3 text-xs text-ink-3">
        <label>Theme
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="mt-1 block rounded-md border border-line bg-head px-2 py-1 text-sm capitalize text-white">
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value as "volume" | "prob")} className="mt-1 block rounded-md border border-line bg-head px-2 py-1 text-sm text-white">
            <option value="volume">24h Volume</option><option value="prob">Probability</option>
          </select>
        </label>
        <label>Show
          <select value={limit} onChange={(e) => setLimit(+e.target.value)} className="mt-1 block rounded-md border border-line bg-head px-2 py-1 text-sm text-white">
            {[10, 20, 30, 40].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="text-mute">{shown.length} markets</span>
      </div>
      <table className="w-full text-sm">
        <thead><tr><th className="py-1 text-left text-xs uppercase text-mute">Market</th><th className="py-1 text-left text-xs uppercase text-mute">Theme</th><th className="py-1 text-right text-xs uppercase text-mute">Leading</th><th className="py-1 text-right text-xs uppercase text-mute">24h Vol</th></tr></thead>
        <tbody>
          {shown.map((m, i) => (
            <tr key={i} className="border-t border-line-faint">
              <td className="py-1.5 pr-3 text-ink-2">{m.question}{m.n_outcomes && m.n_outcomes > 1 ? <span className="ml-1 text-[10px] text-mute">· {m.n_outcomes} outcomes{m.leading_outcome ? ` · leads: ${m.leading_outcome}` : ""}</span> : null}</td>
              <td className="py-1.5 pr-3"><span className="rounded-full bg-raised px-2 py-0.5 text-[10px] capitalize text-ink-3">{m.category ?? "—"}</span></td>
              <td className="py-1.5 text-right font-semibold" style={{ color: (m.yes_prob ?? 0) >= 0.5 ? SEM.pos : SEM.warnHot }}>{m.yes_prob == null ? "—" : fmtPct(m.yes_prob * 100, 0)}</td>
              <td className="py-1.5 text-right text-ink-3">{m.volume_24h == null ? "—" : `$${Math.round(m.volume_24h).toLocaleString()}`}</td>
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
        <p className="text-xs text-mute">
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
