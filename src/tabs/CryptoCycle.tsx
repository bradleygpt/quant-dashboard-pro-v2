import { useMemo } from "react";
import { Card, Metric } from "../components/ui";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { HALVINGS, HISTORICAL_CYCLES, cycleMilestones, cycleCountdown, weekly200MA, buildCycleOverlay } from "../lib/cycle";

type Series = { dates: string[]; close: number[] } | null | undefined;

export default function CryptoCycle({ btcDaily }: { btcDaily: Series }) {
  // weekly close + 200-week MA (numeric timestamp x for halving reference lines)
  const longChart = useMemo(() => {
    if (!btcDaily?.dates?.length) return [];
    const ma = weekly200MA(btcDaily);
    const maByDate = new Map(ma.map((m) => [m.date, m.ma]));
    // weekly resample (last per ISO week)
    const byWeek = new Map<string, { date: string; close: number }>();
    for (let i = 0; i < btcDaily.dates.length; i++) {
      const d = new Date(btcDaily.dates[i]);
      const key = `${d.getUTCFullYear()}-${Math.floor((d.getTime()) / (7 * 86400000))}`;
      byWeek.set(key, { date: btcDaily.dates[i], close: btcDaily.close[i] });
    }
    return [...byWeek.values()].map((w) => ({ t: Date.parse(w.date), close: w.close, ma: maByDate.get(w.date) ?? null }));
  }, [btcDaily]);

  const overlay = useMemo(() => buildCycleOverlay(btcDaily ?? null).filter((r) => r.day <= 1100), [btcDaily]);
  const today = new Date().toISOString().slice(0, 10);
  const cd = cycleCountdown(today);
  const milestones = cycleMilestones();
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short" });

  return (
    <div className="space-y-4">
      {/* VIEW 1: Long-term price + halvings + 200w MA */}
      <Card title="Long-term Price with Halvings" sub="Log scale · 200-week MA · halving markers">
        {longChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={longChart} margin={{ top: 5, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid stroke="#1A2130" vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time"
                tickFormatter={(t) => new Date(t).getFullYear().toString()} tick={{ fill: "#7C879B", fontSize: 11 }} minTickGap={50} />
              <YAxis scale="log" domain={["auto", "auto"]} allowDataOverflow tick={{ fill: "#7C879B", fontSize: 11 }} width={56}
                tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
              <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }}
                labelFormatter={(t) => new Date(t).toLocaleDateString()} formatter={(v: number, n) => [`$${Math.round(v).toLocaleString()}`, n === "ma" ? "200w MA" : "BTC"]} />
              {HALVINGS.filter((h) => Date.parse(h.date) <= Date.now()).map((h) => (
                <ReferenceLine key={h.date} x={Date.parse(h.date)} stroke="#F7931A" strokeDasharray="3 3" opacity={0.6}
                  label={{ value: `⌗ ${new Date(h.date).getFullYear()}`, fill: "#F7931A", fontSize: 10, position: "top" }} />
              ))}
              <Line type="monotone" dataKey="close" stroke="#F7931A" dot={false} strokeWidth={1.4} name="BTC" />
              <Line type="monotone" dataKey="ma" stroke="#5DADE2" dot={false} strokeWidth={1.6} strokeDasharray="4 2" name="ma" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : <div className="py-8 text-center text-sm text-[#7C879B]">Price history loading / unavailable.</div>}
      </Card>

      {/* VIEW 2: Current cycle vs historical projection */}
      <Card title="Current Cycle vs Historical Projection" sub="Days since the 2024 halving · 2016 & 2020 cycles scaled to current halving price">
        {overlay.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={overlay} margin={{ top: 5, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid stroke="#1A2130" vertical={false} />
              <XAxis dataKey="day" type="number" domain={[0, 1100]} tick={{ fill: "#7C879B", fontSize: 11 }} minTickGap={40}
                tickFormatter={(d) => `${d}d`} />
              <YAxis scale="log" domain={["auto", "auto"]} allowDataOverflow tick={{ fill: "#7C879B", fontSize: 11 }} width={56}
                tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
              <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }}
                labelFormatter={(d) => `Day ${d} since halving`} formatter={(v: number, n: string) => [`$${Math.round(v).toLocaleString()}`, n]} />
              <ReferenceLine x={cd.daysSinceHalving} stroke="#fff" strokeDasharray="3 3" label={{ value: "TODAY", fill: "#fff", fontSize: 10, position: "top" }} />
              <Line type="monotone" dataKey="proj_high" stroke="#3A4254" dot={false} strokeWidth={1} name="hist high" connectNulls />
              <Line type="monotone" dataKey="proj_median" stroke="#7C879B" dot={false} strokeWidth={1.2} strokeDasharray="3 3" name="hist median" connectNulls />
              <Line type="monotone" dataKey="proj_low" stroke="#3A4254" dot={false} strokeWidth={1} name="hist low" connectNulls />
              <Line type="monotone" dataKey="current" stroke="#F7931A" dot={false} strokeWidth={2.4} name="current cycle" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : <div className="py-8 text-center text-sm text-[#7C879B]">Projection unavailable.</div>}
        <div className="mt-1 text-[10px] text-[#5C6678]">Gray band = scaled 2016 & 2020 cycle range; orange = current cycle. Illustrative, not a prediction.</div>
      </Card>

      {/* VIEW 3: Cycle countdown */}
      <Card title="Cycle Countdown" sub={`Phase: ${cd.phase ? cd.phase[2] : "—"}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Days since halving" value={cd.daysSinceHalving} hint="Apr 2024" />
          <Metric label="Days since peak" value={cd.daysSincePeak ?? "—"} hint="Oct 2025" />
          <Metric label="Projected bottom" value={cd.projBottom ? fmtDate(cd.projBottom) : "—"} hint={cd.daysToBottom != null ? `~${cd.daysToBottom}d` : undefined} />
          <Metric label="Next halving" value={fmtDate(cd.nextHalving)} hint={`~${cd.daysToNextHalving}d`} />
          <Metric label="Est. next takeoff" value={fmtDate(cd.projNextTakeoff)} />
          <Metric label="Est. next peak" value={fmtDate(cd.projNextPeak)} />
        </div>
        {cd.phase && <p className="mt-2 text-xs text-[#9CA7BB]">{cd.phase[3]}</p>}
        <div className="mt-3 overflow-auto rounded-lg border border-[#1E2632]">
          <table className="w-full text-sm">
            <thead><tr>{["Cycle", "Halving", "→ Takeoff", "→ Peak", "→ Bottom", "Takeoff→Peak", "Peak→Bottom"].map((h) => <th key={h} className="bg-[#0F1420] px-3 py-2 text-left text-xs uppercase text-[#7C879B]">{h}</th>)}</tr></thead>
            <tbody>
              {milestones.map((m, i) => (
                <tr key={i} className="border-t border-[#161D29]">
                  <td className="px-3 py-1.5 font-medium text-[#C3CAD7]" style={{ color: HISTORICAL_CYCLES[i].color }}>{m.label}</td>
                  <td className="px-3 py-1.5 text-[#9CA7BB]">{fmtDate(m.halving)}</td>
                  <td className="px-3 py-1.5">{m.days_to_takeoff ?? "—"}d</td>
                  <td className="px-3 py-1.5">{m.days_to_peak ?? "—"}d</td>
                  <td className="px-3 py-1.5">{m.days_to_bottom != null ? `${m.days_to_bottom}d` : "TBD"}</td>
                  <td className="px-3 py-1.5">{m.days_takeoff_to_peak ?? "—"}d</td>
                  <td className="px-3 py-1.5">{m.days_peak_to_bottom != null ? `${m.days_peak_to_bottom}d` : "TBD"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-1 text-[10px] text-[#5C6678]">Averages from completed cycles ({cd.avg.n}); ETF era may alter dynamics. Not financial advice.</div>
      </Card>
    </div>
  );
}
