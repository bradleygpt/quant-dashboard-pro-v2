import { useEffect, useMemo, useState } from "react";
import { Card, Metric, Pill, Spinner, Unavailable } from "../components/ui";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const BASE = `${import.meta.env.BASE_URL}data`;

interface Holding { date: string; tickers: string[] }
interface YearRow { label: string; strategy: number; spy: number }
interface Metrics3 { cagr: number; sharpe: number; max_dd: number }
export interface StrategyData {
  generated_at: string;
  engine: string;
  character: string;
  tagline: string;
  config: { weights: Record<string, number>; top_n: number; hold_days: number };
  metrics: {
    in_sample: Metrics3; oos: Metrics3; train: Metrics3;
    spy_cagr: number; nasdaq_cagr: number; n_rebalances: number;
    annual_turnover_pct: number; final_multiple: number;
  };
  backtest?: {
    cagr: number; sharpe: number; max_dd: number; window: string;
    regime_cagr: { blocks: { period: string; cagr: number }[]; median: number; best: number; worst: number };
    forward_note: string;
  };
  equity_curve: { date: string; equity: number; spy: number; nasdaq: number }[];
  yearly: YearRow[];
  holdings: Holding[];
  caveats: string[];
}

function heat(v: number | null): string {
  if (v == null) return "transparent";
  const t = Math.max(-1, Math.min(1, v / 40));
  return t >= 0 ? `rgba(0,200,5,${0.10 + 0.45 * t})` : `rgba(255,87,34,${0.10 + 0.45 * -t})`;
}

// Generic strategy page (Prosodos / Krasis / Auxesis / …). Reads {slug}_strategy.json and
// renders entirely from its data — honest true-daily metrics, equity curve vs SP500+Nasdaq,
// year-vs-S&P table, and the full historical holdings log.
export default function StrategyTab({ slug }: { slug: string }) {
  const [d, setD] = useState<StrategyData | null>(null);
  const [err, setErr] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setD(null); setErr(false); setShowAll(false);
    fetch(`${BASE}/${slug}_strategy.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErr(true));
  }, [slug]);

  const holdings = useMemo(() => {
    if (!d) return [];
    const sorted = [...d.holdings].sort((a, b) => b.date.localeCompare(a.date));
    return showAll ? sorted : sorted.slice(0, 12);
  }, [d, showAll]);

  if (err) return <Unavailable what={`${slug} strategy`} detail={`${slug}_strategy.json failed to load.`} />;
  if (!d) return <Spinner label="Loading strategy…" />;

  const w = d.config.weights;
  const m = d.metrics;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">{d.engine} · {d.character}</h2>
        <p className="text-xs text-[#7C879B]">
          {d.tagline} Holding the top {d.config.top_n} names for ~{d.config.hold_days} trading days,
          rebalanced over the de-contaminated EDGAR-era panel (2011–2026), point-in-time S&P membership,
          true daily marks.{" "}
          <span className="text-[#7C879B]">Research record, not a live recommendation — read the caveats first.</span>
        </p>
      </div>

      <div className="rounded-lg border border-[#5A4A1E] bg-[#1E1A0E] p-4">
        <div className="text-sm font-semibold text-[#FFC107]">⚠ Read this before the numbers</div>
        <ul className="mt-2 space-y-1.5 text-xs text-[#D7C9A0]">
          {d.caveats.map((c, i) => (
            <li key={i} className="flex gap-2"><span className="text-[#FFC107]">•</span><span>{c}</span></li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label={`Backtest CAGR ${d.backtest?.window ?? "2011–2026"}`} value={`${m.in_sample.cagr.toFixed(1)}%`} hint={`vs SPY ${m.spy_cagr.toFixed(1)}% · Nasdaq ${m.nasdaq_cagr.toFixed(1)}%`} />
        <Metric label="Sharpe (daily)" value={m.in_sample.sharpe.toFixed(2)} hint="true daily marks" />
        <Metric label="Max Drawdown (true)" value={`${m.in_sample.max_dd.toFixed(1)}%`} hint="real COVID-2020 low" />
        {d.backtest ? (
          <Metric label="Regime CAGR range" value={`${d.backtest.regime_cagr.worst.toFixed(0)}–${d.backtest.regime_cagr.best.toFixed(0)}%`} hint={`median ${d.backtest.regime_cagr.median.toFixed(0)}% · across 2-yr blocks`} />
        ) : (
          <Metric label="Out-of-sample 2021–26" value={`${m.oos.cagr.toFixed(1)}%`} hint={`untouched holdout · Sh ${m.oos.sharpe.toFixed(2)}`} />
        )}
      </div>

      {d.backtest && (
        <div className="rounded-lg border border-[#5A4A1E] bg-[#1E1A0E] px-3 py-2 text-xs text-[#FFC107]">
          ⚠ {d.backtest.forward_note}
        </div>
      )}

      <Card title="Configuration" sub="Frozen config — the same weights/hold used across every panel below.">
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
          <span className="rounded-md border border-[#1E2632] bg-[#0C0F16] px-2.5 py-1 text-xs text-[#E6E9EF]">
            Turnover <span className="font-semibold text-white">{m.annual_turnover_pct}%/yr</span>
          </span>
        </div>
      </Card>

      <Card
        title={`Growth of $100 — ${d.engine} vs S&P 500 & Nasdaq (2011–2026)`}
        sub={`True daily mark-to-market: $100 compounds to $${(m.final_multiple * 100).toFixed(0)} (${m.final_multiple.toFixed(0)}x) at the ${d.config.hold_days}-day hold, vs S&P 500 ${m.spy_cagr.toFixed(1)}%/yr and Nasdaq ${m.nasdaq_cagr.toFixed(1)}%/yr. The visible dip is the real −${Math.abs(m.in_sample.max_dd).toFixed(0)}% COVID drawdown, not a smoothed line.`}
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
                formatter={(v: number, n: string) => [`$${v.toFixed(0)}`, n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="equity" name={d.engine} stroke="#00C805" strokeWidth={1.9} dot={false} />
              <Line type="monotone" dataKey="nasdaq" name="Nasdaq" stroke="#FFB020" strokeWidth={1.2} strokeDasharray="5 2" dot={false} />
              <Line type="monotone" dataKey="spy" name="S&P 500" stroke="#7C879B" strokeWidth={1.2} strokeDasharray="2 2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card
        title={`Annual return — ${d.engine} vs S&P 500`}
        sub="Calendar-year returns (true daily compounding). Robustness check: the edge should not live in a single year."
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-right text-xs">
            <thead>
              <tr className="text-[#7C879B]">
                <th className="px-2 py-1 text-left font-medium">Year</th>
                <th className="px-2 py-1 font-medium">{d.engine}</th>
                <th className="px-2 py-1 font-medium">S&P 500</th>
                <th className="px-2 py-1 font-medium">Excess</th>
              </tr>
            </thead>
            <tbody>
              {d.yearly.map((row) => (
                <tr key={row.label} className="text-[#C7CEDA]">
                  <td className="px-2 py-1 text-left">{row.label}</td>
                  <td className="px-2 py-1" style={{ background: heat(row.strategy) }}>{row.strategy.toFixed(0)}%</td>
                  <td className="px-2 py-1 text-[#7C879B]">{row.spy.toFixed(0)}%</td>
                  <td className={`px-2 py-1 ${row.strategy - row.spy >= 0 ? "text-[#00C805]" : "text-[#FF5722]"}`}>
                    {(row.strategy - row.spy >= 0 ? "+" : "")}{(row.strategy - row.spy).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Historical holdings per rebalance"
        sub={`The top-${d.config.top_n} names ${d.engine} selected at each ${d.config.hold_days}-day rebalance (${d.metrics.n_rebalances} rebalances, newest first).`}
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
        Source: clean PIT EDGAR panel (authoritative-split de-contaminated valuation) + frozen {d.engine} config,
        generated {d.generated_at}. True daily mark-to-market. Presentation only — see caveats.
      </p>
    </div>
  );
}
