// PPI daily history chart (P2.1, 2026-07-21): score line over threshold zones with
// the historical band reference overlaid as a step line. DEMOTED 2026-07-24 — the
// band is the study's exposure mapping, never a recommendation (PPI_VERDICT). Series provenance is part
// of the render (S5): rows are RECONSTRUCTED (current formula applied to historical
// inputs — valid for testing, not as-lived readings) until the nightly as-lived
// append takes over; the tooltip carries per-row source and the caption says so.
import { useEffect, useMemo, useState } from "react";
import { PPI_VERDICT } from "../lib/ppiIndex";
import { Card } from "./ui";
import { loadDataJSON } from "../lib/data";
import { INK, SEM, SURFACE, alpha } from "../theme";
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceArea,
} from "recharts";

interface PpiRow {
  date: string; score: number; level: string; band_deploy_pct: number;
  source: "reconstructed" | "as_lived";
  components?: Record<string, number>;
}
interface PpiHistoryFile { generated_at: string; note: string; n_reconstructed: number; n_as_lived: number; series: PpiRow[] }

const RANGES: { key: string; days: number | null }[] = [
  { key: "3M", days: 63 }, { key: "6M", days: 126 }, { key: "YTD", days: null }, { key: "1Y", days: 252 },
];

// zone shading matches the PPI level bands
const ZONES = [
  { y1: 0, y2: 20, color: alpha(SEM.pos, 0.05) },
  { y1: 20, y2: 40, color: alpha(SEM.pos, 0.02) },
  { y1: 40, y2: 60, color: alpha(SEM.warn, 0.06) },
  { y1: 60, y2: 80, color: alpha(SEM.warnHot ?? SEM.warn, 0.09) },
  { y1: 80, y2: 100, color: alpha(SEM.neg, 0.10) },
];

export default function PpiHistory() {
  const [data, setData] = useState<PpiHistoryFile | null>(null);
  const [range, setRange] = useState("YTD");

  useEffect(() => { loadDataJSON<PpiHistoryFile>("ppi_history.json").then(setData); }, []);

  const rows = useMemo(() => {
    if (!data?.series) return [];
    const r = RANGES.find((x) => x.key === range);
    let s = data.series;
    if (r?.days != null) s = s.slice(-r.days);
    else s = s.filter((x) => x.date >= `${new Date().getFullYear()}-01-01`); // YTD
    return s;
  }, [data, range]);

  if (!data?.series?.length) return null; // ships with the next publish — hidden until then

  return (
    <Card title="PPI History" sub={`Daily Pullback Pressure Index (stress readout) with its historical band reference. ${PPI_VERDICT} ${data.n_reconstructed} rows are RECONSTRUCTED (current formula applied to historical inputs — for testing, not as-lived readings); ${data.n_as_lived} as-lived nightly prints accumulate from 2026-07-21. Zones: <20 LOW · <40 MODERATE · <60 ELEVATED (band 50%) · <80 HIGH (25%) · 80+ EXTREME (0%) — bands are the study’s historical exposure mapping, not advice.`}>
      <div className="mb-1 flex gap-1">
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`rounded border px-2 py-0.5 text-[11px] ${range === r.key ? "border-link text-link" : "border-line text-ink-3 hover:bg-hover"}`}>
            {r.key}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={rows} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
          {ZONES.map((z, i) => <ReferenceArea key={i} y1={z.y1} y2={z.y2} fill={z.color} stroke="none" />)}
          <CartesianGrid stroke={SURFACE.raised} vertical={false} />
          <XAxis dataKey="date" tick={{ fill: INK.mute, fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={40} />
          <YAxis domain={[0, 100]} tick={{ fill: INK.mute, fontSize: 11 }} width={30} />
          <YAxis yAxisId="dep" orientation="right" domain={[0, 100]} tick={{ fill: INK.mute, fontSize: 10 }} width={38} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={{ background: SURFACE.raised, border: `1px solid ${SURFACE.active}`, fontSize: 12 }}
            formatter={(v: number, n: string, item: any) => {
              if (n === "score") return [`${v} (${item?.payload?.level}${item?.payload?.source === "reconstructed" ? " · reconstructed" : ""})`, "PPI"];
              return [`${v}%`, "band reference (historical, not advice)"];
            }}
          />
          <Line type="monotone" dataKey="score" stroke={SEM.warn} dot={false} strokeWidth={1.8} />
          <Line yAxisId="dep" type="stepAfter" dataKey="band_deploy_pct" stroke={alpha(SEM.link, 0.7)} dot={false} strokeWidth={1.3} strokeDasharray="4 3" />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
