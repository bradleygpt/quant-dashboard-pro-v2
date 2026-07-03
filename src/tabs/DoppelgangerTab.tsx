import { useEffect, useMemo, useState } from "react";
import AiNarrative from "../components/AiNarrative";
import { useStore } from "../store";
import { Card, Metric, Spinner } from "../components/ui";
import { fmtPct, fmtCapB } from "../lib/format";
import { loadDataJSON } from "../lib/data";
import { findDoppelgangers, aggregateForwardReturns, type DoppelDB, type Match } from "../lib/doppelganger";
import { SEM } from "../theme";

const BASE = `${import.meta.env.BASE_URL}data`;

function simColor(s: number) { return s >= 0.7 ? SEM.pos : s >= 0.5 ? SEM.warn : SEM.warnHot; }
function retColor(v: number) { return v >= 0 ? SEM.pos : SEM.neg; }

export default function DoppelgangerTab() {
  const { rows, byTicker, selectedTicker, selectTicker } = useStore();
  const [db, setDb] = useState<DoppelDB | null>(null);
  const [err, setErr] = useState(false);
  const [query, setQuery] = useState("");
  const [sectorMode, setSectorMode] = useState("same");
  const [tag, setTag] = useState("All");
  const [dedupe, setDedupe] = useState(true);

  useEffect(() => {
    loadDataJSON<DoppelDB>("doppelganger.json").then((j) => { if (j) setDb(j); else setErr(true); });
  }, []);

  const ticker = selectedTicker ?? rows.find((r) => r.sector !== "ETF")?.ticker ?? null;
  const row = ticker ? byTicker.get(ticker) : null;

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const s = query.trim().toUpperCase();
    return rows.filter((r) => r.sector !== "ETF" && (r.ticker.includes(s) || (r.name ?? "").toUpperCase().includes(s))).slice(0, 8);
  }, [query, rows]);

  const matches = useMemo<Match[]>(() => {
    if (!db || !row) return [];
    return findDoppelgangers(row, db, { topN: 5, sectorFilter: sectorMode, tagFilter: tag === "All" ? null : tag, dedupeEras: dedupe });
  }, [db, row, sectorMode, tag, dedupe]);

  const agg = useMemo(() => (db && matches.length >= 2 ? aggregateForwardReturns(matches, db.forward_returns) : null), [db, matches]);

  if (err) return <Card title="Doppelganger"><div className="text-sm text-mute">Analog database unavailable.</div></Card>;
  if (!db) return <Spinner label="Loading analog database…" />;
  if (!row) return <div className="p-4 text-ink-3">Select a ticker.</div>;

  const num = (k: string) => row.raw[k];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Doppelganger</h2>
        <p className="text-xs text-mute">Historical analogues by fundamental fingerprint — {db.stats.total_analogs} curated setups across {db.stats.eras_covered.length} eras. What happened next.</p>
      </div>

      {agg && matches.length >= 2 && (
        <AiNarrative kind="doppelganger" ticker={row.ticker}
          blob={{ analogs: matches.slice(0, 10), fwd: agg }}
          label={`AI analogue read — ${row.ticker}`}
          hint="What the historical analogues imply — central tendency, dispersion, and what split winners from losers." />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Ticker (current: ${row.ticker})`}
            className="w-56 rounded-md border border-line bg-panel px-3 py-2 text-sm text-white" />
          {suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-line bg-head shadow-xl">
              {suggestions.map((s) => (
                <button key={s.ticker} onClick={() => { selectTicker(s.ticker); setQuery(""); }} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-active">
                  <span className="font-semibold text-link">{s.ticker}</span> <span className="text-ink-3">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="text-xs text-ink-3">Match mode
          <select value={sectorMode} onChange={(e) => setSectorMode(e.target.value)} className="mt-1 block rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-white">
            <option value="same">Same sector</option>
            <option value="any">Any sector</option>
            {db.stats.sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-3">Tag
          <select value={tag} onChange={(e) => setTag(e.target.value)} className="mt-1 block rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-white">
            <option>All</option>{db.tags.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} /> Dedupe eras</label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Mkt Cap" value={fmtCapB(row.marketCapB)} />
        <Metric label="P/E" value={num("trailingPE") != null ? `${(num("trailingPE") as number).toFixed(1)}x` : "—"} />
        <Metric label="P/S" value={num("priceToSalesTrailing12Months") != null ? `${(num("priceToSalesTrailing12Months") as number).toFixed(1)}x` : "—"} />
        <Metric label="Rev Growth" value={num("revenueGrowth") != null ? fmtPct((num("revenueGrowth") as number) * 100, 1) : "—"} />
        <Metric label="12M Return" value={num("momentum_12m") != null ? fmtPct((num("momentum_12m") as number) * 100, 1, true) : "—"} />
      </div>

      {matches.length === 0 ? (
        <Card title="No analogues"><div className="text-sm text-mute">No historical analogues above the similarity threshold for {row.ticker} with these filters. Try "Any sector".</div></Card>
      ) : (
        <>
          {agg && (
            <Card title="Aggregate forward-return forecast" sub={`Similarity-weighted across ${agg.contributing_count} analogues`}>
              <div className="grid grid-cols-3 gap-3">
                {(["1yr", "3yr", "5yr"] as const).map((h, i) => {
                  const v = [agg.weighted_1yr_pct, agg.weighted_3yr_pct, agg.weighted_5yr_pct][i];
                  return <Metric key={h} label={`Weighted ${h}`} value={<span style={{ color: retColor(v) }}>{fmtPct(v, 1, true)}</span>} />;
                })}
              </div>
              <div className="mt-2 text-xs text-mute">1yr range: {fmtPct(agg.worst_1yr, 0, true)} … {fmtPct(agg.best_1yr, 0, true)} · median {fmtPct(agg.median_1yr_pct, 1, true)}</div>
            </Card>
          )}

          {matches.map((m) => {
            const fr = db.forward_returns[m.match_key];
            return (
              <Card key={m.match_key} title={`${m.company} — ${m.era}`} sub={`${m.sector}${m.same_sector ? " · same sector" : ""}`}>
                <div className="mb-2 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                    <div className="h-full rounded-full" style={{ width: `${m.similarity * 100}%`, background: simColor(m.similarity) }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: simColor(m.similarity) }}>{(m.similarity * 100).toFixed(0)}% match</span>
                </div>
                {fr && (
                  <div className="mb-2 grid grid-cols-3 gap-2 text-sm">
                    {(["1yr", "3yr", "5yr"] as const).map((h) => (
                      <div key={h} className="rounded border border-line px-2 py-1">
                        <div className="text-[10px] uppercase text-mute">{h} after</div>
                        <div className="font-semibold" style={{ color: retColor(fr[h]) }}>{fmtPct(fr[h], 0, true)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {m.narrative && <p className="text-sm text-ink-2">{m.narrative}</p>}
                {m.outcome && <p className="mt-1 text-xs text-ink-3"><strong className="text-ink-2">Outcome:</strong> {m.outcome}</p>}
                {m.lesson && <p className="mt-1 text-xs text-ink-3"><strong className="text-ink-2">Lesson:</strong> {m.lesson}</p>}
                <div className="mt-2 flex flex-wrap gap-1">{m.tags.map((t) => <span key={t} className="rounded-full bg-raised px-2 py-0.5 text-[10px] text-ink-3">{t}</span>)}</div>
              </Card>
            );
          })}
        </>
      )}
      <p className="text-[10px] text-dim">Historical analogues are illustrative pattern-matches, not predictions. Past performance does not indicate future results.</p>
    </div>
  );
}
