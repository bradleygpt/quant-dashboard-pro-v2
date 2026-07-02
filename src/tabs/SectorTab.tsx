import { tooltipProps } from "../components/ChartFrame";
import { useEffect, useMemo, useState } from "react";
import { useStore, type ViewRow } from "../store";
import { Card, RatingBadge, GradePill, Spinner } from "../components/ui";
import { SortableTable, RATING_RANK, type Column } from "../components/SortableTable";
import { fmtMoney } from "../lib/format";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from "recharts";
import { ASSET, INK, SEM, SURFACE } from "../theme";

const PILLAR_ABBR: Record<string, string> = { Valuation: "Val", Growth: "Grw", Profitability: "Prof", Momentum: "Mom", "EPS Revisions": "EPS" };
const RATING_COLS = ["Strong Buy+", "Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"];

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); // sample std (pandas default ddof=1)
}

interface SectorRow {
  rank: number; sector: string; count: number; totalMcap: number; estEarnings: number; aggPe: number | null;
  avgScore: number; medianScore: number; stdScore: number; aRatedPct: number;
  ratingCounts: Record<string, number>; pillarGrades: Record<string, string>;
  best: string; worst: string;
}

export default function SectorTab() {
  const { rows, loadingUniverse, goToDetail, meta } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [narr, setNarr] = useState<Record<string, { narrative: string }> | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/sector_narratives.json`).then((r) => (r.ok ? r.json() : null))
      .then((j) => setNarr(j?.sectors ?? null)).catch(() => {});
  }, []);

  const gradeFromScore = useMemo(() => {
    const entries = Object.entries(meta.grade_scores ?? {});
    return (score: number): string => {
      if (!entries.length) return "—";
      let best = entries[0]; for (const e of entries) if (Math.abs(e[1] - score) < Math.abs(best[1] - score)) best = e;
      return best[0];
    };
  }, [meta.grade_scores]);

  const { sectors, bySector } = useMemo(() => {
    const map = new Map<string, ViewRow[]>();
    for (const r of rows) { if (r.sector === "ETF" || !r.sector) continue; (map.get(r.sector) ?? map.set(r.sector, []).get(r.sector)!).push(r); }
    const list: Omit<SectorRow, "rank">[] = [];
    for (const [sector, rs] of map) {
      const scores = rs.map((r) => r.composite);
      const totalMcap = rs.reduce((a, r) => a + (r.marketCapB ?? 0), 0);
      const estEarnings = rs.reduce((a, r) => { const pe = r.raw?.trailingPE; const mc = r.marketCapB ?? 0; return a + (pe && pe > 0 && mc > 0 ? mc / pe : 0); }, 0);
      const ratingCounts: Record<string, number> = {};
      for (const c of RATING_COLS) ratingCounts[c] = 0;
      for (const r of rs) ratingCounts[r.rating] = (ratingCounts[r.rating] ?? 0) + 1;
      const aRated = (ratingCounts["Strong Buy+"] ?? 0) + (ratingCounts["Strong Buy"] ?? 0) + (ratingCounts["Buy"] ?? 0);
      const pillarGrades: Record<string, string> = {};
      for (const p of meta.pillars ?? []) {
        const vals = rs.map((r) => r.pillars[p]).filter((v): v is number => v != null);
        pillarGrades[p] = vals.length ? gradeFromScore(vals.reduce((a, b) => a + b, 0) / vals.length) : "—";
      }
      const sorted = [...rs].sort((a, b) => b.composite - a.composite);
      list.push({
        sector, count: rs.length, totalMcap, estEarnings, aggPe: estEarnings > 0 ? totalMcap / estEarnings : null,
        avgScore: scores.reduce((a, b) => a + b, 0) / rs.length, medianScore: median(scores), stdScore: std(scores),
        aRatedPct: rs.length ? (aRated / rs.length) * 100 : 0, ratingCounts, pillarGrades,
        best: sorted[0]?.ticker ?? "", worst: sorted[sorted.length - 1]?.ticker ?? "",
      });
    }
    list.sort((a, b) => b.avgScore - a.avgScore);
    const sectors: SectorRow[] = list.map((s, i) => ({ rank: i + 1, ...s }));
    return { sectors, bySector: map };
  }, [rows, meta.pillars, gradeFromScore]);

  const comboData = useMemo(() => [...sectors].sort((a, b) => b.totalMcap - a.totalMcap).map((s) => ({ sector: s.sector, earnings: s.estEarnings, mcap: s.totalMcap })), [sectors]);

  const stockCols = useMemo<Column<ViewRow>[]>(() => [
    { key: "ticker", header: "Ticker", sortValue: (r) => r.ticker, render: (r) => <button onClick={() => goToDetail(r.ticker)} className="font-semibold text-link hover:underline">{r.ticker}</button> },
    { key: "name", header: "Name", sortValue: (r) => r.name ?? "", render: (r) => <span className="block max-w-[240px] truncate text-ink-2">{r.name}</span> },
    { key: "composite", header: "Score", align: "right", sortValue: (r) => r.composite, render: (r) => <span className="font-semibold">{r.composite.toFixed(2)}</span> },
    { key: "rating", header: "Rating", sortValue: (r) => RATING_RANK[r.rating] ?? 0, render: (r) => <RatingBadge rating={r.rating} /> },
    { key: "price", header: "Price", align: "right", sortValue: (r) => r.price, render: (r) => fmtMoney(r.price) },
    { key: "fv", header: "FV", align: "right", sortValue: (r) => r.fv, render: (r) => fmtMoney(r.fv) },
    { key: "qbp", header: "QBP", align: "right", sortValue: (r) => r.qbp, render: (r) => fmtMoney(r.qbp) },
  ], [goToDetail]);

  if (loadingUniverse) return <Spinner />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white">Sector Overview</h2>

      {/* ── AI Sector Read (Ollama narrative over the quant's sector aggregates) ── */}
      {narr && Object.values(narr).some((s) => s?.narrative) && (
        <Card title="AI Sector Read" sub="LLM narrative over the quant's sector aggregates — fed only pre-computed stats, never invented.">
          <div className="space-y-3">
            {sectors.filter((s) => narr[s.sector]?.narrative).map((s) => (
              <div key={s.sector}>
                <div className="text-sm font-semibold text-link/75">{s.sector}
                  <span className="ml-1.5 text-[11px] font-normal text-mute">avg {s.avgScore.toFixed(1)} · {s.count} names · {s.aRatedPct.toFixed(0)}% Buy-tier</span>
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{narr[s.sector].narrative}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Market Cap + Earnings dual-axis combo ── */}
      <Card title="Sector Aggregates: Market Cap & Earnings" sub="Aggregate trailing-12-month earnings (bars, left) and total market cap (line, right) per sector. Earnings ≈ Σ market cap ÷ trailing P/E.">
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={comboData} margin={{ top: 12, right: 20, bottom: 56, left: 8 }}>
            <CartesianGrid stroke={SURFACE.raised} vertical={false} />
            <XAxis dataKey="sector" tick={{ fill: INK.mute, fontSize: 10 }} angle={-30} textAnchor="end" interval={0} height={60} />
            <YAxis yAxisId="e" tick={{ fill: INK.mute, fontSize: 11 }} width={60} tickFormatter={(v) => `$${v.toFixed(0)}B`} />
            <YAxis yAxisId="m" orientation="right" tick={{ fill: INK.mute, fontSize: 11 }} width={64} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}T`} />
            <Tooltip {...tooltipProps} formatter={(v: number, n) => [`$${Math.round(v).toLocaleString()}B`, n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="e" dataKey="earnings" fill={SEM.warn} fillOpacity={0.7} name="Aggregate TTM Earnings ($B)" />
            <Line yAxisId="m" type="monotone" dataKey="mcap" stroke={ASSET.eth} strokeWidth={3} dot={{ r: 3 }} name="Total Market Cap ($B)" />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Valuation snapshot ── */}
      <Card title="Sector Valuation Snapshot" sub="Aggregate P/E = total market cap ÷ total earnings across the sector population.">
        <div className="overflow-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead><tr>{["Sector", "Stocks", "Mkt Cap", "Earnings", "Agg P/E", "Avg Score", "Score Dispersion"].map((h) => <th key={h} className="bg-head px-3 py-2 text-left text-xs uppercase text-mute">{h}</th>)}</tr></thead>
            <tbody>
              {[...sectors].sort((a, b) => b.totalMcap - a.totalMcap).map((s) => (
                <tr key={s.sector} className="border-t border-line-faint">
                  <td className="px-3 py-1.5 font-medium text-ink-2">{s.sector}</td>
                  <td className="px-3 py-1.5">{s.count}</td>
                  <td className="px-3 py-1.5">${Math.round(s.totalMcap).toLocaleString()}B</td>
                  <td className="px-3 py-1.5">${Math.round(s.estEarnings).toLocaleString()}B</td>
                  <td className="px-3 py-1.5">{s.aggPe != null ? `${s.aggPe.toFixed(1)}x` : "N/A"}</td>
                  <td className="px-3 py-1.5">{s.avgScore.toFixed(1)}</td>
                  <td className="px-3 py-1.5">{s.stdScore.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Quality distribution (A-rated %) ── */}
      <Card title="Sector Quality Distribution" sub="% of stocks rated Buy-tier (Strong Buy+ / Strong Buy / Buy) — where the highest-conviction opportunities concentrate.">
        <ResponsiveContainer width="100%" height={Math.max(220, sectors.length * 26)}>
          <ComposedChart layout="vertical" data={[...sectors].sort((a, b) => b.aRatedPct - a.aRatedPct)} margin={{ left: 50, right: 30 }}>
            <CartesianGrid stroke={SURFACE.raised} horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fill: INK.mute, fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="sector" width={140} tick={{ fill: INK.ink3, fontSize: 11 }} />
            <Tooltip {...tooltipProps} formatter={(v: number) => [`${v.toFixed(0)}%`, "A-rated"]} />
            <Bar dataKey="aRatedPct" radius={[0, 3, 3, 0]}>
              {[...sectors].sort((a, b) => b.aRatedPct - a.aRatedPct).map((s) => <Cell key={s.sector} fill={s.aRatedPct >= 40 ? SEM.pos : s.aRatedPct >= 20 ? SEM.warn : SEM.negDeep} />)}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Full sector detail: rank + rating distribution + pillar grades ── */}
      <Card title="Full Sector Detail" sub="Rank by avg score, rating distribution, and aggregate pillar grades. Click a sector to drill into its stocks.">
        <div className="overflow-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["#", "Sector", "Stocks", "Avg"].map((h) => <th key={h} className="bg-head px-2 py-2 text-left text-xs uppercase text-mute">{h}</th>)}
                {RATING_COLS.map((h) => <th key={h} className="bg-head px-2 py-2 text-right text-xs uppercase text-mute">{h.replace("Strong Buy+", "SB+").replace("Strong Buy", "SB").replace("Strong Sell", "SS")}</th>)}
                {(meta.pillars ?? []).map((p) => <th key={p} className="bg-head px-2 py-2 text-center text-xs uppercase text-mute">{PILLAR_ABBR[p] ?? p}</th>)}
                {["Best", "Worst"].map((h) => <th key={h} className="bg-head px-2 py-2 text-left text-xs uppercase text-mute">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {sectors.map((s) => (
                <tr key={s.sector} className="border-t border-line-faint">
                  <td className="px-2 py-1.5 text-mute">{s.rank}</td>
                  <td className="px-2 py-1.5"><button onClick={() => setOpen(open === s.sector ? null : s.sector)} className="font-medium text-white hover:text-link">{s.sector} {open === s.sector ? "▲" : "▾"}</button></td>
                  <td className="px-2 py-1.5">{s.count}</td>
                  <td className="px-2 py-1.5 font-semibold">{s.avgScore.toFixed(1)}</td>
                  {RATING_COLS.map((c) => <td key={c} className="px-2 py-1.5 text-right text-ink-3">{s.ratingCounts[c] || 0}</td>)}
                  {(meta.pillars ?? []).map((p) => <td key={p} className="px-2 py-1.5 text-center"><GradePill grade={s.pillarGrades[p]} /></td>)}
                  <td className="px-2 py-1.5"><button onClick={() => goToDetail(s.best)} className="text-link hover:underline">{s.best}</button></td>
                  <td className="px-2 py-1.5"><button onClick={() => goToDetail(s.worst)} className="text-link hover:underline">{s.worst}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <Card title={`${open} — ${bySector.get(open)?.length ?? 0} stocks`}>
          <SortableTable columns={stockCols} rows={bySector.get(open) ?? []} rowKey={(r) => r.ticker} initialSortKey="composite" initialSortDir="desc" maxHeight="60vh" />
        </Card>
      )}
    </div>
  );
}
