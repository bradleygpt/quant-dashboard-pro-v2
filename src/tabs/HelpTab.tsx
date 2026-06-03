import { useEffect, useState, type ReactNode } from "react";
import { Spinner } from "../components/ui";

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
      out.push(<ul key={out.length} className="my-2 list-disc space-y-1 pl-5 text-[#C3CAD7]">{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>);
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
    if (/^###\s/.test(l)) { flush(); out.push(<h4 key={out.length} className="mt-3 text-sm font-semibold text-[#E6E9EF]">{l.replace(/^###\s/, "")}</h4>); }
    else if (/^##\s/.test(l)) { flush(); out.push(<h3 key={out.length} className="mt-4 text-base font-bold text-white">{l.replace(/^##\s/, "")}</h3>); }
    else if (/^#\s/.test(l)) { flush(); out.push(<h2 key={out.length} className="mt-4 text-lg font-bold text-white">{l.replace(/^#\s/, "")}</h2>); }
    else if (/^[-*]\s/.test(l)) { list.push(l.replace(/^[-*]\s/, "")); }
    else if (l.trim() === "") { flush(); }
    else { flush(); out.push(<p key={out.length} className="my-1.5 leading-relaxed text-[#C3CAD7]">{inline(l)}</p>); }
  }
  flush();
  return <div>{out}</div>;
}

export default function HelpTab() {
  const [content, setContent] = useState<Record<string, string> | null>(null);
  const [active, setActive] = useState(SECTIONS[0].key);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/help.json`).then((r) => r.json()).then(setContent);
  }, []);
  if (!content) return <Spinner />;
  const avail = SECTIONS.filter((s) => content[s.key]);
  return (
    <div className="flex gap-4">
      <div className="w-48 shrink-0">
        {avail.map((s) => (
          <button key={s.key} onClick={() => setActive(s.key)}
            className={`block w-full rounded-md px-3 py-1.5 text-left text-sm ${active === s.key ? "bg-[#1B2433] font-semibold text-white" : "text-[#9CA7BB] hover:bg-[#161D29]"}`}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1 rounded-lg border border-[#1E2632] bg-[#121723] p-5">
        {content[active] ? <Markdown text={content[active]} /> : <div className="text-[#7C879B]">Section unavailable.</div>}
      </div>
    </div>
  );
}
