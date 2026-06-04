import { useMemo } from "react";
import { Card, Metric } from "../components/ui";
import { fmtPct } from "../lib/format";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { ethBtcRatio } from "../lib/cycle";

type Series = { dates: string[]; close: number[] } | null | undefined;

export default function CryptoEthBtc({ ethDaily, btcDaily }: { ethDaily: Series; btcDaily: Series }) {
  const r = useMemo(() => ethBtcRatio(ethDaily, btcDaily), [ethDaily, btcDaily]);
  const chart = useMemo(() => r?.series.map((p) => ({ t: p.t, ratio: p.ratio })) ?? [], [r]);

  const interp = r?.change_1y_pct == null ? null
    : r.change_1y_pct > 20 ? { tone: "#00C805", txt: "🟢 ETH is meaningfully outperforming BTC over the past year." }
      : r.change_1y_pct > 0 ? { tone: "#7FB8E0", txt: "🟡 ETH is modestly outperforming BTC over the past year." }
        : r.change_1y_pct > -20 ? { tone: "#FF9800", txt: "🟠 ETH is underperforming BTC over the past year." }
          : { tone: "#FF5722", txt: "🔴 ETH is significantly underperforming BTC over the past year." };

  return (
    <div className="space-y-4">
      <Card title="ETH/BTC Ratio" sub="Whether ETH is gaining or losing strength vs Bitcoin. Rises when ETH outperforms, falls when BTC outperforms — one of the cleanest reads on relative crypto performance.">
        {r ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Current ratio" value={r.current.toFixed(5)} />
              <Metric label="30-day change" value={r.change_30d_pct != null ? fmtPct(r.change_30d_pct, 2, true) : "—"} />
              <Metric label="1-year change" value={r.change_1y_pct != null ? fmtPct(r.change_1y_pct, 2, true) : "—"} />
              <Metric label="From ATH" value={fmtPct(r.from_ath_pct, 1, true)} hint={`ATH: ${r.ath.toFixed(5)}`} />
            </div>
            {interp && <div className="mt-3 rounded-lg border border-[#1E2632] px-3 py-2 text-xs" style={{ color: interp.tone }}>{interp.txt}</div>}
          </>
        ) : <div className="py-4 text-center text-sm text-[#7C879B]">Ratio data unavailable.</div>}
      </Card>

      <Card title="ETH/BTC Ratio History" sub="Resistance ~0.08 · Historical floor ~0.05">
        {chart.length > 0 ? (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid stroke="#1A2130" vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => new Date(t).getFullYear().toString()} tick={{ fill: "#7C879B", fontSize: 11 }} minTickGap={50} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "#7C879B", fontSize: 11 }} width={56} tickFormatter={(v) => v.toFixed(3)} />
              <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }}
                labelFormatter={(t) => new Date(t).toLocaleDateString()} formatter={(v: number) => [v.toFixed(5), "ETH/BTC"]} />
              <ReferenceLine y={0.08} stroke="#FF9800" strokeDasharray="4 3" opacity={0.6} label={{ value: "Resistance ~0.08", fill: "#FF9800", fontSize: 9, position: "insideTopRight" }} />
              <ReferenceLine y={0.05} stroke="#27AE60" strokeDasharray="4 3" opacity={0.6} label={{ value: "Floor ~0.05", fill: "#27AE60", fontSize: 9, position: "insideBottomRight" }} />
              <Line type="monotone" dataKey="ratio" stroke="#9B59B6" dot={false} strokeWidth={1.6} />
            </LineChart>
          </ResponsiveContainer>
        ) : <div className="py-8 text-center text-sm text-[#7C879B]">Ratio history loading / unavailable.</div>}
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-[#7C879B]">📐 How to interpret this chart</summary>
          <div className="mt-2 space-y-1 text-[#9CA7BB]">
            <p>The ETH/BTC ratio has historically traded in a wide range: 2017 peak ~0.15 (ICO mania), 2018–2019 lows ~0.025, 2021 cycle peak ~0.085, 2022–2024 range 0.04–0.08.</p>
            <p>ETH has NOT made a higher high vs BTC since 2017; the post-2017 trend has been downward, not upward — BTC's "store of value" narrative has dominated institutional flows, contradicting the 2017–2021 "flippening" thesis.</p>
            <p>What would change the trend: sustained ETH staking yield &gt; BTC perceived returns; L2 activity translating to ETH burn; DeFi-friendly regulatory clarity; ETH ETF flows scaling.</p>
          </div>
        </details>
      </Card>
    </div>
  );
}
