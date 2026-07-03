import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Spinner } from "../components/ui";
import { loadDataJSON } from "../lib/data";

const SECTIONS: { key: string; label: string }[] = [
  { key: "GETTING_STARTED", label: "Getting Started" },
  { key: "PILLAR_METHODOLOGY", label: "Pillar Methodology" },
  { key: "RATING_SYSTEM", label: "Rating System" },
  { key: "FAIR_VALUE", label: "Fair Value" },
  { key: "BUY_POINT", label: "Quant Buy Point" },
  { key: "MONTE_CARLO", label: "Monte Carlo" },
  { key: "PGI", label: "PGI" },
  { key: "DOPPELGANGER", label: "Doppelganger" },
  { key: "PRO_CHARTS", label: "Pro Charts" },
  { key: "ETF_CENTER", label: "ETF Center" },
  { key: "_glossary", label: "Glossary" },
  { key: "BEST_PRACTICES", label: "Best Practices" },
  { key: "DATA_SOURCES", label: "Data Sources" },
  { key: "DISCLAIMER", label: "Disclaimer" },
];

// Minimal markdown → JSX (headings, bold, bullet lists, paragraphs).
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(<ul key={out.length} className="my-2 list-disc space-y-1 pl-5 text-ink-2">{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>);
      list = [];
    }
  };
  const inline = (s: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="text-white">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>);
  };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^###\s/.test(l)) { flush(); out.push(<h4 key={out.length} className="mt-3 text-sm font-semibold text-ink">{l.replace(/^###\s/, "")}</h4>); }
    else if (/^##\s/.test(l)) { flush(); out.push(<h3 key={out.length} className="mt-4 text-base font-bold text-white">{l.replace(/^##\s/, "")}</h3>); }
    else if (/^#\s/.test(l)) { flush(); out.push(<h2 key={out.length} className="mt-4 text-lg font-bold text-white">{l.replace(/^#\s/, "")}</h2>); }
    else if (/^[-*]\s/.test(l)) { list.push(l.replace(/^[-*]\s/, "")); }
    else if (l.trim() === "") { flush(); }
    else { flush(); out.push(<p key={out.length} className="my-1.5 leading-relaxed text-ink-2">{inline(l)}</p>); }
  }
  flush();
  return <div>{out}</div>;
}

interface GlossaryTerm { term: string; definition: string }
function Glossary({ terms }: { terms: GlossaryTerm[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? terms.filter((t) => t.term.toLowerCase().includes(s) || t.definition.toLowerCase().includes(s)) : terms;
    return [...list].sort((a, b) => a.term.localeCompare(b.term));
  }, [q, terms]);
  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-white">Glossary</h2>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search glossary (e.g. PEG, ROE, RSI…)"
        className="mb-3 w-full max-w-md rounded-md border border-line bg-head px-3 py-2 text-sm text-white" />
      <div className="text-[11px] text-mute">{filtered.length} of {terms.length} terms</div>
      <dl className="mt-2 space-y-2">
        {filtered.map((t) => (
          <div key={t.term} className="border-t border-line-faint pt-2">
            <dt className="text-sm font-semibold text-ink">{t.term}</dt>
            <dd className="text-sm leading-relaxed text-ink-2">{t.definition}</dd>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-sm text-mute">No terms match “{q}”.</div>}
      </dl>
    </div>
  );
}

export default function HelpTab() {
  const [content, setContent] = useState<Record<string, any> | null>(null);
  const [active, setActive] = useState(SECTIONS[0].key);
  useEffect(() => {
    loadDataJSON<Record<string, any>>("help.json").then((j) => { if (j) setContent(j); });
  }, []);
  if (!content) return <Spinner />;
  const avail = SECTIONS.filter((s) => content[s.key]);
  return (
    <div className="flex gap-4">
      <div className="w-48 shrink-0">
        {avail.map((s) => (
          <button key={s.key} onClick={() => setActive(s.key)}
            className={`block w-full rounded-md px-3 py-1.5 text-left text-sm ${active === s.key ? "bg-active font-semibold text-white" : "text-ink-3 hover:bg-hover"}`}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1 rounded-lg border border-line bg-panel p-5">
        {active === "_glossary" ? <Glossary terms={content._glossary ?? []} />
          : content[active] ? <Markdown text={content[active]} /> : <div className="text-mute">Section unavailable.</div>}
      </div>
    </div>
  );
}
