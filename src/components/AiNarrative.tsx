import { useState } from "react";

// Reusable runtime-AI button: posts a small data blob to /api/ai (Gemini on Vercel) for a kind
// (doppelganger / portfolio / correlation) and renders the narrative. Degrades gracefully with no key.
export default function AiNarrative({ kind, ticker, blob, label = "AI take", hint }:
  { kind: string; ticker?: string; blob: unknown; label?: string; hint?: string }) {
  const [st, setSt] = useState<{ loading: boolean; text?: string; err?: string }>({ loading: false });

  const run = async () => {
    setSt({ loading: true });
    try {
      const params: Record<string, string> = { kind, d: JSON.stringify(blob) };
      if (ticker) params.ticker = ticker;
      const r = await fetch(`/api/ai?${new URLSearchParams(params).toString()}`);
      const j = await r.json();
      setSt({ loading: false, text: j?.ok ? j.text : undefined, err: j?.ok ? undefined : (j?.reason || "unavailable") });
    } catch {
      setSt({ loading: false, err: "error" });
    }
  };

  return (
    <div className="rounded-lg border border-line bg-head p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-link/75">🧠 {label}</span>
        <button onClick={run} disabled={st.loading}
          className="rounded-md bg-cta px-2.5 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50">
          {st.loading ? "Thinking…" : st.text ? "Regenerate" : "Generate"}
        </button>
      </div>
      {st.text && <p className="mt-2 text-sm leading-relaxed text-ink-2">{st.text}</p>}
      {st.err && <p className="mt-2 text-xs text-mute">AI unavailable ({st.err}) — runs on the deployed app with GEMINI_API_KEY.</p>}
      {!st.text && !st.err && !st.loading && hint && <p className="mt-1.5 text-xs text-mute">{hint}</p>}
    </div>
  );
}
