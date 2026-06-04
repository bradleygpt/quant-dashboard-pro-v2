import { useMemo, useState } from "react";
import { Card, Metric } from "../components/ui";
import { fmtMoney, fmtPct } from "../lib/format";
import {
  ComposedChart, LineChart, Line, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import {
  HALVINGS, HISTORICAL_CYCLES, ETF_EVENTS, cycleMilestones, cycleCountdown, weekly200MA,
  buildCycleOverlay, getCurrentHalvingInfo, getCyclePhase, estimateNextHalvingFromBlock,
  btcValuationIndicators, interpretValuation, cycleTimeline,
} from "../lib/cycle";

type Series = { dates: string[]; close: number[] } | null | undefined;
interface Coin { price?: number; market_cap?: number; ath?: number; ath_change_pct?: number; change_24h_pct?: number; change_1y_pct?: number }

const TONE: Record<string, string> = { red: "#FF5722", orange: "#FF9800", yellow: "#FFC107", green: "#00C805" };
const TONE_DOT: Record<string, string> = { red: "🔴", orange: "🟠", yellow: "🟡", green: "🟢" };
const MARKER_COLOR: Record<string, string> = { halving: "#9B59B6", takeoff: "#3498DB", peak: "#27AE60", bottom: "#E74C3C" };
const MARKER_SHAPE: Record<string, "triangle" | "diamond" | "star" | "wye"> = { halving: "triangle", takeoff: "diamond", peak: "star", bottom: "wye" };

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
            <div className="text-sm font-semibold text-[#E6E9EF]">Current Phase: {phase.phase}</div>
            <div className="text-xs text-[#7C879B]">{phase.description}</div>
            {progressPct != null && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#1A2130]">
                <div className="h-full rounded-full bg-[#F7931A]" style={{ width: `${Math.min(progressPct, 100)}%` }} />
              </div>
            )}
          </div>
        )}
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-[#7C879B]">⚠️ Important caveats about cycle theory</summary>
          <div className="mt-2 space-y-1 text-[#9CA7BB]">
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
          <div className="overflow-auto rounded-lg border border-[#1E2632]">
            <table className="w-full text-sm">
              <thead><tr>{["Indicator", "Value", "Interpretation"].map((h) => <th key={h} className="bg-[#0F1420] px-3 py-2 text-left text-xs uppercase text-[#7C879B]">{h}</th>)}</tr></thead>
              <tbody>
                {interps.map((it, i) => (
                  <tr key={i} className="border-t border-[#161D29]">
                    <td className="px-3 py-1.5 font-medium text-[#C3CAD7]">{it.indicator}</td>
                    <td className="px-3 py-1.5 font-semibold" style={{ color: TONE[it.tone] }}>{it.value}</td>
                    <td className="px-3 py-1.5 text-[#9CA7BB]">{TONE_DOT[it.tone]} {it.interp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="py-6 text-center text-sm text-[#7C879B]">Valuation indicators need daily history (loading / unavailable).</div>}
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
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs text-[#9CA7BB]">
        <input type="checkbox" checked={include2012} onChange={(e) => setInclude2012(e.target.checked)} className="accent-[#F7931A]" />
        Include 2012 cycle in averages
        <span className="text-[#5C6678]">(Cycle 1 peaked faster — 367d vs 526–547d later; adds a 3rd point but pulls averages earlier.)</span>
      </label>

      <div className="text-xs font-semibold uppercase text-[#7C879B]">Current Cycle (post-Apr 2024 halving)</div>
      <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Days since halving" value={cd.daysSinceHalving} />
        <Metric label="Days since peak" value={cd.daysSincePeak ?? "—"} hint="Peak: Oct 6, 2025" />
        <Metric label="Projected cycle bottom" value={cd.projBottom ? fmtMonthYear(cd.projBottom) : "—"} hint={cd.daysToBottom != null ? (cd.daysToBottom > 0 ? `~${cd.daysToBottom} days away` : "passed if pattern held") : undefined} />
      </div>

      <div className="mt-3 text-xs font-semibold uppercase text-[#7C879B]">Next Cycle (post-2028 halving)</div>
      <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Next halving (est.)" value={fmtMonthYear(nextHalvingDate)} hint={`~${cd.daysToNextHalving} days away`} />
        <Metric label="Estimated next takeoff" value={fmtMonthYear(cd.projNextTakeoff)} />
        <Metric label="Estimated next peak" value={fmtMonthYear(cd.projNextPeak)} />
      </div>

      <div className="mt-3 text-xs font-semibold uppercase text-[#7C879B]">Historical Cycle Timing</div>
      <div className="mt-1 overflow-auto rounded-lg border border-[#1E2632]">
        <table className="w-full text-sm">
          <thead><tr>{["Cycle", "Halving", "→ Takeoff", "→ Peak", "→ Bottom", "Takeoff→Peak", "Peak→Bottom"].map((h) => <th key={h} className="bg-[#0F1420] px-3 py-2 text-left text-xs uppercase text-[#7C879B]">{h}</th>)}</tr></thead>
          <tbody>
            {milestones.map((m, i) => (
              <tr key={i} className="border-t border-[#161D29]">
                <td className="px-3 py-1.5 font-medium" style={{ color: HISTORICAL_CYCLES[i].color }}>{m.label}</td>
                <td className="px-3 py-1.5 text-[#9CA7BB]">{fmtMonthYear(m.halving)}</td>
                <td className="px-3 py-1.5">{m.days_to_takeoff ?? "—"}d</td>
                <td className="px-3 py-1.5">{m.days_to_peak ?? "—"}d</td>
                <td className="px-3 py-1.5">{m.days_to_bottom != null ? `${m.days_to_bottom}d` : "TBD"}</td>
                <td className="px-3 py-1.5">{m.days_takeoff_to_peak ?? "—"}d</td>
                <td className="px-3 py-1.5">{m.days_peak_to_bottom != null ? `${m.days_peak_to_bottom}d` : "TBD"}</td>
              </tr>
            ))}
            <tr className="border-t border-[#2A3242] bg-[#0F1420]/40 font-semibold">
              <td className="px-3 py-1.5 text-[#E6E9EF]">Average (per setting)</td>
              <td className="px-3 py-1.5 text-[#7C879B]">—</td>
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
        <summary className="cursor-pointer text-[#7C879B]">⚠️ Why these projections may be wrong (especially this cycle)</summary>
        <div className="mt-2 space-y-1 text-[#9CA7BB]">
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
  const byType = (type: string, projected: boolean) => allMarkers.filter((m) => m.type === type && m.projected === projected).map((m) => ({ t: m.t, price: m.price }));

  // explicit domains covering markers, trendlines, projections, ETF lines, today
  const tVals = [...allMarkers.map((m) => m.t), ...bg.map((b) => b.t), tl.nextWindow.x1, tl.today, ...(showEtf ? ETF_EVENTS.map((e) => Date.parse(e.date)) : [])];
  const pVals = [...allMarkers.map((m) => m.price), ...bg.map((b) => b.price)];
  const tMin = Math.min(...tVals), tMax = Math.max(...tVals);
  const pMin = Math.max(1, Math.min(...pVals) * 0.6), pMax = Math.max(...pVals) * 1.4;

  return (
    <Card title="📊 Bitcoin Cycle Timeline" sub="Time on x-axis, BTC price (log) on y-axis. Each event marked at its actual price. Hollow markers are projections.">
      <details className="mb-2 text-xs">
        <summary className="cursor-pointer text-[#7C879B]">ℹ️ What is a Bitcoin halving?</summary>
        <div className="mt-2 space-y-1 text-[#9CA7BB]">
          <p>A halving is a protocol event (every ~210,000 blocks, ~4 years) that cuts new-BTC issuance to miners by 50%: 2012 (50→25), 2016 (25→12.5), 2020 (12.5→6.25), 2024 (6.25→3.125), 2028 est. (3.125→1.5625). This creates a programmed supply shock; historically BTC rallied 12–18 months after each.</p>
          <p>Halving markers (purple triangles) are plotted at the BTC price on the day each halving occurred — NOT at cycle lows. Halvings happen mid-recovery, so the 2020 marker at ~$8,800 sits ABOVE the 2018 bottom at $3,200.</p>
        </div>
      </details>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-[#9CA7BB]">
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={show2012} onChange={(e) => setShow2012(e.target.checked)} className="accent-[#F7931A]" />Show 2012 cycle</label>
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={showEtf} onChange={(e) => setShowEtf(e.target.checked)} className="accent-[#9B59B6]" />Show ETF events</label>
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={include2012} onChange={(e) => setInclude2012(e.target.checked)} className="accent-[#3498DB]" />Include 2012 in averages</label>
      </div>
      {bg.length > 0 ? (
        <ResponsiveContainer width="100%" height={460}>
          <ComposedChart margin={{ top: 16, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="#1A2130" vertical={false} />
            <XAxis dataKey="t" type="number" domain={[tMin, tMax]} scale="time" allowDataOverflow tick={{ fill: "#7C879B", fontSize: 11 }} minTickGap={50}
              tickFormatter={(t) => new Date(t).getFullYear().toString()} />
            <YAxis scale="log" domain={[pMin, pMax]} allowDataOverflow tick={{ fill: "#7C879B", fontSize: 11 }} width={56} tickFormatter={k} />
            <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }}
              labelFormatter={(t) => new Date(t).toLocaleDateString()} formatter={(v: number, n) => [`$${Math.round(v).toLocaleString()}`, n]} />
            {/* projected next-cycle window */}
            <ReferenceArea x1={tl.nextWindow.x0} x2={tl.nextWindow.x1} fill="#9B59B6" fillOpacity={0.08} ifOverflow="extendDomain" />
            {/* background BTC price */}
            <Line data={bg} dataKey="price" stroke="#F7931A" dot={false} strokeWidth={1.3} name="BTC price" isAnimationActive={false} />
            {/* trendlines */}
            <Line data={tl.peakTrend} dataKey="y" stroke="#27AE60" strokeOpacity={0.5} strokeDasharray="5 4" dot={false} strokeWidth={1.6} name="Peak trendline" isAnimationActive={false} />
            <Line data={tl.bottomTrend} dataKey="y" stroke="#E74C3C" strokeOpacity={0.5} strokeDasharray="5 4" dot={false} strokeWidth={1.6} name="Bottom trendline" isAnimationActive={false} />
            {/* event markers — actual (filled) + projected (hollow) per type */}
            {(["halving", "takeoff", "peak", "bottom"] as const).map((type) => (
              <Scatter key={type} data={byType(type, false)} dataKey="price" fill={MARKER_COLOR[type]} shape={MARKER_SHAPE[type]} name={type} isAnimationActive={false} />
            ))}
            {(["halving", "takeoff", "peak", "bottom"] as const).map((type) => (
              <Scatter key={`p-${type}`} data={byType(type, true)} dataKey="price" fill="#0F1420" stroke={MARKER_COLOR[type]} strokeWidth={1.5} shape={MARKER_SHAPE[type]} name={`${type} (proj.)`} isAnimationActive={false} />
            ))}
            {/* ETF event vlines */}
            {showEtf && ETF_EVENTS.map((e) => (
              <ReferenceLine key={e.date} x={Date.parse(e.date)} stroke={e.color} strokeDasharray="6 3" strokeOpacity={0.5}
                label={{ value: e.short_label, fill: e.color, fontSize: 9, position: "top" }} />
            ))}
            {/* today */}
            <ReferenceLine x={tl.today} stroke="#FF5252" strokeWidth={2} label={{ value: "TODAY", fill: "#FF5252", fontSize: 11, position: "top" }} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : <div className="py-8 text-center text-sm text-[#7C879B]">Price history loading / unavailable.</div>}
      <div className="mt-2 text-[10px] leading-relaxed text-[#5C6678]">
        Triangles = halvings · diamonds = takeoffs · stars = peaks · Y-marks = bottoms (all at actual prices) · hollow = projected · dashed green/red = peak/bottom trendlines (with projection) · purple band = projected next-cycle window · red line = today.
        {show2012 ? "" : " The pre-2016 background price line is unavailable from Yahoo, so the 2012 cycle shows as event markers only — enable “Show 2012 cycle.”"}
      </div>
      {showEtf && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-[#7C879B]">🏦 ETF Disruption Events</summary>
          <div className="mt-2 space-y-2 text-[#9CA7BB]">
            {ETF_EVENTS.map((e) => (
              <div key={e.date}><span className="font-semibold text-[#C3CAD7]">{fmtDayMonthYear(e.date)}</span> — {e.label}<div className="pl-3 text-[#7C879B]">{e.description}</div><div className="pl-3"><span className="text-[#C3CAD7]">Why it matters:</span> {e.impact}</div></div>
            ))}
          </div>
        </details>
      )}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-[#7C879B]">⚠️ How projected ranges are calculated</summary>
        <div className="mt-2 space-y-1 text-[#9CA7BB]">
          <p><span className="text-[#C3CAD7]">Current-cycle bottom</span> (−65% to −85% from the ${Math.round(tl.curPeakPrice).toLocaleString()} peak): low ${Math.round(tl.ranges.bottomLow).toLocaleString()} · mid ${Math.round(tl.ranges.bottomMid).toLocaleString()} · high ${Math.round(tl.ranges.bottomHigh).toLocaleString()}.</p>
          <p><span className="text-[#C3CAD7]">Next-cycle peak</span> (diminishing multiplier, 1.2×–1.6× prior peak): low ${Math.round(tl.ranges.peakLow).toLocaleString()} · mid ${Math.round(tl.ranges.peakMid).toLocaleString()} · high ${Math.round(tl.ranges.peakHigh).toLocaleString()}.</p>
          <p>Date projections use averages of {tl.avg.n} completed cycles ({tl.avg.cycles_used.join(", ")}). ±3 months error reasonable. This cycle's actual peak was ~0.60× a naive log-linear projection — diminishing returns are real; the conservative end may prove more accurate. Macro shocks can break any pattern.</p>
        </div>
      </details>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
function OverlayBand({ btcDaily, daysSinceHalving }: { btcDaily: Series; daysSinceHalving: number }) {
  const overlay = useMemo(() => buildCycleOverlay(btcDaily ?? null).filter((r) => r.day <= 1100), [btcDaily]);
  return (
    <Card title="Current Cycle vs Historical Projection" sub="Days since the 2024 halving. Band = the 2016 & 2020 cycles' paths scaled to the $64k current-cycle halving price. Solid orange = the actual current cycle; inside the band = tracking history, below = underperforming. Log scale.">
      {overlay.length > 0 ? (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={overlay} margin={{ top: 16, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="#1A2130" vertical={false} />
            <XAxis dataKey="day" type="number" domain={[0, 1100]} tick={{ fill: "#7C879B", fontSize: 11 }} minTickGap={40} tickFormatter={(d) => `${d}d`} />
            <YAxis scale="log" domain={["auto", "auto"]} allowDataOverflow tick={{ fill: "#7C879B", fontSize: 11 }} width={56} tickFormatter={k} />
            <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }}
              labelFormatter={(d) => `Day ${d} since halving`} formatter={(v: number, n: string) => [`$${Math.round(v).toLocaleString()}`, n]} />
            {/* day-0 halving marker + typical peak window highlight (source parity) */}
            <ReferenceLine x={0} stroke="#7C879B" strokeDasharray="3 3" label={{ value: "Halving", fill: "#7C879B", fontSize: 10, position: "insideTopLeft" }} />
            <ReferenceArea x1={520} x2={550} fill="#27AE60" fillOpacity={0.15} label={{ value: "Peak window", fill: "#27AE60", fontSize: 9, position: "insideTop" }} />
            <ReferenceLine x={daysSinceHalving} stroke="#fff" strokeDasharray="3 3" label={{ value: "TODAY", fill: "#fff", fontSize: 10, position: "top" }} />
            <Line type="monotone" dataKey="proj_high" stroke="#3A4254" dot={false} strokeWidth={1} name="2016-cycle scaled (high)" connectNulls />
            <Line type="monotone" dataKey="proj_median" stroke="#7C879B" dot={false} strokeWidth={1.2} strokeDasharray="3 3" name="median of cycles" connectNulls />
            <Line type="monotone" dataKey="proj_low" stroke="#3A4254" dot={false} strokeWidth={1} name="2020-cycle scaled (low)" connectNulls />
            <Line type="monotone" dataKey="current" stroke="#F7931A" dot={false} strokeWidth={2.4} name="current cycle" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      ) : <div className="py-8 text-center text-sm text-[#7C879B]">Projection unavailable.</div>}
      <div className="mt-1 text-[10px] text-[#5C6678]">Gray band = scaled 2016 & 2020 cycle range; green band = historical 520–550d peak window; orange = current cycle. Illustrative, not a prediction.</div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
function LongTermPrice({ btcDaily }: { btcDaily: Series }) {
  const longChart = useMemo(() => {
    if (!btcDaily?.dates?.length) return [];
    const ma = weekly200MA(btcDaily);
    const maByDate = new Map(ma.map((m) => [m.date, m.ma]));
    const byWeek = new Map<string, { date: string; close: number }>();
    for (let i = 0; i < btcDaily.dates.length; i++) {
      const d = new Date(btcDaily.dates[i]);
      const key = `${d.getUTCFullYear()}-${Math.floor(d.getTime() / (7 * 86400000))}`;
      byWeek.set(key, { date: btcDaily.dates[i], close: btcDaily.close[i] });
    }
    return [...byWeek.values()].map((w) => ({ t: Date.parse(w.date), close: w.close, ma: maByDate.get(w.date) ?? null }));
  }, [btcDaily]);

  return (
    <Card title="Long-term Price with Halvings" sub="Log scale · 200-week MA · halving markers">
      {longChart.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={longChart} margin={{ top: 5, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="#1A2130" vertical={false} />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => new Date(t).getFullYear().toString()} tick={{ fill: "#7C879B", fontSize: 11 }} minTickGap={50} />
            <YAxis scale="log" domain={["auto", "auto"]} allowDataOverflow tick={{ fill: "#7C879B", fontSize: 11 }} width={56} tickFormatter={k} />
            <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }}
              labelFormatter={(t) => new Date(t).toLocaleDateString()} formatter={(v: number, n) => [`$${Math.round(v).toLocaleString()}`, n === "ma" ? "200w MA" : "BTC"]} />
            {HALVINGS.filter((h) => Date.parse(h.date) <= Date.now()).map((h) => (
              <ReferenceLine key={h.date} x={Date.parse(h.date)} stroke="#F7931A" strokeDasharray="3 3" opacity={0.6} label={{ value: `⌗ ${new Date(h.date).getFullYear()}`, fill: "#F7931A", fontSize: 10, position: "top" }} />
            ))}
            <Line type="monotone" dataKey="close" stroke="#F7931A" dot={false} strokeWidth={1.4} name="BTC" />
            <Line type="monotone" dataKey="ma" stroke="#5DADE2" dot={false} strokeWidth={1.6} strokeDasharray="4 2" name="ma" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      ) : <div className="py-8 text-center text-sm text-[#7C879B]">Price history loading / unavailable.</div>}
    </Card>
  );
}
