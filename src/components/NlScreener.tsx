import { useState } from "react";
import { useStore } from "../store";
import { Card } from "./ui";
import { RATING_RANK } from "./SortableTable";

// Natural-language screener: a plain-English query → /api/ai (Gemini) returns a filter spec JSON →
// applied to the LOCAL universe (no big payload; the LLM only parses intent). Degrades w/o key.
interface Filters { minComposite?: number | null; ratingMin?: string | null; sectors?: string[];
  fvVerdict?: string | null; gradeMin?: Record<string, string | null> }

export default function NlScreener() {
  const { rows, meta, goToDetail } = useStore();
  const [q, setQ] = useState("");
  const [st, setSt] = useState<{ loading: boolean; explain?: string; results?: typeof rows; err?: string }>({ loading: false });

  const run = async () => {
    if (!q.trim()) return;
    setSt({ loading: true });
    try {
      const r = await fetch(`/api/ai?${new URLSearchParams({ kind: "screener", d: JSON.stringify({ query: q }) }).toString()}`);
      const j = await r.json();
      if (!j?.ok) { setSt({ loading: false, err: j?.reason || "unavailable" }); return; }
      let spec: { filters?: Filters; explain?: string };
      try { spec = JSON.parse((j.text.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { setSt({ loading: false, err: "parse" }); return; }
      const f = spec.filters || {};
      const gs = meta.grade_scores ?? {};
      const out = rows.filter((row) => row.sector !== "ETF").filter((row) => {
        if (f.minComposite != null && (row.composite ?? 0) < f.minComposite) return false;
        if (f.ratingMin && (RATING_RANK[row.rating] ?? 0) < (RATING_RANK[f.ratingMin] ?? 0)) return false;
        if (f.sectors?.length && !f.sectors.includes(row.sector ?? "")) return false;
        if (f.fvVerdict && row.fvVerdict !== f.fvVerdict) return false;
        for (const [p, g] of Object.entries(f.gradeMin ?? {})) {
          if (g && gs[g] != null) { const v = row.pillars?.[p]; if (v == null || v < gs[g]) return false; }
        }
        return true;
      }).sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0)).slice(0, 25);
      setSt({ loading: false, explain: spec.explain, results: out });
    } catch { setSt({ loading: false, err: "error" }); }
  };

  return (
    <Card title="🗣️ Ask the Screener" sub="Plain-English query → AI maps it to filters, applied to the universe. e.g. “growth stocks with improving margins still below fair value.”">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          placeholder="e.g. cheap profitable industrials with momentum"
          className="min-w-[280px] flex-1 rounded-md border border-line bg-head px-3 py-1.5 text-sm text-white placeholder:text-[#5A6678] focus:border-active focus:outline-none" />
        <button onClick={run} disabled={st.loading} className="rounded-md bg-[#1D4ED8] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#2563EB] disabled:opacity-50">{st.loading ? "Thinking…" : "Screen"}</button>
      </div>
      {st.err && <p className="mt-2 text-xs text-mute">AI unavailable ({st.err}) — runs on the deployed app with GEMINI_API_KEY.</p>}
      {st.explain && <p className="mt-2 text-sm text-[#9CB6E0]">{st.explain} — <span className="text-mute">{st.results?.length ?? 0} matches</span></p>}
      {st.results && st.results.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {st.results.map((r) => (
            <button key={r.ticker} onClick={() => goToDetail(r.ticker)}
              className="rounded-md border border-line bg-panel px-2 py-1 text-xs hover:border-active">
              <span className="font-semibold text-link">{r.ticker}</span> <span className="text-mute">{(r.composite ?? 0).toFixed(1)}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
