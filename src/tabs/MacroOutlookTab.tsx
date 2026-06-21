import { useMemo, useState } from "react";
import { Card, Pill, Spinner, Unavailable, TH, TD } from "../components/ui";
import { useLiveData } from "../lib/live";
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from "recharts";

const BASE = `${import.meta.env.BASE_URL}data`;

// ── shapes of macro_forecasts.json (built by macro_forecasts.build_macro_forecasts) ──
type Cells = Record<string, number>; // {"2026": 2.2, "LR": 2.0}
interface Forecaster {
  id: string; name: string; kind?: string; live?: boolean;
  as_of?: string | null; source?: string; url?: string; notes?: string;
  values: Record<string, Cells>; // metric -> {year: value}
}
interface DotPlot {
  live?: boolean; as_of?: string | null; source?: string; url?: string;
  years: string[]; median: (number | null)[];
  central_tendency: { high: (number | null)[]; low: (number | null)[] };
  range: { high: (number | null)[]; low: (number | null)[] };
  current_target_range?: string | null; current_target_mid?: number | null;
}
// ── shapes of risk_radar.json (built by build_risk_radar_cache.py) ──
interface Risk {
  title: string; category: string; severity: "High" | "Medium" | "Low";
  direction?: "downside" | "upside" | "two-sided"; horizon?: string;
  summary?: string; watch_for?: string; sources: string[];
}
interface RiskRadar {
  ok?: boolean; status?: "fresh" | "stale" | "failed";
  last_updated_human?: string; as_of_window?: string | null;
  risks?: Risk[]; consensus_note?: string; themes?: string[];
}

interface MacroForecasts {
  ok?: boolean;
  generated_at?: string;
  consensus: {
    metrics: string[];
    metric_labels: Record<string, string>;
    metric_units: Record<string, string>;
    years: string[];
    forecasters: Forecaster[];
  };
  dot_plot: DotPlot | null;
  sources?: { name: string; as_of?: string | null; live?: boolean; source?: string; url?: string }[];
}

const fmt = (v: number | null | undefined, unit?: string) =>
  v == null ? "—" : unit === "level" ? Math.round(v).toLocaleString() : `${v.toFixed(1)}${unit === "%" || unit === "% y/y" ? "%" : ""}`;

// A small green/amber dot marking live-fetched vs curated-snapshot provenance.
function LiveDot({ live }: { live?: boolean }) {
  return (
    <span
      title={live ? "Fetched live at bake time" : "Curated dated snapshot"}
      className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
      style={{ background: live ? "#00C805" : "#FFB454" }}
    />
  );
}

const SEVERITY = {
  High: { color: "#FF5722", bg: "#1F0E0E", border: "#5A2A20" },
  Medium: { color: "#FFB454", bg: "#1C1407", border: "#3A2A12" },
  Low: { color: "#5BA8FF", bg: "#0E1622", border: "#1E2E45" },
} as const;
const DIRECTION_ICON: Record<string, string> = { downside: "▼", upside: "▲", "two-sided": "◆" };

export default function MacroOutlookTab() {
  const fc = useLiveData<MacroForecasts>(`${BASE}/macro_forecasts.json`);
  const radar = useLiveData<RiskRadar>(`${BASE}/risk_radar.json`);
  const [metric, setMetric] = useState("gdp");

  const c = fc.data?.consensus;
  const dp = fc.data?.dot_plot ?? null;

  // Per-metric spread across forecasters (the divergence the product surfaces).
  const spread = useMemo(() => {
    if (!c) return {} as Record<string, { lo: number; hi: number; med: number; n: number }>;
    const out: Record<string, { lo: number; hi: number; med: number; n: number }> = {};
    for (const yr of c.years) {
      const vals = c.forecasters
        .map((f) => f.values?.[metric]?.[yr])
        .filter((v): v is number => typeof v === "number");
      if (!vals.length) continue;
      const sorted = [...vals].sort((a, b) => a - b);
      const med = sorted[Math.floor((sorted.length - 1) / 2)];
      out[yr] = { lo: sorted[0], hi: sorted[sorted.length - 1], med, n: vals.length };
    }
    return out;
  }, [c, metric]);

  // Dot-plot chart series: range band (stacked transparent base + span) + median line
  // + central-tendency envelope as thin dashed lines. Longer-run has only a median.
  const dotData = useMemo(() => {
    if (!dp) return [];
    return dp.years.map((yr, i) => {
      const rLo = dp.range.low[i], rHi = dp.range.high[i];
      return {
        year: yr,
        median: dp.median[i],
        rangeLow: rLo,
        rangeSpan: rLo != null && rHi != null ? +(rHi - rLo).toFixed(2) : null,
        ctHigh: dp.central_tendency.high[i],
        ctLow: dp.central_tendency.low[i],
      };
    });
  }, [dp]);

  if (fc.status === "loading") return <Spinner label="Loading macro outlook…" />;
  if (fc.status === "unavailable" || !c)
    return <Unavailable what="Macro outlook data" detail="macro_forecasts.json hasn’t been baked yet. Run the bake (it fetches the Fed SEP, World Bank GEP and IMF WEO live)." />;

  const unit = c.metric_units[metric];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Macro Outlook</h2>
        <p className="text-xs text-[#7C879B]">
          Cross-institution forecast consensus + the FOMC dot plot. The value is the <em>spread</em> between
          forecasters — nobody publishes this comparison on their own. <LiveDot live /> live-fetched at bake time ·
          <LiveDot /> curated dated snapshot. Missing cells are null, never invented.
        </p>
      </div>

      {/* ── Forecast Consensus ─────────────────────────────────────────── */}
      <Card title="Forecast Consensus" sub="Pick a metric to compare every forecaster side by side.">
        <div className="mb-3 flex flex-wrap gap-2">
          {c.metrics.map((m) => (
            <Pill key={m} active={m === metric} onClick={() => setMetric(m)}>
              {c.metric_labels[m]}
            </Pill>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <TH>Forecaster</TH>
                {c.years.map((y) => <TH key={y} className="text-right">{y}</TH>)}
                <TH className="text-right">Longer&nbsp;Run</TH>
                <TH className="text-right">As of</TH>
              </tr>
            </thead>
            <tbody>
              {c.forecasters.map((f) => {
                const cells = f.values?.[metric] ?? {};
                const hasAny = c.years.some((y) => cells[y] != null) || cells.LR != null;
                return (
                  <tr key={f.id} className="border-t border-[#161D29]">
                    <TD className="text-[#C3CAD7]">
                      <LiveDot live={f.live} />
                      {f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="hover:text-[#5BA8FF]">{f.name}</a> : f.name}
                    </TD>
                    {c.years.map((y) => (
                      <TD key={y} className="text-right tabular-nums text-[#E6E9EF]">{hasAny ? fmt(cells[y], unit) : "—"}</TD>
                    ))}
                    <TD className="text-right tabular-nums text-[#9CA7BB]">{fmt(cells.LR, unit)}</TD>
                    <TD className="text-right text-xs text-[#7C879B]">{f.as_of ?? "—"}</TD>
                  </tr>
                );
              })}
              {/* spread row — the headline divergence */}
              <tr className="border-t-2 border-[#2A3242] bg-[#0F1420]">
                <TD className="font-semibold text-[#9CA7BB]">Spread (lo–hi)</TD>
                {c.years.map((y) => {
                  const s = spread[y];
                  return (
                    <TD key={y} className="text-right text-xs tabular-nums text-[#7C879B]">
                      {s ? `${fmt(s.lo, unit)}–${fmt(s.hi, unit)}` : "—"}
                    </TD>
                  );
                })}
                <TD /><TD />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] leading-relaxed text-[#5C6678]">
          Note: the Fed projects PCE inflation; the IMF/banks project CPI — both shown under “Inflation,” see each row’s source.
          GDP/inflation in % y/y, unemployment & Fed funds in %, S&P 500 target as an index level.
        </div>
      </Card>

      {/* ── FOMC Dot Plot ──────────────────────────────────────────────── */}
      {dp && dotData.length > 0 && (
        <Card
          title="FOMC Dot Plot — median rate path"
          sub={`Summary of Economic Projections · ${dp.source ?? "FRED"} · as-of ${dp.as_of ?? "?"}${dp.current_target_range ? ` · current target ${dp.current_target_range}` : ""}`}
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={dotData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#161D29" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: "#9CA7BB", fontSize: 12 }} />
              <YAxis tick={{ fill: "#7C879B", fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={["auto", "auto"]} width={42} />
              <Tooltip
                contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }}
                labelStyle={{ color: "#E6E9EF" }}
                formatter={(val: number, name: string) => {
                  if (name === "rangeLow" || name === "rangeSpan") return [null, null] as any;
                  const label = name === "median" ? "Median" : name === "ctHigh" ? "Central tendency (high)" : name === "ctLow" ? "Central tendency (low)" : name;
                  return [`${val?.toFixed?.(2)}%`, label];
                }}
              />
              {/* full range band: transparent base + light span stacked on top */}
              <Area dataKey="rangeLow" stackId="range" stroke="none" fill="transparent" isAnimationActive={false} />
              <Area dataKey="rangeSpan" stackId="range" stroke="none" fill="#1E3A5F" fillOpacity={0.5} isAnimationActive={false} name="Range" />
              {/* central tendency envelope */}
              <Line dataKey="ctHigh" stroke="#5BA8FF" strokeDasharray="4 3" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
              <Line dataKey="ctLow" stroke="#5BA8FF" strokeDasharray="4 3" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
              {/* median dots */}
              <Line dataKey="median" stroke="#FFB454" strokeWidth={2.5} dot={{ r: 4, fill: "#FFB454" }} connectNulls isAnimationActive={false} />
              {dp.current_target_mid != null && (
                <ReferenceLine y={dp.current_target_mid} stroke="#7C879B" strokeDasharray="2 4"
                  label={{ value: "current", fill: "#7C879B", fontSize: 10, position: "insideTopRight" }} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-[#7C879B]">
            <span><span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ background: "#FFB454" }} />Median dot</span>
            <span><span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ background: "#5BA8FF" }} />Central tendency</span>
            <span><span className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ background: "#1E3A5F" }} />Full range of participants</span>
          </div>
          <div className="mt-1 text-[11px] text-[#5C6678]">
            Median / central-tendency / range come straight from FRED Release 326 (the structured SEP). The raw per-participant scatter lives only in the FOMC PDF.
          </div>
        </Card>
      )}

      {/* ── Risk Radar — "What to Watch" (LLM-summarized from the narrative outlooks) ── */}
      <Card
        title="Risk Radar — What to Watch"
        sub={`The risks the major outlooks (Fed · IMF · World Bank · CBO · JPMorgan · Guggenheim · Wells Fargo · SIEPR) are collectively flagging${radar.data?.as_of_window ? ` · ${radar.data.as_of_window}` : ""}${radar.data?.last_updated_human ? ` · refreshed ${radar.data.last_updated_human}` : ""}`}
      >
        {radar.status === "loading" ? (
          <Spinner label="Loading risk radar…" />
        ) : !radar.data?.risks?.length ? (
          <div className="rounded-md border border-[#2A3242] bg-[#0F1420] p-4 text-xs leading-relaxed text-[#9CA7BB]">
            The Risk Radar refreshes daily via the grounded-LLM pipeline (<code className="text-[#7C879B]">build_risk_radar_cache.py</code>), the same way Pundit Views is generated.
            {radar.data?.status === "failed" ? " The latest run hasn’t produced data yet — it will populate on the next scheduled build." : " No risks are available yet."}
          </div>
        ) : (
          <>
            {radar.data.consensus_note && (
              <p className="mb-3 text-xs leading-relaxed text-[#C3CAD7]">{radar.data.consensus_note}</p>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {radar.data.risks.map((r, i) => {
                const sev = SEVERITY[r.severity] ?? SEVERITY.Medium;
                return (
                  <div key={i} className="rounded-lg border p-3" style={{ borderColor: sev.border, background: sev.bg }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-[#E6E9EF]">
                        {r.direction && <span className="mr-1" style={{ color: sev.color }}>{DIRECTION_ICON[r.direction] ?? ""}</span>}
                        {r.title}
                      </div>
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ color: sev.color, background: `${sev.color}22`, border: `1px solid ${sev.color}55` }}>
                        {r.severity}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-[#7C879B]">
                      <span className="rounded bg-[#1A2130] px-1.5 py-0.5">{r.category}</span>
                      {r.horizon && <span className="rounded bg-[#1A2130] px-1.5 py-0.5">{r.horizon}</span>}
                    </div>
                    {r.summary && <p className="mt-2 text-xs leading-relaxed text-[#9CA7BB]">{r.summary}</p>}
                    {r.watch_for && <p className="mt-1 text-[11px] text-[#7C879B]"><span className="text-[#5C6678]">Watch:</span> {r.watch_for}</p>}
                    <div className="mt-2 text-[10px] text-[#5C6678]">Source: {r.sources.join(" · ")}</div>
                  </div>
                );
              })}
            </div>
            {radar.data.themes?.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#7C879B]">
                <span className="uppercase tracking-wide text-[#5C6678]">Themes:</span>
                {radar.data.themes.map((t, i) => <span key={i} className="rounded-full bg-[#1A2130] px-2 py-0.5">{t}</span>)}
              </div>
            ) : null}
            {radar.data.status === "stale" && (
              <div className="mt-2 text-[10px] text-[#D8B878]">⚠ Showing the last good radar — the most recent refresh failed.</div>
            )}
          </>
        )}
        <div className="mt-2 text-[10px] leading-relaxed text-[#5C6678]">
          Each risk is attributed to the named source(s) that raised it; unsourced items are dropped, never invented. Narrative summary, not a data feed.
        </div>
      </Card>

      {fc.data?.generated_at && (
        <p className="text-[10px] text-[#5C6678]">Baked {fc.data.generated_at.slice(0, 16).replace("T", " ")} · {fc.data?.sources?.filter((s) => s.live).length ?? 0} live sources. {(fc.data as any)?.integrity_note}</p>
      )}
    </div>
  );
}
