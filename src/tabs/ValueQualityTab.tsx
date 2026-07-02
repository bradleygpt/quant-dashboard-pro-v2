import { useEffect, useMemo, useState } from "react";
import { Card, Metric, Pill, Spinner, Unavailable } from "../components/ui";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const BASE = `${import.meta.env.BASE_URL}data`;

interface YearHoldRow { label: string; [hold: string]: number | string | null }
interface Holding { date: string; tickers: string[] }
interface VQData {
  generated_at: string;
  engine?: string;
  character?: string;
  config: { weights: Record<string, number>; top_n: number; hold_days: number };
  metrics: {
    cagr: number; sharpe: number; max_dd: number;
    half_sharpe_1: number; half_sharpe_2: number;
    spy_cagr: number; n_rebalances: number;
    conservative_cagr_low: number; conservative_cagr_high: number; conservative_sharpe: number;
  };
  equity_curve: { date: string; equity: number }[];
  year_hold: { holds: string[]; rows: YearHoldRow[] };
  holdings: Holding[];
  caveats: string[];
}

// green→red heat for the year×hold cells (annualised % return). Bounded ±40%.
function heat(v: number | null): string {
  if (v == null) return "transparent";
  const t = Math.max(-1, Math.min(1, v / 40));
  return t >= 0
    ? `rgba(0,200,5,${0.10 + 0.45 * t})`
    : `rgba(255,87,34,${0.10 + 0.45 * -t})`;
}

export default function ValueQualityTab() {
  const [d, setD] = useState<VQData | null>(null);
  const [err, setErr] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/value_quality_strategy.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErr(true));
  }, []);

  const holdings = useMemo(() => {
    if (!d) return [];
    // newest first; collapse to the last 12 rebalances unless expanded
    const sorted = [...d.holdings].sort((a, b) => b.date.localeCompare(a.date));
    return showAll ? sorted : sorted.slice(0, 12);
  }, [d, showAll]);

  if (err) return <Unavailable what="Project Axia (Quality + Momentum) research" detail="value_quality_strategy.json failed to load." />;
  if (!d) return <Spinner label="Loading Project Axia (Quality + Momentum)…" />;

  const w = d.config.weights;
  const yh = d.year_hold;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Project Axia — Quality + Momentum</h2>
        <p className="text-xs text-[#7C879B]">
          A standalone presentation of the validated Axia research. After the contamination audit the Valuation pillar
          was found to be a split-adjustment lookahead artifact and pinned to zero — so this is a <span className="text-[#C7CEDA]">quality + momentum</span>{" "}
          composite (Profitability-led, with Momentum and light Growth), holding the top {d.config.top_n} names for
          ~{d.config.hold_days} trading days on the split-corrected EDGAR-era panel (2011–2026). The config was selected on
          worst-half Sharpe (stability across both sub-periods), not in-sample max.{" "}
          <span className="text-[#7C879B]">Research record, not a live recommendation — read the caveats first.</span>
        </p>
      </div>

      {/* CAVEATS — deliberately first and loud */}
      <div className="rounded-lg border border-[#5A4A1E] bg-[#1E1A0E] p-4">
        <div className="text-sm font-semibold text-[#FFC107]">⚠ Read this before the numbers</div>
        <ul className="mt-2 space-y-1.5 text-xs text-[#D7C9A0]">
          {d.caveats.map((c, i) => (
            <li key={i} className="flex gap-2"><span className="text-[#FFC107]">•</span><span>{c}</span></li>
          ))}
        </ul>
      </div>

      {/* headline metrics — fixed both-halves-stable config; survivor-only upper bound */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="CAGR" value={`${d.metrics.cagr.toFixed(1)}%`} hint={`fixed config · vs SPY ${d.metrics.spy_cagr.toFixed(1)}%`} />
        <Metric label="Sharpe" value={d.metrics.sharpe.toFixed(2)} hint={`halves ${d.metrics.half_sharpe_1.toFixed(2)} / ${d.metrics.half_sharpe_2.toFixed(2)}`} />
        <Metric label="Max Drawdown" value={`${d.metrics.max_dd.toFixed(1)}%`} hint="fixed-config path" />
        <Metric label="Rebalances" value={d.metrics.n_rebalances} hint={`${d.config.hold_days}d hold · survivor-only`} />
      </div>

      {/* config */}
      <Card title="Configuration" sub="Frozen research config — the same weights/hold used across every panel below.">
        <div className="flex flex-wrap gap-2">
          {Object.entries(w).map(([k, v]) => (
            <span key={k} className="rounded-md border border-[#1E2632] bg-[#0C0F16] px-2.5 py-1 text-xs text-[#E6E9EF]">
              {k} <span className="font-semibold text-[#00C805]">{(v * 100).toFixed(0)}%</span>
            </span>
          ))}
          <span className="rounded-md border border-[#1E2632] bg-[#0C0F16] px-2.5 py-1 text-xs text-[#E6E9EF]">
            Top-N <span className="font-semibold text-white">{d.config.top_n}</span>
          </span>
          <span className="rounded-md border border-[#1E2632] bg-[#0C0F16] px-2.5 py-1 text-xs text-[#E6E9EF]">
            Hold <span className="font-semibold text-white">{d.config.hold_days}d</span>
          </span>
        </div>
      </Card>

      {/* equity curve */}
      <Card
        title="Equity curve — fixed config (2011–2026)"
        sub={`Compounding the frozen quality+momentum config at a ${d.config.hold_days}-day hold traces ${d.metrics.cagr.toFixed(1)}% CAGR (Sharpe ${d.metrics.sharpe.toFixed(2)}, MaxDD ${d.metrics.max_dd.toFixed(1)}%) vs SPY ${d.metrics.spy_cagr.toFixed(1)}% over the same window; both half-samples hold Sharpe ~${d.metrics.half_sharpe_1.toFixed(1)}. This is SURVIVOR-ONLY — an upper bound. For live sizing prefer the conservative ${d.metrics.conservative_cagr_low}–${d.metrics.conservative_cagr_high}% / Sharpe ~${d.metrics.conservative_sharpe.toFixed(1)} (well-sampled 42-day) figure.`}
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={d.equity_curve} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2632" />
              <XAxis dataKey="date" tick={{ fill: "#7C879B", fontSize: 10 }} minTickGap={48}
                tickFormatter={(s: string) => s.slice(0, 4)} />
              <YAxis scale="log" domain={["auto", "auto"]} tick={{ fill: "#7C879B", fontSize: 10 }}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`} width={52} />
              <Tooltip contentStyle={{ background: "#0C0F16", border: "1px solid #1E2632", fontSize: 12 }}
                labelStyle={{ color: "#7C879B" }}
                formatter={(v: number) => [`$${v.toFixed(0)}`, "Equity (start $100)"]} />
              <Line type="monotone" dataKey="equity" stroke="#00C805" strokeWidth={1.6} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* year × hold table */}
      <Card
        title="Annualised return by year × holding period"
        sub="Each cell is the annualised return for that calendar year at that hold length (trading days). Robustness check: the config's edge should not live in a single year or a single hold."
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-right text-xs">
            <thead>
              <tr className="text-[#7C879B]">
                <th className="px-2 py-1 text-left font-medium">Year</th>
                {yh.holds.map((h) => (
                  <th key={h} className="px-2 py-1 font-medium">{h === "SPY" ? "SPY" : `${h}d`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {yh.rows.map((row) => (
                <tr key={row.label} className={`${/all|full|mean|avg/i.test(row.label) ? "font-semibold text-white border-t border-[#1E2632]" : "text-[#C7CEDA]"}`}>
                  <td className="px-2 py-1 text-left">{row.label}</td>
                  {yh.holds.map((h) => {
                    const v = row[h] as number | null;
                    return (
                      <td key={h} className="px-2 py-1" style={{ background: heat(v) }}>
                        {v == null ? "·" : `${v.toFixed(0)}%`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* holdings log */}
      <Card
        title="Historical holdings per rebalance"
        sub={`The top-${d.config.top_n} names the config selected at each ${d.config.hold_days}-day rebalance (${d.metrics.n_rebalances} rebalances, newest first).`}
      >
        <div className="space-y-1.5">
          {holdings.map((h) => (
            <div key={h.date} className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0 font-mono text-[#7C879B]">{h.date}</span>
              <div className="flex flex-wrap gap-1.5">
                {h.tickers.map((t) => (
                  <span key={t} className="rounded border border-[#1E2632] bg-[#0C0F16] px-1.5 py-0.5 font-mono text-[#E6E9EF]">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {d.holdings.length > 12 && (
          <div className="mt-3">
            <Pill active={showAll} onClick={() => setShowAll((s) => !s)}>
              {showAll ? "Show recent only" : `Show all ${d.holdings.length} rebalances`}
            </Pill>
          </div>
        )}
      </Card>

      <p className="text-[10px] text-[#5A6477]">
        Source: split-corrected, filing-lag-buffered EDGAR panel (2011–2026), recomputed for the clean
        quality+momentum config by build_value_quality_tab_data.py, generated {d.generated_at}. Survivor-only upper bound — presentation only, see caveats.
      </p>
    </div>
  );
}
