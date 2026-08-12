import { useStore } from "../store";

// STOCK OF THE DAY banner (Bradley's ship ruling 2026-08-11, name amended same day).
// CONTENT BRANCH ONLY: a daily read of where five independent measurement systems agree
// most strongly. No edge claimed, no holding period implied, no entry/exit language —
// here, in the note, or anywhere else. The caveat block rides at the SAME visual level
// as the consensus score (default-landing placement raises the misread risk; the
// caveats are load-bearing UI, not fine print). Every figure comes from
// stock_of_the_day.json — the fidelity-gated nightly artifact.

const STREAM_META: Record<string, { label: string; desc: string }> = {
  S1: { label: "c78q posterior", desc: "the binary classifier's probability of beating the market over 12 months" },
  S2: { label: "ML 12-month ranking", desc: "the return-engine ensemble's relative-attractiveness percentile (rank-served)" },
  S3: { label: "FV upside", desc: "fair value vs price" },
  S4: { label: "event grade", desc: "PEAD drift + 8-K sentiment + insider activity" },
  S5: { label: "factor composite", desc: "valuation / growth / profitability / momentum panel scores" },
};

export default function SotdBanner() {
  const { sotd, selectedTicker, goToDetail } = useStore();
  if (!sotd || !sotd.pick) return null;
  const p = sotd.pick;
  if (selectedTicker && selectedTicker !== p.ticker) return null;
  return (
    <div className="rounded-lg border border-link/40 bg-link/5 p-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="rounded bg-link/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-link">
          Stock of the Day · {sotd.date}
        </span>
        <span className="text-lg font-bold text-white">{p.ticker}</span>
        <span className="text-sm text-ink-2">
          consensus <span className="font-semibold text-white">{p.consensus.toFixed(1)}th percentile</span>{" "}
          ({p.n_streams} of 5 streams reporting)
        </span>
      </div>
      <p className="mt-1 text-xs text-mute">
        The daily default view: the name where the five measurement systems agree most strongly today.
        A read, not a recommendation.
      </p>
      <div className="mt-3 grid gap-1.5 md:grid-cols-2">
        {Object.entries(STREAM_META).map(([sid, m]) => {
          const v = p.streams?.[sid];
          return (
            <div key={sid} className="flex items-baseline gap-2 text-xs">
              <span className="w-40 shrink-0 font-semibold text-ink-2">{m.label}</span>
              <span className="w-10 shrink-0 text-right font-semibold text-white">
                {v == null ? "—" : v.toFixed(1)}
              </span>
              <span className="min-w-0 text-mute">{v == null ? "not reporting for this name today" : m.desc}</span>
            </div>
          );
        })}
      </div>
      {sotd.runners_up?.length > 0 && (
        <div className="mt-3 text-xs text-ink-3">
          Runners-up:{" "}
          {sotd.runners_up.map((r, i) => (
            <span key={r.ticker}>
              {i > 0 && ", "}
              <button onClick={() => goToDetail(r.ticker)} className="text-link hover:underline">
                {r.ticker}
              </button>{" "}
              ({r.consensus.toFixed(1)})
            </span>
          ))}
        </div>
      )}
      {/* Caveats at the same visual level as the score — always visible, never collapsed */}
      <ul className="mt-3 space-y-1 border-t border-link/20 pt-2 text-[11px] leading-relaxed text-mute">
        {(sotd.caveats ?? []).map((c, i) => (
          <li key={i}>• {c}</li>
        ))}
      </ul>
    </div>
  );
}
