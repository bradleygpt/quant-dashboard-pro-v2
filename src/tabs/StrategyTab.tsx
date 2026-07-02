import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Card, Metric, Pill, Spinner, Unavailable } from "../components/ui";
import PipelineViz, { buildVizData, type VizStream } from "../components/PipelineViz";

const BASE = `${import.meta.env.BASE_URL}data`;
const STREAM_COLS = ["#3FB984", "#5B8BC4", "#D4A24E", "#9B7FC9", "#C25A5A"];

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
  const { goToDetail } = useStore();
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

  // real-data pipeline viz: ACTUAL equity-curve path + REAL per-rebalance baskets (per-ticker
  // returns aren't baked per quant strategy, so each candle uses the basket's realized period return).
  const vizData = useMemo(() => {
    if (!d) return { curve: [1], rebalances: [] };
    const pts = d.equity_curve.map((e) => ({ date: e.date, growth: e.equity / 100 }));
    return buildVizData(pts, d.holdings.map((h) => ({ date: h.date, tickers: h.tickers })));
  }, [d]);
  const vizStreams = useMemo<VizStream[]>(() => {
    if (!d) return [];
    return Object.keys(d.config.weights).map((k, i) => ({ id: k.slice(0, 4), col: STREAM_COLS[i % STREAM_COLS.length] }));
  }, [d]);

  if (err) return <Unavailable what={`${slug} strategy`} detail={`${slug}_strategy.json failed to load.`} />;
  if (!d) return <Spinner label="Loading strategy…" />;

  const w = d.config.weights;
  const m = d.metrics;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">{d.engine} · {d.character}</h2>
        <p className="text-xs text-mute">
          {d.tagline} Holding the top {d.config.top_n} names for ~{d.config.hold_days} trading days,
          rebalanced over the de-contaminated EDGAR-era panel (2011–2026), point-in-time S&P membership,
          true daily marks.{" "}
          <span className="text-mute">Research record, not a live recommendation — read the caveats first.</span>
        </p>
      </div>

      {vizData.rebalances.length > 0 && (
        <PipelineViz
          title={`${d.engine.toUpperCase()} · ${d.character}`}
          data={vizData}
          basketSize={d.config.top_n}
          weightPct={100 / d.config.top_n}
          kpis={{ cagr: m.in_sample.cagr, sharpe: m.in_sample.sharpe, maxdd: m.in_sample.max_dd }}
          streams={vizStreams}
          footer={`${d.engine} backtest ${d.backtest?.window ?? "2011-2026"} · illustrative top-down pipeline · research record, NOT a forward projection — walk-forward realized ~0.4× backtest CAGR`}
        />
      )}

      <div className="rounded-lg border border-paper/35 bg-warn/5 p-4">
        <div className="text-sm font-semibold text-warn">⚠ Read this before the numbers</div>
        <ul className="mt-2 space-y-1.5 text-xs text-[#D7C9A0]">
          {d.caveats.map((c, i) => (
            <li key={i} className="flex gap-2"><span className="text-warn">•</span><span>{c}</span></li>
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
        <div className="rounded-lg border border-paper/35 bg-warn/5 px-3 py-2 text-xs text-warn">
          ⚠ {d.backtest.forward_note}
        </div>
      )}

      <Card title="Configuration" sub="Frozen config — the same weights/hold used across every panel below.">
        <div className="flex flex-wrap gap-2">
          {Object.entries(w).map(([k, v]) => (
            <span key={k} className="rounded-md border border-line bg-inset px-2.5 py-1 text-xs text-ink">
              {k} <span className="font-semibold text-pos">{(v * 100).toFixed(0)}%</span>
            </span>
          ))}
          <span className="rounded-md border border-line bg-inset px-2.5 py-1 text-xs text-ink">
            Top-N <span className="font-semibold text-white">{d.config.top_n}</span>
          </span>
          <span className="rounded-md border border-line bg-inset px-2.5 py-1 text-xs text-ink">
            Hold <span className="font-semibold text-white">{d.config.hold_days}d</span>
          </span>
          <span className="rounded-md border border-line bg-inset px-2.5 py-1 text-xs text-ink">
            Turnover <span className="font-semibold text-white">{m.annual_turnover_pct}%/yr</span>
          </span>
        </div>
      </Card>

      <div className="rounded-lg border border-line bg-inset px-4 py-3 text-[11px] text-mute">
        The animated pipeline above plots the <span className="text-ink-2">actual</span> daily-marked backtest path and real per-rebalance baskets:
        $1 compounds to <span className="font-semibold text-pos">${m.final_multiple.toFixed(0)}</span> ({m.final_multiple.toFixed(0)}×) over {d.backtest?.window ?? "2011–2026"},
        vs S&P 500 {m.spy_cagr.toFixed(1)}%/yr and Nasdaq {m.nasdaq_cagr.toFixed(1)}%/yr. The visible dip is the real −{Math.abs(m.in_sample.max_dd).toFixed(0)}% COVID drawdown.
      </div>

      <Card
        title={`Annual return — ${d.engine} vs S&P 500`}
        sub="Calendar-year returns (true daily compounding). Robustness check: the edge should not live in a single year."
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-right text-xs">
            <thead>
              <tr className="text-mute">
                <th className="px-2 py-1 text-left font-medium">Year</th>
                <th className="px-2 py-1 font-medium">{d.engine}</th>
                <th className="px-2 py-1 font-medium">S&P 500</th>
                <th className="px-2 py-1 font-medium">Excess</th>
              </tr>
            </thead>
            <tbody>
              {d.yearly.map((row) => (
                <tr key={row.label} className="text-ink-2">
                  <td className="px-2 py-1 text-left">{row.label}</td>
                  <td className="px-2 py-1" style={{ background: heat(row.strategy) }}>{row.strategy.toFixed(0)}%</td>
                  <td className="px-2 py-1 text-mute">{row.spy.toFixed(0)}%</td>
                  <td className={`px-2 py-1 ${row.strategy - row.spy >= 0 ? "text-pos" : "text-neg"}`}>
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
              <span className="w-20 shrink-0 font-mono text-mute">{h.date}</span>
              <div className="flex flex-wrap gap-1.5">
                {h.tickers.map((t) => (
                  <button key={t} onClick={() => goToDetail(t)} title={`Open ${t} stock detail`}
                    className="rounded border border-line bg-inset px-1.5 py-0.5 font-mono text-ink hover:border-active hover:text-link">{t}</button>
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

      <p className="text-[10px] text-dim">
        Source: clean PIT EDGAR panel (authoritative-split de-contaminated valuation) + frozen {d.engine} config,
        generated {d.generated_at}. True daily mark-to-market. Presentation only — see caveats.
      </p>
    </div>
  );
}
