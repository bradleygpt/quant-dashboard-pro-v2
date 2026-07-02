import { tooltipProps } from "../components/ChartFrame";
import { ASSET, INK, LINE, SEM, SURFACE } from "../theme";
import { useMemo, useState } from "react";
import { Card, Metric } from "../components/ui";
import { fmtMoney, fmtPct } from "../lib/format";
import {
  ComposedChart, LineChart, Line, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ReferenceArea, Legend,
} from "recharts";
import {
  HALVINGS, HISTORICAL_CYCLES, ETF_EVENTS, cycleMilestones, cycleCountdown,
  buildCyclePctOverlay, getCurrentHalvingInfo, getCyclePhase, estimateNextHalvingFromBlock,
  btcValuationIndicators, interpretValuation, cycleTimeline,
} from "../lib/cycle";

type Series = { dates: string[]; close: number[] } | null | undefined;
interface Coin { price?: number; market_cap?: number; ath?: number; ath_change_pct?: number; change_24h_pct?: number; change_1y_pct?: number }

const TONE: Record<string, string> = { red: SEM.neg, orange: SEM.warnHot, yellow: SEM.warn, green: SEM.pos };
const TONE_DOT: Record<string, string> = { red: "🔴", orange: "🟠", yellow: "🟡", green: "🟢" };
const MARKER_COLOR: Record<string, string> = { halving: "#9B59B6", takeoff: "#3498DB", peak: SEM.pos, bottom: SEM.neg };
const MARKER_SHAPE: Record<string, "triangle" | "diamond" | "star" | "wye"> = { halving: "triangle", takeoff: "diamond", peak: "star", bottom: "wye" };

const TL_LABELS: Record<string, string> = {
  price: "BTC price", peakTrend: "Peak trendline", bottomTrend: "Bottom trendline",
  mk_halving: "Halving", mk_takeoff: "Takeoff", mk_peak: "Peak", mk_bottom: "Bottom",
  mp_halving: "Halving (proj.)", mp_takeoff: "Takeoff (proj.)", mp_peak: "Peak (proj.)", mp_bottom: "Bottom (proj.)",
};
// Custom tooltip: each entry shows ITS OWN datapoint value (fixes the all-same-price bug).
function TimelineTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const seen = new Set<string>();
  const items = payload.filter((p: any) => p?.value != null && p.dataKey && !seen.has(p.dataKey) && seen.add(p.dataKey));
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-line bg-head px-3 py-2 text-xs">
      <div className="mb-1 text-mute">{new Date(label).toLocaleDateString()}</div>
      {items.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span style={{ color: p.color || p.stroke || p.fill || INK.ink2 }}>{TL_LABELS[p.dataKey] ?? p.dataKey}</span>
          <span className="font-medium text-ink">${Math.round(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
const fmtMonthYear = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short" });
const fmtDayMonthYear = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const k = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`);

export default function CryptoBitcoin({ btcDaily, btc, blockHeight }: { btcDaily: Series; btc?: Coin; blockHeight?: number | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const [include2012, setInclude2012] = useState(true);
  const [show2012, setShow2012] = useState(false);
  const [showEtf, setShowEtf] = useState(true);

  const halving = useMemo(() => getCurrentHalvingInfo(today), [today]);
  const est = useMemo(() => estimateNextHalvingFromBlock(blockHeight, today), [blockHeight, today]);
  const phase = halving ? getCyclePhase(halving.days_since_last) : null;
  const indicators = useMemo(() => btcValuationIndicators(btcDaily), [btcDaily]);
  const interps = useMemo(() => interpretValuation(indicators), [indicators]);
  const cd = useMemo(() => cycleCountdown(today, include2012), [today, include2012]);
  const milestones = cycleMilestones();

  // refined next-halving (block-based) overrides the static estimate when available
  const nextHalvingDate = est?.estimated_date ?? halving?.next_halving ?? "2028-04-01";
  const daysUntilNext = est?.days_remaining ?? halving?.days_until_next ?? null;
  const progressPct = halving?.cycle_progress_pct ?? null;

  return (
    <div className="space-y-4">
      {/* ── 4-Year Halving Cycle Position ── */}
      <Card title="4-Year Halving Cycle Position" sub="Days since the April 2024 halving and where we sit in the cycle.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Days since halving" value={halving ? halving.days_since_last.toLocaleString() : "—"} hint={halving ? fmtDayMonthYear(halving.last_halving) : undefined} />
          <Metric label="Days until next halving" value={daysUntilNext != null ? daysUntilNext.toLocaleString() : "—"} hint={`~${fmtMonthYear(nextHalvingDate)}`} />
          <Metric label="Cycle progress" value={progressPct != null ? `${progressPct.toFixed(1)}%` : "N/A"} />
          <Metric label="Block reward" value={halving ? `${halving.current_reward} BTC` : "—"} />
        </div>
        {phase && (
          <div className="mt-3">
            <div className="text-sm font-semibold text-ink">Current Phase: {phase.phase}</div>
            <div className="text-xs text-mute">{phase.description}</div>
            {progressPct != null && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full bg-[#F7931A]" style={{ width: `${Math.min(progressPct, 100)}%` }} />
              </div>
            )}
          </div>
        )}
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-mute">⚠️ Important caveats about cycle theory</summary>
          <div className="mt-2 space-y-1 text-ink-3">
            <p>The 4-year halving cycle theory has only 3 prior cycles as data:</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>2012 halving → Nov 2013 peak (~12 months later)</li>
              <li>2016 halving → Dec 2017 peak (~17 months later)</li>
              <li>2020 halving → Nov 2021 peak (~18 months later)</li>
              <li>2024 halving → ??? (we are here)</li>
            </ul>
            <p className="pt-1">Spot Bitcoin ETFs (Jan 2024) brought sustained institutional flows for the first time; macro differs from prior cycles; each cycle's peak is a smaller multiple of the prior. Treat this as ONE input, not a forecast — pattern-matching on 3 data points is not robust.</p>
          </div>
        </details>
      </Card>

      {/* ── Current State ── */}
      {btc && (
        <Card title="Current State">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Price" value={btc.price != null ? fmtMoney(btc.price, 0) : "—"} hint={btc.change_24h_pct != null ? `${fmtPct(btc.change_24h_pct, 2, true)} 24h` : undefined} />
            <Metric label="Market Cap" value={btc.market_cap != null ? `$${(btc.market_cap / 1e9).toFixed(1)}B` : "—"} />
            <Metric label="All-Time High" value={btc.ath != null ? fmtMoney(btc.ath, 0) : "—"} hint={btc.ath_change_pct != null ? `${fmtPct(btc.ath_change_pct, 1, true)} from ATH` : undefined} />
            <Metric label="1-year change" value={btc.change_1y_pct != null ? fmtPct(btc.change_1y_pct, 1, true) : "N/A"} />
          </div>
        </Card>
      )}

      {/* ── Valuation Indicators ── */}
      <Card title="Valuation Indicators" sub="Mayer Multiple, Weekly RSI, Pi-Cycle Top, and distance from ATH — classic BTC cycle valuation gauges.">
        {interps.length > 0 ? (
          <div className="overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead><tr>{["Indicator", "Value", "Interpretation"].map((h) => <th key={h} className="bg-head px-3 py-2 text-left text-xs uppercase text-mute">{h}</th>)}</tr></thead>
              <tbody>
                {interps.map((it, i) => (
                  <tr key={i} className="border-t border-line-faint">
                    <td className="px-3 py-1.5 font-medium text-ink-2">{it.indicator}</td>
                    <td className="px-3 py-1.5 font-semibold" style={{ color: TONE[it.tone] }}>{it.value}</td>
                    <td className="px-3 py-1.5 text-ink-3">{TONE_DOT[it.tone]} {it.interp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="py-6 text-center text-sm text-mute">Valuation indicators need daily history (loading / unavailable).</div>}
      </Card>

      {/* ── Cycle Countdown + Timing ── */}
      <CycleCountdown cd={cd} milestones={milestones} include2012={include2012} setInclude2012={setInclude2012} nextHalvingDate={nextHalvingDate} />

      {/* ── Bitcoin Cycle Timeline ── */}
      <CycleTimelineChart btcDaily={btcDaily} include2012={include2012} show2012={show2012} setShow2012={setShow2012} showEtf={showEtf} setShowEtf={setShowEtf} setInclude2012={setInclude2012} today={today} />

      {/* ── Current Cycle vs Historical Projection (overlay band) ── */}
      <OverlayBand btcDaily={btcDaily} daysSinceHalving={cd.daysSinceHalving} />

      {/* ── Long-term price + halvings + 200w MA ── */}
      <LongTermPrice btcDaily={btcDaily} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
function CycleCountdown({ cd, milestones, include2012, setInclude2012, nextHalvingDate }: {
  cd: ReturnType<typeof cycleCountdown>; milestones: ReturnType<typeof cycleMilestones>;
  include2012: boolean; setInclude2012: (v: boolean) => void; nextHalvingDate: string;
}) {
  return (
    <Card title="📅 Cycle Countdown" sub={`Phase: ${cd.phase ? cd.phase[2] : "—"} · Averages from ${cd.avg.n} completed cycle${cd.avg.n !== 1 ? "s" : ""}: ${cd.avg.cycles_used.join(", ")}`}>
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs text-ink-3">
        <input type="checkbox" checked={include2012} onChange={(e) => setInclude2012(e.target.checked)} className="accent-[#F7931A]" />
        Include 2012 cycle in averages
        <span className="text-dim">(Cycle 1 peaked faster — 367d vs 526–547d later; adds a 3rd point but pulls averages earlier.)</span>
      </label>

      <div className="text-xs font-semibold uppercase text-mute">Current Cycle (post-Apr 2024 halving)</div>
      <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Days since halving" value={cd.daysSinceHalving} />
        <Metric label="Days since peak" value={cd.daysSincePeak ?? "—"} hint="Peak: Oct 6, 2025" />
        <Metric label="Projected cycle bottom" value={cd.projBottom ? fmtMonthYear(cd.projBottom) : "—"} hint={cd.daysToBottom != null ? (cd.daysToBottom > 0 ? `~${cd.daysToBottom} days away` : "passed if pattern held") : undefined} />
      </div>

      <div className="mt-3 text-xs font-semibold uppercase text-mute">Next Cycle (post-2028 halving)</div>
      <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Next halving (est.)" value={fmtMonthYear(nextHalvingDate)} hint={`~${cd.daysToNextHalving} days away`} />
        <Metric label="Estimated next takeoff" value={fmtMonthYear(cd.projNextTakeoff)} />
        <Metric label="Estimated next peak" value={fmtMonthYear(cd.projNextPeak)} />
      </div>

      <div className="mt-3 text-xs font-semibold uppercase text-mute">Historical Cycle Timing</div>
      <div className="mt-1 overflow-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead><tr>{["Cycle", "Halving", "→ Takeoff", "→ Peak", "→ Bottom", "Takeoff→Peak", "Peak→Bottom"].map((h) => <th key={h} className="bg-head px-3 py-2 text-left text-xs uppercase text-mute">{h}</th>)}</tr></thead>
          <tbody>
            {milestones.map((m, i) => (
              <tr key={i} className="border-t border-line-faint">
                <td className="px-3 py-1.5 font-medium" style={{ color: HISTORICAL_CYCLES[i].color }}>{m.label}</td>
                <td className="px-3 py-1.5 text-ink-3">{fmtMonthYear(m.halving)}</td>
                <td className="px-3 py-1.5">{m.days_to_takeoff ?? "—"}d</td>
                <td className="px-3 py-1.5">{m.days_to_peak ?? "—"}d</td>
                <td className="px-3 py-1.5">{m.days_to_bottom != null ? `${m.days_to_bottom}d` : "TBD"}</td>
                <td className="px-3 py-1.5">{m.days_takeoff_to_peak ?? "—"}d</td>
                <td className="px-3 py-1.5">{m.days_peak_to_bottom != null ? `${m.days_peak_to_bottom}d` : "TBD"}</td>
              </tr>
            ))}
            <tr className="border-t border-line-2 bg-head/40 font-semibold">
              <td className="px-3 py-1.5 text-ink">Average (per setting)</td>
              <td className="px-3 py-1.5 text-mute">—</td>
              <td className="px-3 py-1.5">{cd.avg.avg_days_to_takeoff}d</td>
              <td className="px-3 py-1.5">{cd.avg.avg_days_to_peak}d</td>
              <td className="px-3 py-1.5">{cd.avg.avg_days_to_bottom}d</td>
              <td className="px-3 py-1.5">{cd.avg.avg_days_takeoff_to_peak}d</td>
              <td className="px-3 py-1.5">{cd.avg.avg_days_peak_to_bottom}d</td>
            </tr>
          </tbody>
        </table>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-mute">⚠️ Why these projections may be wrong (especially this cycle)</summary>
        <div className="mt-2 space-y-1 text-ink-3">
          <p>The 4-year cycle has been fundamentally altered by spot ETF flows. Spot BTC ETFs launched Jan 11 2024 — three months BEFORE the halving — creating an institutional bid that did not exist in any prior cycle. BlackRock's IBIT alone holds hundreds of thousands of BTC that don't recirculate like retail-held BTC did.</p>
          <p>Past cycles peaked 526–547 days post-halving; the 2024 cycle peaked at day 535 — on schedule. But the post-peak drawdown (~40%) has been milder than 2018 (~83%) or 2022 (~78%), suggesting ETFs may provide a floor — or the cycle may simply be more drawn out. Treat projections as one input, not a forecast.</p>
        </div>
      </details>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
function CycleTimelineChart({ btcDaily, include2012, show2012, setShow2012, showEtf, setShowEtf, setInclude2012, today }: {
  btcDaily: Series; include2012: boolean; show2012: boolean; setShow2012: (v: boolean) => void;
  showEtf: boolean; setShowEtf: (v: boolean) => void; setInclude2012: (v: boolean) => void; today: string;
}) {
  const tl = useMemo(() => cycleTimeline(today, show2012, include2012), [today, show2012, include2012]);
  // Background BTC price line (weekly-sampled to keep it light), only what Yahoo has (~2016+)
  const bg = useMemo(() => {
    if (!btcDaily?.dates?.length) return [];
    const out: { t: number; price: number }[] = [];
    for (let i = 0; i < btcDaily.dates.length; i += 7) out.push({ t: Date.parse(btcDaily.dates[i]), price: btcDaily.close[i] });
    const last = btcDaily.dates.length - 1;
    out.push({ t: Date.parse(btcDaily.dates[last]), price: btcDaily.close[last] });
    return out;
  }, [btcDaily]);

  const allMarkers = [...tl.markers, ...tl.projMarkers];
  // Unified, index-aligned dataset: every series reads its own field from the SAME
  // row (keyed by timestamp), so the tooltip shows each series' own value — not the
  // cursor's price for all (the img1 bug, caused by separate per-series data arrays).
  const chartData = useMemo(() => {
    const rows = new Map<number, any>();
    const get = (t: number) => { let r = rows.get(t); if (!r) { r = { t }; rows.set(t, r); } return r; };
    for (const b of bg) get(b.t).price = b.price;
    for (const p of tl.peakTrend) get(p.t).peakTrend = p.y;
    for (const p of tl.bottomTrend) get(p.t).bottomTrend = p.y;
    for (const m of tl.markers) get(m.t)[`mk_${m.type}`] = m.price;
    for (const m of tl.projMarkers) get(m.t)[`mp_${m.type}`] = m.price;
    return [...rows.values()].sort((a, b) => a.t - b.t);
  }, [bg, tl]);

  // explicit domains covering markers, trendlines, projections, ETF lines, today
  const tVals = [...allMarkers.map((m) => m.t), ...bg.map((b) => b.t), tl.nextWindow.x1, tl.today, ...(showEtf ? ETF_EVENTS.map((e) => Date.parse(e.date)) : [])];
  const pVals = [...allMarkers.map((m) => m.price), ...bg.map((b) => b.price)];
  const tMin = Math.min(...tVals), tMax = Math.max(...tVals);
  const pMin = Math.max(1, Math.min(...pVals) * 0.6), pMax = Math.max(...pVals) * 1.4;

  return (
    <Card title="📊 Bitcoin Cycle Timeline" sub="Time on x-axis, BTC price (log) on y-axis. Each event marked at its actual price. Hollow markers are projections.">
      <details className="mb-2 text-xs">
        <summary className="cursor-pointer text-mute">ℹ️ What is a Bitcoin halving?</summary>
        <div className="mt-2 space-y-1 text-ink-3">
          <p>A halving is a protocol event (every ~210,000 blocks, ~4 years) that cuts new-BTC issuance to miners by 50%: 2012 (50→25), 2016 (25→12.5), 2020 (12.5→6.25), 2024 (6.25→3.125), 2028 est. (3.125→1.5625). This creates a programmed supply shock; historically BTC rallied 12–18 months after each.</p>
          <p>Halving markers (purple triangles) are plotted at the BTC price on the day each halving occurred — NOT at cycle lows. Halvings happen mid-recovery, so the 2020 marker at ~$8,800 sits ABOVE the 2018 bottom at $3,200.</p>
        </div>
      </details>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-ink-3">
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={show2012} onChange={(e) => setShow2012(e.target.checked)} className="accent-[#F7931A]" />Show 2012 cycle</label>
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={showEtf} onChange={(e) => setShowEtf(e.target.checked)} className="accent-[#9B59B6]" />Show ETF events</label>
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={include2012} onChange={(e) => setInclude2012(e.target.checked)} className="accent-[#3498DB]" />Include 2012 in averages</label>
      </div>
      {bg.length > 0 ? (
        <ResponsiveContainer width="100%" height={460}>
          <ComposedChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={SURFACE.raised} vertical={false} />
            <XAxis dataKey="t" type="number" domain={[tMin, tMax]} scale="time" allowDataOverflow tick={{ fill: INK.mute, fontSize: 11 }} minTickGap={50}
              tickFormatter={(t) => new Date(t).getFullYear().toString()} />
            <YAxis scale="log" domain={[pMin, pMax]} allowDataOverflow tick={{ fill: INK.mute, fontSize: 11 }} width={56} tickFormatter={k} />
            <Tooltip content={<TimelineTooltip />} />
            {/* projected next-cycle window */}
            <ReferenceArea x1={tl.nextWindow.x0} x2={tl.nextWindow.x1} fill="#9B59B6" fillOpacity={0.08} ifOverflow="extendDomain" />
            {/* background BTC price */}
            <Line dataKey="price" stroke={ASSET.btc} dot={false} strokeWidth={1.3} name="BTC price" isAnimationActive={false} connectNulls />
            {/* trendlines */}
            <Line dataKey="peakTrend" stroke={SEM.pos} strokeOpacity={0.5} strokeDasharray="5 4" dot={false} strokeWidth={1.6} name="Peak trendline" isAnimationActive={false} connectNulls />
            <Line dataKey="bottomTrend" stroke={SEM.neg} strokeOpacity={0.5} strokeDasharray="5 4" dot={false} strokeWidth={1.6} name="Bottom trendline" isAnimationActive={false} connectNulls />
            {/* event markers — actual (filled) + projected (hollow) per type */}
            {(["halving", "takeoff", "peak", "bottom"] as const).map((type) => (
              <Scatter key={type} dataKey={`mk_${type}`} fill={MARKER_COLOR[type]} shape={MARKER_SHAPE[type]} name={type} isAnimationActive={false} />
            ))}
            {(["halving", "takeoff", "peak", "bottom"] as const).map((type) => (
              <Scatter key={`p-${type}`} dataKey={`mp_${type}`} fill={SURFACE.head} stroke={MARKER_COLOR[type]} strokeWidth={1.5} shape={MARKER_SHAPE[type]} name={`${type} (proj.)`} isAnimationActive={false} />
            ))}
            {/* ETF event vlines */}
            {showEtf && ETF_EVENTS.map((e) => (
              <ReferenceLine key={e.date} x={Date.parse(e.date)} stroke={e.color} strokeDasharray="6 3" strokeOpacity={0.5}
                label={{ value: e.short_label, fill: e.color, fontSize: 9, position: "top" }} />
            ))}
            {/* today */}
            <ReferenceLine x={tl.today} stroke={SEM.neg} strokeWidth={2} label={{ value: "TODAY", fill: SEM.neg, fontSize: 11, position: "top" }} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : <div className="py-8 text-center text-sm text-mute">Price history loading / unavailable.</div>}
      <div className="mt-2 text-[10px] leading-relaxed text-dim">
        Triangles = halvings · diamonds = takeoffs · stars = peaks · Y-marks = bottoms (all at actual prices) · hollow = projected · dashed green/red = peak/bottom trendlines (with projection) · purple band = projected next-cycle window · red line = today.
        {show2012 ? "" : " The pre-2016 background price line is unavailable from Yahoo, so the 2012 cycle shows as event markers only — enable “Show 2012 cycle.”"}
      </div>
      {showEtf && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-mute">🏦 ETF Disruption Events</summary>
          <div className="mt-2 space-y-2 text-ink-3">
            {ETF_EVENTS.map((e) => (
              <div key={e.date}><span className="font-semibold text-ink-2">{fmtDayMonthYear(e.date)}</span> — {e.label}<div className="pl-3 text-mute">{e.description}</div><div className="pl-3"><span className="text-ink-2">Why it matters:</span> {e.impact}</div></div>
            ))}
          </div>
        </details>
      )}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-mute">⚠️ How projected ranges are calculated</summary>
        <div className="mt-2 space-y-1 text-ink-3">
          <p><span className="text-ink-2">Current-cycle bottom</span> (−65% to −85% from the ${Math.round(tl.curPeakPrice).toLocaleString()} peak): low ${Math.round(tl.ranges.bottomLow).toLocaleString()} · mid ${Math.round(tl.ranges.bottomMid).toLocaleString()} · high ${Math.round(tl.ranges.bottomHigh).toLocaleString()}.</p>
          <p><span className="text-ink-2">Next-cycle peak</span> (diminishing multiplier, 1.2×–1.6× prior peak): low ${Math.round(tl.ranges.peakLow).toLocaleString()} · mid ${Math.round(tl.ranges.peakMid).toLocaleString()} · high ${Math.round(tl.ranges.peakHigh).toLocaleString()}.</p>
          <p>Date projections use averages of {tl.avg.n} completed cycles ({tl.avg.cycles_used.join(", ")}). ±3 months error reasonable. This cycle's actual peak was ~0.60× a naive log-linear projection — diminishing returns are real; the conservative end may prove more accurate. Macro shocks can break any pattern.</p>
        </div>
      </details>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
function OverlayBand({ btcDaily, daysSinceHalving }: { btcDaily: Series; daysSinceHalving: number }) {
  const overlay = useMemo(() => buildCyclePctOverlay(btcDaily ?? null).filter((r) => r.day <= 1100), [btcDaily]);
  const pctFmt = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v)}%`;
  return (
    <Card title="Current Cycle vs Historical Projection" sub="% return since the halving (day 0). Band = the 2016 & 2020 cycles' return paths on the same % axis; solid orange = the current cycle. Above the band = outpacing history, below = lagging (diminishing-returns reality). Not absolute price — % change, so cycles are directly comparable.">
      {overlay.length > 0 ? (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={overlay} margin={{ top: 16, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={SURFACE.raised} vertical={false} />
            <XAxis dataKey="day" type="number" domain={[0, 1100]} tick={{ fill: INK.mute, fontSize: 11 }} minTickGap={40} tickFormatter={(d) => `${d}d`} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: INK.mute, fontSize: 11 }} width={56} tickFormatter={pctFmt} />
            <Tooltip {...tooltipProps}
              labelFormatter={(d) => `Day ${d} since halving`} formatter={(v: number, n: string) => [pctFmt(v), n]} />
            {/* day-0 halving marker + typical peak window highlight */}
            <ReferenceLine x={0} stroke={INK.mute} strokeDasharray="3 3" label={{ value: "Halving", fill: INK.mute, fontSize: 10, position: "insideTopLeft" }} />
            <ReferenceLine y={0} stroke={LINE.strong} />
            <ReferenceArea x1={520} x2={550} fill={SEM.pos} fillOpacity={0.15} label={{ value: "Peak window", fill: SEM.pos, fontSize: 9, position: "insideTop" }} />
            <ReferenceLine x={daysSinceHalving} stroke="#fff" strokeDasharray="3 3" label={{ value: "TODAY", fill: "#fff", fontSize: 10, position: "top" }} />
            <Line type="monotone" dataKey="proj_high" stroke="#3A4254" dot={false} strokeWidth={1} name="historical high (2016)" connectNulls />
            <Line type="monotone" dataKey="proj_median" stroke={INK.mute} dot={false} strokeWidth={1.2} strokeDasharray="3 3" name="median of cycles" connectNulls />
            <Line type="monotone" dataKey="proj_low" stroke="#3A4254" dot={false} strokeWidth={1} name="historical low (2020)" connectNulls />
            <Line type="monotone" dataKey="current" stroke={ASSET.btc} dot={false} strokeWidth={2.4} name="current cycle" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      ) : <div className="py-8 text-center text-sm text-mute">Projection unavailable.</div>}
      <div className="mt-1 text-[10px] text-dim">All series are % return since each cycle's halving (day 0) — no absolute-dollar scaling. Gray band = 2016/2020 return range; green = historical 520–550d peak window; orange = current cycle. Illustrative, not a prediction.</div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
function LongTermPrice({ btcDaily }: { btcDaily: Series }) {
  // Resample daily→weekly ONCE, then compute all MAs on that same series so every
  // MA spans the full available history (fixes the truncated MA: the old code joined
  // two different weekly resamplings by date, dropping most MA points). Units = weeks,
  // matching the existing 200-week MA.
  const longChart = useMemo(() => {
    if (!btcDaily?.dates?.length) return [];
    const byWeek = new Map<string, { date: string; close: number }>();
    for (let i = 0; i < btcDaily.dates.length; i++) {
      const d = new Date(btcDaily.dates[i]);
      const key = `${d.getUTCFullYear()}-${Math.floor(d.getTime() / (7 * 86400000))}`;
      byWeek.set(key, { date: btcDaily.dates[i], close: btcDaily.close[i] }); // last close in week
    }
    const weeks = [...byWeek.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const closes = weeks.map((w) => w.close);
    const trailingMA = (n: number, i: number): number | null => {
      if (i < n - 1) return null;
      let s = 0; for (let j = i - n + 1; j <= i; j++) s += closes[j];
      return s / n;
    };
    return weeks.map((w, i) => ({
      t: Date.parse(w.date), close: w.close,
      ma21: trailingMA(21, i), ma50: trailingMA(50, i), ma200: trailingMA(200, i),
    }));
  }, [btcDaily]);

  const MA_LABEL: Record<string, string> = { close: "BTC", ma21: "21w MA", ma50: "50w MA", ma200: "200w MA" };
  return (
    <Card title="Long-term Price with Halvings" sub="Log scale · 21 / 50 / 200-week moving averages · halving markers">
      {longChart.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={longChart} margin={{ top: 5, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={SURFACE.raised} vertical={false} />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => new Date(t).getFullYear().toString()} tick={{ fill: INK.mute, fontSize: 11 }} minTickGap={50} />
            <YAxis scale="log" domain={["auto", "auto"]} allowDataOverflow tick={{ fill: INK.mute, fontSize: 11 }} width={56} tickFormatter={k} />
            <Tooltip {...tooltipProps}
              labelFormatter={(t) => new Date(t).toLocaleDateString()} formatter={(v: number, n: string) => [`$${Math.round(v).toLocaleString()}`, MA_LABEL[n] ?? n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {HALVINGS.filter((h) => Date.parse(h.date) <= Date.now()).map((h) => (
              <ReferenceLine key={h.date} x={Date.parse(h.date)} stroke={ASSET.btc} strokeDasharray="3 3" opacity={0.6} label={{ value: `⌗ ${new Date(h.date).getFullYear()}`, fill: ASSET.btc, fontSize: 10, position: "top" }} />
            ))}
            <Line type="monotone" dataKey="close" stroke={ASSET.btc} dot={false} strokeWidth={1.4} name="BTC" />
            <Line type="monotone" dataKey="ma21" stroke={SEM.posSoft} dot={false} strokeWidth={1.2} strokeDasharray="2 2" name="21w MA" connectNulls />
            <Line type="monotone" dataKey="ma50" stroke={SEM.warn} dot={false} strokeWidth={1.2} strokeDasharray="3 2" name="50w MA" connectNulls />
            <Line type="monotone" dataKey="ma200" stroke="#5DADE2" dot={false} strokeWidth={1.6} strokeDasharray="4 2" name="200w MA" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      ) : <div className="py-8 text-center text-sm text-mute">Price history loading / unavailable.</div>}
    </Card>
  );
}
