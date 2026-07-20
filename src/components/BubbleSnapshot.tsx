// AI Bubble Watch — live monthly snapshot section (handoff §4, 2026-07-20).
// Data layer (build_bubblewatch_snapshot.py, monthly CI) and commentary layer
// (Claude Code queue) are separate: data never depends on AI, and a missing
// commentary shows "pending" — it never blocks fresh numbers.
import { useEffect, useState } from "react";
import { Card, Spinner } from "./ui";
import { loadDataJSON } from "../lib/data";
import { INK, SEM, SURFACE, alpha } from "../theme";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { tooltipProps } from "./ChartFrame";

interface Component { value: number; unit: string; score: number; anchor: string }
interface Snapshot {
  month: string; generated_at: string;
  capex: Record<string, { ttm_usd_bn: number | null; quarters: { end: string; usd_bn: number }[] }>;
  capex_ttm_total_bn: number | null;
  valuations: Record<string, { fwd_pe: number | null; ev_s: number | null; mcap_bn: number | null }>;
  credit: { hy_oas_pct: number | null; asof: string | null };
  composite: { reading: number | null; components: Record<string, Component>; method: string };
}
interface Commentary { month: string; generated_at: string; summary: string; watch_items: string[] }
interface Index { months: string[]; latest: string; commentary_months: string[] }

const COMP_LABEL: Record<string, string> = {
  capex_intensity: "Capex intensity",
  valuation: "Valuation",
  credit_froth: "Credit froth",
};

export default function BubbleSnapshot() {
  const [idx, setIdx] = useState<Index | null | undefined>(undefined);
  const [month, setMonth] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [comm, setComm] = useState<Commentary | null>(null);
  const [trend, setTrend] = useState<{ month: string; composite: number | null; capex: number | null }[]>([]);

  useEffect(() => {
    loadDataJSON<Index>("bubblewatch_index.json").then((i) => { setIdx(i); if (i) setMonth(i.latest); });
  }, []);

  useEffect(() => {
    if (!idx || !month) return;
    let live = true;
    loadDataJSON<Snapshot>(`bubblewatch/${month}.json`).then((s) => live && setSnap(s));
    if (idx.commentary_months.includes(month))
      loadDataJSON<Commentary>(`bubblewatch/commentary_${month}.json`).then((c) => live && setComm(c));
    else setComm(null);
    return () => { live = false; };
  }, [idx, month]);

  useEffect(() => {
    if (!idx || idx.months.length < 2) return;
    Promise.all(idx.months.map(async (m) => {
      const s = await loadDataJSON<Snapshot>(`bubblewatch/${m}.json`);
      return { month: m, composite: s?.composite?.reading ?? null, capex: s?.capex_ttm_total_bn ?? null };
    })).then(setTrend);
  }, [idx]);

  if (idx === undefined) return <Spinner label="Loading monthly snapshot…" />;
  if (!idx) return null; // no snapshots shipped yet — the page keeps its static content
  if (!snap) return <Spinner label={`Loading ${month}…`} />;

  const comps = Object.entries(snap.composite.components);
  const capexRows = Object.entries(snap.capex)
    .map(([tk, c]) => ({ tk, ttm: c.ttm_usd_bn }))
    .filter((r) => r.ttm != null)
    .sort((a, b) => (b.ttm! - a.ttm!));
  const valRows = Object.entries(snap.valuations)
    .filter(([, v]) => v.mcap_bn != null)
    .sort(([, a], [, b]) => (b.mcap_bn! - a.mcap_bn!));

  return (
    <Card title={`Live monthly snapshot — ${snap.month}`} sub={`Automated data layer (SEC capex · yfinance valuations · FRED HY OAS), refreshed monthly. Commentary is generated separately and never blocks the data. Snapshot ${snap.generated_at?.slice(0, 10)}.`}>
      {/* composite + components */}
      <div className="flex flex-wrap items-start gap-6">
        <div>
          <div className="text-4xl font-bold text-white">{snap.composite.reading ?? "—"}<span className="text-base text-mute">/100</span></div>
          <div className="text-[11px] text-mute">historical-analog composite</div>
        </div>
        <div className="min-w-[260px] flex-1 space-y-1">
          {comps.map(([k, c]) => (
            <div key={k} className="flex items-center gap-2 text-xs" title={c.anchor}>
              <span className="w-28 text-mute">{COMP_LABEL[k] ?? k}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-raised"><div className="h-full rounded" style={{ width: `${c.score}%`, background: c.score >= 70 ? SEM.neg : c.score >= 40 ? SEM.warn : SEM.pos }} /></div>
              <span className="w-9 text-right text-ink-3">{c.score}</span>
              <span className="w-40 text-right text-dim">{c.value} {c.unit.split(" ")[0]}</span>
            </div>
          ))}
          <div className="pt-1 text-[10px] text-dim">Hover a row for its analog anchor. HY OAS {snap.credit.hy_oas_pct ?? "—"}% as-of {snap.credit.asof ?? "—"}.</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* capex TTM */}
        <div>
          <div className="mb-1 text-xs font-semibold text-ink-2">Hyperscaler capex, TTM (${snap.capex_ttm_total_bn}B total)</div>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={capexRows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={SURFACE.raised} vertical={false} />
              <XAxis dataKey="tk" tick={{ fill: INK.mute, fontSize: 11 }} />
              <YAxis tick={{ fill: INK.mute, fontSize: 11 }} width={40} tickFormatter={(v) => `$${v}B`} />
              <Tooltip {...tooltipProps} formatter={(v: number) => [`$${v}B TTM`, "capex"]} />
              <Bar dataKey="ttm">{capexRows.map((r, i) => <Cell key={i} fill={alpha(SEM.link, 0.55)} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* valuation table */}
        <div>
          <div className="mb-1 text-xs font-semibold text-ink-2">AI-complex valuations</div>
          <div className="max-h-[180px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-mute"><th className="py-0.5 text-left">Ticker</th><th className="py-0.5 text-right">Mcap $B</th><th className="py-0.5 text-right">Fwd P/E</th><th className="py-0.5 text-right">EV/S</th></tr></thead>
              <tbody>
                {valRows.map(([tk, v]) => (
                  <tr key={tk} className="border-t border-line-faint">
                    <td className="py-0.5 font-semibold text-ink-1">{tk}</td>
                    <td className="py-0.5 text-right text-ink-2">{v.mcap_bn?.toLocaleString() ?? "—"}</td>
                    <td className="py-0.5 text-right text-ink-2">{v.fwd_pe?.toFixed(1) ?? "—"}</td>
                    <td className="py-0.5 text-right text-ink-2">{v.ev_s?.toFixed(1) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* trend — grows as months accumulate */}
      {trend.length >= 2 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold text-ink-2">Trend (composite + total TTM capex)</div>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={SURFACE.raised} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: INK.mute, fontSize: 11 }} />
              <YAxis yAxisId="l" tick={{ fill: INK.mute, fontSize: 11 }} width={34} domain={[0, 100]} />
              <YAxis yAxisId="r" orientation="right" tick={{ fill: INK.mute, fontSize: 11 }} width={44} tickFormatter={(v) => `$${v}B`} />
              <Tooltip {...tooltipProps} />
              <Line yAxisId="l" type="monotone" dataKey="composite" stroke={SEM.warn} dot strokeWidth={1.6} />
              <Line yAxisId="r" type="monotone" dataKey="capex" stroke={SEM.link} dot strokeWidth={1.6} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* commentary */}
      <div className="mt-4 rounded-lg border border-line p-3">
        <div className="text-[11px] font-semibold uppercase text-mute">Commentary — {month}</div>
        {comm ? (
          <>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">{comm.summary}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-3">
              {comm.watch_items?.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
            <div className="mt-1 text-[10px] text-dim">generated {comm.generated_at?.slice(0, 10)}</div>
          </>
        ) : (
          <p className="mt-1 text-xs text-mute">Commentary pending — fresh numbers above are live; the monthly commentary generates separately in Claude Code.</p>
        )}
      </div>

      {/* archive */}
      {idx.months.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-mute">Archive:</span>
          {[...idx.months].reverse().map((m) => (
            <button key={m} onClick={() => setMonth(m)}
              className={`rounded border px-1.5 py-0.5 ${m === month ? "border-link text-link" : "border-line text-ink-3 hover:bg-hover"}`}>
              {m}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
