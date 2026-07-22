// Quarterly earnings card — reworked 2026-07-21 (Bradley's spec): default view is
// EPS bars (split-adjusted diluted, dollars) + market-cap line (quarter-end close ×
// same-period shares — never current shares backfilled), revenue in the tooltip and
// a latest-quarter + TTM revenue header line. The YoY-growth view stays as a toggle
// (directional info, demoted from default). Provenance travels in the caption (S5);
// derived EPS points (Q4 = FY − ΣQ1..3) are flagged in the tooltip, never silent.
import { useMemo, useState } from "react";
import { Card, Unavailable } from "./ui";
import { INK, SEM, SURFACE, alpha } from "../theme";
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

interface QRow {
  date?: string;
  revenueGrowth?: number | null; earningsGrowth?: number | null;
  eps?: number | null; epsDerived?: boolean | null; mcapB?: number | null; revenue?: number | null;
}

// YoY display clamp (%): a near-zero year-ago base prints ±1000%+ and auto-scales
// every normal bar into invisibility; tooltip always shows the true value.
const YOY_CLIP = 150;

const fmtRev = (v?: number | null) =>
  v == null ? "—" : v >= 1e9 ? `$${(v / 1e9).toFixed(v >= 1e10 ? 0 : 1)}B` : `$${Math.round(v / 1e6)}M`;

export default function QuarterlyEarningsCard({ qhist, quarterlyErr }: { qhist: QRow[]; quarterlyErr: boolean }) {
  const hasEps = useMemo(() => qhist.some((q) => q.eps != null || q.mcapB != null), [qhist]);
  const [view, setView] = useState<"eps" | "yoy">("eps");
  const mode = hasEps ? view : "yoy"; // pre-rework bakes have no EPS fields — YoY only

  const asc = useMemo(() => [...qhist].reverse(), [qhist]);
  const latest = qhist[0];
  const ttmRev = useMemo(() => {
    const vals = qhist.slice(0, 4).map((q) => q.revenue).filter((v): v is number => v != null);
    return vals.length === 4 ? vals.reduce((a, b) => a + b, 0) : null;
  }, [qhist]);

  if (quarterlyErr)
    return <Unavailable what="Quarterly fundamentals" detail="quarterly.json failed to load — the earnings chart is hidden rather than silently absent." />;
  if (!qhist.length) return null;

  const sub = mode === "eps"
    ? "Bars: split-adjusted diluted EPS as reported to EDGAR (Q4 points derived from FY − ΣQ1–Q3 are flagged in the tooltip). Line: quarter-end market cap = same-period shares outstanding × quarter-end close (price and shares in the same basis — buybacks/dilution are real, not current-count backfill). Revenue per quarter in the tooltip. A quarter without a reported figure shows a GAP, never 0."
    : `YoY growth view (directional info). Bars: earnings growth (green ≥0 / red <0); line: revenue growth. A quarter with no year-ago comparison shows a GAP (not 0%). Display clipped at ±${YOY_CLIP}% — hover shows the true value.`;

  return (
    <Card title="Quarterly Earnings" asOfSource="quarterly" sub={sub}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-ink-2">
          {latest?.revenue != null && <span className="mr-3">Latest quarter revenue <strong className="text-ink-1">{fmtRev(latest.revenue)}</strong>{latest?.date ? <span className="text-mute"> ({String(latest.date).slice(0, 7)})</span> : null}</span>}
          {ttmRev != null && <span>TTM revenue <strong className="text-ink-1">{fmtRev(ttmRev)}</strong></span>}
        </div>
        {hasEps && (
          <div className="flex gap-1">
            {(["eps", "yoy"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`rounded border px-2 py-0.5 text-[11px] ${mode === v ? "border-link text-link" : "border-line text-ink-3 hover:bg-hover"}`}>
                {v === "eps" ? "EPS & Market Cap" : "YoY growth"}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === "eps" ? (
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart
            data={asc.map((q) => ({
              date: (q.date || "").slice(0, 7),
              eps: q.eps ?? null,
              mcapB: q.mcapB ?? null,
              revenue: q.revenue ?? null,
              epsDerived: !!q.epsDerived,
            }))}
            margin={{ top: 5, right: 10, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke={SURFACE.raised} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: INK.mute, fontSize: 11 }} />
            <YAxis tick={{ fill: INK.mute, fontSize: 11 }} width={48} tickFormatter={(v) => `$${v}`} />
            <YAxis yAxisId="mc" orientation="right" tick={{ fill: INK.mute, fontSize: 10 }} width={52} tickFormatter={(v) => `$${v}B`} domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{ background: SURFACE.raised, border: `1px solid ${SURFACE.active}`, fontSize: 12 }}
              formatter={(v: number, n, item: any) => {
                if (n === "eps") return [v == null ? "n/a (not reported)" : `$${v.toFixed(2)}${item?.payload?.epsDerived ? " (derived: FY − ΣQ1–Q3)" : ""}`, "Diluted EPS"];
                if (n === "mcapB") return [v == null ? "n/a" : `$${v >= 100 ? Math.round(v) : v.toFixed(1)}B`, "Market cap"];
                return [v, n];
              }}
              // revenue rides the payload — surfaced via the labelFormatter line below
              labelFormatter={(label: string, payload: any[]) => {
                const rev = payload?.[0]?.payload?.revenue;
                return `${label}${rev != null ? ` · revenue ${fmtRev(rev)}` : ""}`;
              }}
            />
            <Bar dataKey="eps">
              {asc.map((q, i) => (
                <Cell key={i} fill={q.eps == null ? "transparent" : q.eps >= 0 ? alpha(SEM.pos, 0.55) : alpha(SEM.neg, 0.5)} />
              ))}
            </Bar>
            <Line yAxisId="mc" type="monotone" dataKey="mcapB" stroke={alpha(SEM.link, 0.85)} dot={{ r: 2 }} strokeWidth={1.6} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          {/* YoY growth is null when the year-ago quarter is absent — null maps to a GAP
              (missing bar / broken line), never a fabricated 0%. epsC/revC are DISPLAY
              values clamped to ±YOY_CLIP; the tooltip reads the raw values. */}
          <ComposedChart
            data={asc.map((q) => {
              const eps = q.earningsGrowth != null ? q.earningsGrowth * 100 : null;
              const rev = q.revenueGrowth != null ? q.revenueGrowth * 100 : null;
              const clamp = (v: number | null) => (v == null ? null : Math.max(-YOY_CLIP, Math.min(YOY_CLIP, v)));
              return { date: (q.date || "").slice(0, 7), eps, rev, epsC: clamp(eps), revC: clamp(rev) };
            })}
            margin={{ top: 5, right: 10, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke={SURFACE.raised} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: INK.mute, fontSize: 11 }} />
            <YAxis tick={{ fill: INK.mute, fontSize: 11 }} width={44} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{ background: SURFACE.raised, border: `1px solid ${SURFACE.active}`, fontSize: 12 }}
              formatter={(v: number, n, item: any) => {
                const raw = n === "epsC" ? item?.payload?.eps : item?.payload?.rev;
                const label = n === "epsC" ? "Earnings YoY" : "Revenue YoY";
                return [raw == null ? "n/a (no year-ago quarter)" : `${raw >= 0 ? "+" : ""}${raw.toFixed(1)}%${Math.abs(raw) > YOY_CLIP ? " (bar clipped)" : ""}`, label];
              }}
            />
            <Bar dataKey="epsC">
              {asc.map((q, i) => (
                <Cell key={i} fill={q.earningsGrowth == null ? "transparent" : q.earningsGrowth >= 0 ? alpha(SEM.pos, 0.5) : alpha(SEM.neg, 0.45)} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="revC" stroke={SEM.warn} dot={false} strokeWidth={1.6} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
