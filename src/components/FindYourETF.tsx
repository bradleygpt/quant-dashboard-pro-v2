import { useEffect, useMemo, useState } from "react";
import { Card, Spinner, Unavailable } from "./ui";

// "Find your ETF": enter 1-10+ stock tickers, get the ETFs most relevant to that set —
// ranked by how many of your names they hold + how much of the ETF those names are. Reads the
// fresh holdings (etf_holdings.json, issuer-CSV/yfinance, today's data; no stale N-PORT).
const BASE = `${import.meta.env.BASE_URL}data`;
const BASKET_71 = ["MU", "EIX", "FISV", "RKLB", "MXL", "AKAM", "INSW", "MTZ", "MOS", "DECK", "TPR", "IREN", "STX", "VIAV", "VSAT"];

interface Holding { t: string; w: number }
interface EtfRow { name: string; source: string; as_of: string; weights_suspect?: boolean; holdings: Holding[] }
interface HoldingsFile { generated_at: string; n_etfs: number; etfs: Record<string, EtfRow> }
interface Result { etf: string; name: string; nMatched: number; coverage: number; basketWeight: number; names: string[]; asof: string; suspect: boolean }

let cache: HoldingsFile | null = null;

export default function FindYourETF() {
  const [data, setData] = useState<HoldingsFile | null>(cache);
  const [err, setErr] = useState(false);
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [descs, setDescs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (cache) return;
    fetch(`${BASE}/etf_holdings.json`).then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { cache = j; setData(j); }).catch(() => setErr(true));
    fetch(`${BASE}/etf_descriptions.json`).then((r) => (r.ok ? r.json() : null)).then((j) => setDescs(j?.descriptions ?? {})).catch(() => {});
  }, []);

  const run = (tickers: string[]) => {
    const q = tickers.map((t) => t.trim().toUpperCase()).filter(Boolean);
    setSubmitted([...new Set(q)]);
  };

  const results = useMemo<Result[]>(() => {
    if (!data || !submitted.length) return [];
    const q = new Set(submitted);
    const out: Result[] = [];
    for (const [etf, v] of Object.entries(data.etfs)) {
      const matched = (v.holdings || []).filter((h) => q.has(h.t));
      if (!matched.length) continue;
      out.push({
        etf, name: v.name, nMatched: matched.length, coverage: matched.length / q.size,
        basketWeight: matched.reduce((a, h) => a + h.w, 0),
        names: matched.sort((a, b) => b.w - a.w).map((h) => h.t),
        asof: v.as_of, suspect: !!v.weights_suspect,
      });
    }
    out.sort((a, b) => b.nMatched - a.nMatched || b.basketWeight - a.basketWeight);
    return out.slice(0, 30);
  }, [data, submitted]);

  const maxMatched = results.length ? results[0].nMatched : 0;
  const orthogonal = submitted.length >= 5 && maxMatched <= Math.max(2, Math.ceil(submitted.length * 0.2));

  if (err) return <Unavailable what="ETF holdings" detail="etf_holdings.json hasn’t been baked yet (run build_etf_holdings.py)." />;
  if (!data) return <Spinner label="Loading fresh ETF holdings…" />;

  return (
    <div className="space-y-3">
      <Card title="Find your ETF" sub={`Enter 1–10+ tickers → the ETFs most relevant to that set. Fresh holdings (${data.n_etfs} ETFs, as-of ${data.generated_at}).`}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") run(input.split(/[\s,]+/)); }}
            placeholder="e.g. MU, NVDA, AMD, AVGO"
            className="min-w-[260px] flex-1 rounded-md border border-[#1E2632] bg-[#0F1420] px-3 py-1.5 text-sm text-white placeholder:text-[#5A6678] focus:border-[#2A3550] focus:outline-none"
          />
          <button onClick={() => run(input.split(/[\s,]+/))}
            className="rounded-md bg-[#1D4ED8] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#2563EB]">Find ETFs</button>
          <button onClick={() => { setInput(BASKET_71.join(", ")); run(BASKET_71); }}
            className="rounded-md border border-[#1E2632] px-3 py-1.5 text-sm text-[#9CB6E0] hover:bg-[#161D29]">Load 7/1 basket</button>
        </div>
        {submitted.length > 0 && (
          <div className="mt-2 text-xs text-[#7C879B]">Query ({submitted.length}): {submitted.join(", ")}</div>
        )}
      </Card>

      {submitted.length > 0 && orthogonal && (
        <div className="rounded-lg border border-[#3A2E1E] bg-[#1A140A] px-3 py-2 text-sm text-[#E0B870]">
          ⚑ <b>Orthogonal set</b> — no ETF holds more than {maxMatched} of your {submitted.length} names. This set isn’t replicated by any ETF (a novelty / non-consensus signal).
        </div>
      )}

      {submitted.length > 0 && (
        results.length === 0 ? (
          <div className="rounded-lg border border-[#1E2632] bg-[#121723] px-3 py-3 text-sm text-[#9CA7BB]">
            No ETF in the fresh set holds any of these names (in its current top holdings).
          </div>
        ) : (
          <div className="overflow-auto rounded-lg border border-[#1E2632]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#121723] text-left text-[11px] uppercase tracking-wide text-[#7C879B]">
                  <th className="px-3 py-2">ETF</th><th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 text-right">Your names</th>
                  <th className="px-3 py-2 text-right">% of ETF</th>
                  <th className="px-3 py-2">Holdings matched</th>
                  <th className="px-3 py-2 text-right">As-of</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.etf} className="border-t border-[#161D29] hover:bg-[#121723]">
                    <td className="px-3 py-1.5 font-semibold text-[#5BA8FF]">{r.etf}</td>
                    <td className="px-3 py-1.5 text-[#C3CAD7]" title={descs[r.etf] || undefined}>{r.name}{descs[r.etf] && <span className="ml-1 cursor-help text-[10px] text-[#5BA8FF]" title={descs[r.etf]}>ⓘ</span>}</td>
                    <td className="px-3 py-1.5 text-right text-[#C3CAD7]">{r.nMatched}/{submitted.length} <span className="text-[#7C879B]">({Math.round(r.coverage * 100)}%)</span></td>
                    <td className="px-3 py-1.5 text-right text-[#C3CAD7]">{(r.basketWeight * 100).toFixed(1)}%{r.suspect && <span title="yfinance weight flagged suspect" className="ml-1 text-[#E0B870]">⚠</span>}</td>
                    <td className="px-3 py-1.5"><div className="flex flex-wrap gap-1">{r.names.map((n) => <span key={n} className="rounded-sm bg-[#11243B] px-1.5 py-0.5 text-[11px] text-[#9CB6E0]">{n}</span>)}</div></td>
                    <td className="px-3 py-1.5 text-right text-[11px] text-[#7C879B]">{r.asof}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
