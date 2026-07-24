import { tooltipProps } from "../components/ChartFrame";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Card, Metric, Pill, Spinner, Unavailable } from "../components/ui";
import { fmtMoney, fmtPct } from "../lib/format";
import { loadDataJSON } from "../lib/data";
import { useLiveData } from "../lib/live";
import { computeBreadth } from "../lib/regime";
import { computePpi, PPI_VERDICT, PPI_BAND_NOTE, type PpiResult } from "../lib/ppiIndex";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import PipelineViz, { buildVizData, type VizStream } from "../components/PipelineViz";
import RegimeRibbon from "../components/RegimeRibbon";
import { useRebalanceSchedule, scheduleLabel, isPastDue } from "../lib/schedule";
import { INK, SEM, STREAM, SURFACE } from "../theme";

const BASE = `${import.meta.env.BASE_URL}data`;
// the 15 c78q signal streams: Pr1-6 (price/momentum, green), F1-6 (fundamentals, blue), P1/E3/N1 (insider/PEAD/8-K, violet)
const C78_STREAMS: VizStream[] = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: `Pr${i + 1}`, col: STREAM.price })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `F${i + 1}`, col: STREAM.fundamental })),
  { id: "P1", col: STREAM.event }, { id: "E3", col: STREAM.event }, { id: "N1", col: STREAM.event },
];

interface PpiFeed { ok?: boolean; spy?: { dates: string[]; close: number[] }; vix?: { close: number[] }; vvix?: { close: number[] } }
interface TargetRow { rank: number; ticker: string; posterior_prob: number; n_streams: number }
interface Position { ticker: string; entry_price: number; current_price: number; shares: number; stale_mark?: boolean }
interface SummaryRow { date: string; cum_strat: number; cum_spy: number; portfolio_return: number; spy_return: number; top_ticker: string; turnover: number; regime: string }
interface C78q {
  ok?: boolean; generated_at?: string; data_caveat?: string;
  spec?: { version: string; config: string; capital_default: number; basket_size: number; weight_per_position: number };
  target?: { as_of: string; rows: TargetRow[]; n?: number; source?: string; signal_now?: { as_of: string; rows: { rank: number; ticker: string; posterior_prob: number }[] } } | null;
  state?: { mode: string; deployed_date?: string; scale_in_pct?: number; cash_reserve?: number; capital?: number; next_rebalance?: string; positions?: Position[] } | null;
  ppi?: { as_of: string; score: number; level: string; band_deploy_pct: number; components: { name: string; weight: number; score: number | null; detail: string }[] } | null;
  backtest?: { summary?: SummaryRow[]; regime_periods?: { start: string; end: string; regime: string }[] };
  metrics?: { backtest?: Record<string, number>; live?: Record<string, any> };
  attribution?: any[];
  ppi_history?: { date: string; score: number }[];
}

type Sub = "ppi" | "deployed" | "backtest" | "analysis";

export default function C78QTab() {
  const { rows } = useStore();
  const ppiFeed = useLiveData<PpiFeed>("/api/ppi", 20000);
  const [data, setData] = useState<C78q | null>(null);
  const [err, setErr] = useState(false);
  const [sub, setSub] = useState<Sub>("ppi");
  useEffect(() => { loadDataJSON<C78q>("c78q.json").then((j) => { if (j) setData(j); else setErr(true); }); }, []);

  const breadthPct = useMemo(() => (rows.length ? computeBreadth(rows).pct_above_50sma : null), [rows]);
  const livePpi = useMemo<PpiResult | null>(() => {
    if (ppiFeed.status !== "ok" || !ppiFeed.data?.spy) return null;
    return computePpi(ppiFeed.data.spy.close, ppiFeed.data.vix?.close, ppiFeed.data.vvix?.close, breadthPct);
  }, [ppiFeed, breadthPct]);

  const tabs: [Sub, string][] = [["ppi", "📊 PPI"], ["deployed", "🎯 Deployed Assets"], ["backtest", "📈 Backtest"], ["analysis", "🧭 Analysis"]];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Project Katalepsis (c78q) Strategy</h2>
        <p className="text-xs text-mute">
          Currently holding {data?.target?.n ?? data?.spec?.basket_size ?? 8} stocks
          {data?.target?.n && data?.spec?.basket_size && data.target.n !== data.spec.basket_size ? ` (transitioning to top-${data.spec.basket_size})` : ""}, equal-weight {((data?.target?.n ? 1 / data.target.n : (data?.spec?.weight_per_position ?? 0.125)) * 100).toFixed(1)}%.
          Backtest / picks / state from the quant-historical ETL ({data?.generated_at ? new Date(data.generated_at).toLocaleDateString() : "daily"}); PPI computed live from SPY/VIX/VVIX + baked-universe breadth.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">{tabs.map(([k, l]) => <Pill key={k} active={sub === k} onClick={() => setSub(k)}>{l}</Pill>)}</div>

      {sub === "ppi" && <PpiBlock live={livePpi} feedStatus={ppiFeed.status} baked={data?.ppi ?? null} breadthPct={breadthPct} history={data?.ppi_history ?? null} />}
      {sub === "deployed" && (err || !data ? (data ? null : <Spinner />) : <DeployedBlock data={data} />)}
      {sub === "backtest" && (!data ? (err ? <Unavailable what="c78q backtest data" detail="c78q.json is copied from the quant-historical ETL during bake. Unavailable in a preview without it." /> : <Spinner />) : <BacktestBlock data={data} />)}
      {sub === "analysis" && (!data ? (err ? <Unavailable what="c78q analysis data" /> : <Spinner />) : <AnalysisBlock data={data} />)}
    </div>
  );
}

// ── (d) PPI ─────────────────────────────────────────────────────────────────
// DEMOTED 2026-07-24 alongside ppiIndex.ts — these were a second copy of the deployment
// instructions, including the "Pullback likely" forecast the v2 study refutes. Bands now
// describe present stress only.
const BANDS = [
  { lo: 0, hi: 20, label: "LOW", color: SEM.pos, note: "Stress low — measures calm." },
  { lo: 20, hi: 40, label: "MODERATE", color: SEM.posSoft, note: "Stress mild — normal range." },
  { lo: 40, hi: 60, label: "ELEVATED", color: SEM.warnHot, note: "Stress elevated — the most common state (~69% of days)." },
  { lo: 60, hi: 80, label: "HIGH", color: SEM.neg, note: "Stress high — coincides with a decline already underway." },
  { lo: 80, hi: 100, label: "EXTREME", color: SEM.negDeep, note: "Stress extreme — dislocation in progress (never observed in 15y)." },
];

function PpiBlock({ live, feedStatus, baked, breadthPct, history }: {
  live: PpiResult | null; feedStatus: string; baked: C78q["ppi"]; breadthPct: number | null; history: { date: string; score: number }[] | null;
}) {
  return (
    <div className="space-y-4">
      <Card title="Pullback Pressure Index (PPI)" sub="Faithful port of pullback_pressure_index.py — 7 weighted components. Live from SPY (2y) / VIX / VVIX; breadth from the baked universe.">
        {feedStatus === "loading" ? <Spinner label="Computing PPI from live market data…" /> :
         !live ? <Unavailable what="Live PPI inputs" detail="SPY/VIX/VVIX are fetched by the /api/ppi serverless function (keyless Yahoo). Unavailable in a static preview; the ETL's last computed PPI is shown below if present." /> : (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <div className="text-4xl font-bold" style={{ color: live.color }}>{live.score.toFixed(1)}<span className="text-lg text-mute">/100</span></div>
                <div className="text-sm font-semibold" style={{ color: live.color }}>{live.level}</div>
              </div>
              <div className="flex-1 text-sm text-ink-3">{live.action}<div className="mt-1 text-xs text-mute">Historical band reference: <span className="font-semibold text-ink-3">{live.band_deploy_pct}%</span> exposure — {PPI_BAND_NOTE}</div></div>
            </div>
            {/* gradient band scale with marker */}
            <div className="mt-3">
              <div className="flex h-3 w-full overflow-hidden rounded-full">
                {BANDS.map((b) => <div key={b.label} style={{ width: "20%", background: b.color, opacity: 0.55 }} />)}
              </div>
              <div className="relative h-4">
                <div className="absolute -mt-3 h-4 w-0.5 bg-white" style={{ left: `${Math.min(100, live.score)}%` }} />
              </div>
              <div className="flex justify-between text-[9px] text-dim">{BANDS.map((b) => <span key={b.label}>{b.lo}</span>)}<span>100</span></div>
            </div>

            <div className="mt-4 overflow-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead><tr>{["Component", "Score", "Weight", "Contribution", "Detail"].map((h) => <th key={h} className="bg-head px-3 py-2 text-left text-xs uppercase text-mute">{h}</th>)}</tr></thead>
                <tbody>
                  {live.components.map((c) => (
                    <tr key={c.key} className="border-t border-line-faint">
                      <td className="px-3 py-1.5 font-medium text-ink-2">{c.name}</td>
                      <td className="px-3 py-1.5 font-semibold" style={{ color: c.score < 30 ? SEM.pos : c.score < 50 ? SEM.warn : c.score < 70 ? SEM.warnHot : SEM.neg }}>{c.score}</td>
                      <td className="px-3 py-1.5 text-ink-3">{(c.weight * 100).toFixed(0)}%</td>
                      <td className="px-3 py-1.5 text-ink-3">{(c.score * c.weight).toFixed(1)}</td>
                      <td className="px-3 py-1.5 text-xs text-mute">{c.detail}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-line-2 bg-head/40 font-semibold">
                    <td className="px-3 py-1.5 text-ink">PPI</td>
                    <td className="px-3 py-1.5" style={{ color: live.color }}>{live.score.toFixed(1)}</td>
                    <td className="px-3 py-1.5 text-ink-3">100%</td>
                    <td className="px-3 py-1.5 text-ink-2">{live.score.toFixed(1)}</td>
                    <td className="px-3 py-1.5 text-xs text-mute">{live.level}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[10px] text-dim">
              Breadth is computed from the app's baked universe ({breadthPct != null ? `${breadthPct.toFixed(0)}% above 50-SMA` : "unavailable"}), not the ~1,747 per-stock parquets the Python scans — the expected source of any small drift vs the Python's PPI.
            </div>
          </>
        )}
      </Card>

      {/* Interpretation bands */}
      <Card title="Interpretation">
        <div className="space-y-1 text-sm">
          {BANDS.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="w-16 text-right text-xs text-mute">{b.lo}–{b.hi}</span>
              <span className="w-24 font-semibold" style={{ color: b.color }}>{b.label}</span>
              <span className="text-ink-3">{b.note}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Trend (only if a history file is present — never fabricated) */}
      {history && history.length > 1 && (
        <Card title="PPI Trend" sub="Historical PPI series from the ETL.">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={SURFACE.raised} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: INK.mute, fontSize: 11 }} minTickGap={40} />
              <YAxis domain={[0, 100]} tick={{ fill: INK.mute, fontSize: 11 }} width={32} />
              <Tooltip {...tooltipProps} />
              <Line type="monotone" dataKey="score" stroke={SEM.warnHot} dot={false} strokeWidth={1.8} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Cross-reference: the ETL's last computed PPI (Python, real parquet breadth) */}
      {baked && (
        <Card title="ETL cross-reference" sub={`The daily Python ETL's last computed PPI (as of ${baked.as_of}) — uses real per-stock parquet breadth.`}>
          <div className="flex flex-wrap items-center gap-4">
            <Metric label="ETL PPI" value={`${baked.score.toFixed(1)} · ${baked.level}`} hint={`band ref ${baked.band_deploy_pct}% — not a recommendation`} />
            <div className="text-xs text-mute">{live ? `Live recompute: ${live.score.toFixed(1)} · ${live.level}. Differences come from data recency + breadth source (baked universe vs parquets).` : "Live recompute unavailable in preview."}</div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── (b) Current monthly deployed assets ──────────────────────────────────────
function DeployedBlock({ data }: { data: C78q }) {
  const _kSched = useRebalanceSchedule()["katalepsis"];
  const t = data.target, s = data.state;
  const wpp = t?.n ? 1 / t.n : (data.spec?.weight_per_position ?? 0.125); // current-book weight (target.n), not the go-forward spec
  const cap = s?.capital ?? data.spec?.capital_default ?? 25000;
  // Live-preferred deployment prices: the c78q ledger's current_price is a static
  // ETL snapshot frozen at the deploy date (stale_mark), so "current"/gains read 0%.
  // Prefer a live intraday quote (batched keyless /api/quotes) so this Live Deployment
  // view reflects today; fall back to the baked snapshot, labeled per row.
  const { goToDetail } = useStore();
  const posTickers = useMemo(() => (s?.positions ?? []).map((p) => p.ticker), [s]);
  const [livePx, setLivePx] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!posTickers.length) return;
    let on = true;
    fetch(`/api/quotes?tickers=${posTickers.join(",")}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (on && j?.prices) setLivePx(new Map(Object.entries(j.prices as Record<string, number>)));
    }).catch(() => {});
    return () => { on = false; };
  }, [posTickers]);
  return (
    <div className="space-y-4">
      <Card title="Current Target" asOfDate={t?.as_of} sub={t ? `c78q picks as of ${t.as_of} · ${t.rows.length} stocks · equal-weight ${(wpp * 100).toFixed(1)}% each` : undefined}>
        {!t?.rows?.length ? <div className="text-sm text-mute">No current target available.</div> : (
          <div className="overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead><tr>{["#", "Ticker", "Weight", "Posterior", "Streams", "Allocation"].map((h) => <th key={h} className="bg-head px-3 py-2 text-left text-xs uppercase text-mute">{h}</th>)}</tr></thead>
              <tbody>
                {t.rows.map((r) => (
                  <tr key={r.ticker} className="border-t border-line-faint">
                    <td className="px-3 py-1.5 text-mute">{r.rank}</td>
                    <td className="px-3 py-1.5"><button onClick={() => goToDetail(r.ticker)} className="font-semibold text-link hover:underline" title={`Open ${r.ticker} stock detail`}>{r.ticker}</button></td>
                    <td className="px-3 py-1.5">{(wpp * 100).toFixed(1)}%</td>
                    <td className="px-3 py-1.5">{(r.posterior_prob * 100).toFixed(1)}%</td>
                    <td className="px-3 py-1.5 text-ink-3">{r.n_streams}</td>
                    <td className="px-3 py-1.5">{fmtMoney(cap * wpp, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {t?.signal_now?.rows?.length ? (
        <Card title="Current Signal — NOT held (drift indicator)" sub={`Top-${data.spec?.basket_size ?? 3} the posterior favors as of ${t.signal_now.as_of}. What the model would pick TODAY vs the held book above — a turnover/drift gauge, not a trade list.`}>
          <div className="flex flex-wrap gap-2">
            {t.signal_now.rows.map((r) => <Pill key={r.ticker} active={false}>{r.rank}. {r.ticker} · {(r.posterior_prob * 100).toFixed(1)}%</Pill>)}
          </div>
        </Card>
      ) : null}

      {s?.mode === "deployed" ? (
        <Card title="Live Deployment State" sub={`Deployed ${s.deployed_date} · scale-in ${s.scale_in_pct}% · next rebalance ${_kSched?.next_rebalance ?? s.next_rebalance}${_kSched ? ` (${scheduleLabel(_kSched)})` : ""}. Current = live intraday quote when available (else baked snapshot, labeled).`}>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Capital" value={fmtMoney(s.capital ?? 0, 0)} />
            <Metric label="Scale-in" value={`${s.scale_in_pct}%`} />
            <Metric label="Cash reserve" value={fmtMoney(s.cash_reserve ?? 0, 0)} />
            <Metric label="Next rebalance"
                    value={_kSched?.next_rebalance ?? s.next_rebalance ?? "—"}
                    hint={_kSched ? scheduleLabel(_kSched) + (isPastDue(_kSched) ? " · PAST DUE" : "") : undefined} />
          </div>
          {s.positions?.length ? (
            <div className="overflow-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead><tr>{["Ticker", "Shares", "Entry", "Current", "Gain", "Value"].map((h) => <th key={h} className="bg-head px-3 py-2 text-left text-xs uppercase text-mute">{h}</th>)}</tr></thead>
                <tbody>
                  {s.positions.map((p) => {
                    const lq = livePx.get(p.ticker);
                    const cur = lq ?? p.current_price;
                    const isLive = lq != null;
                    const gain = p.entry_price > 0 ? (cur / p.entry_price - 1) * 100 : 0;
                    return (
                      <tr key={p.ticker} className="border-t border-line-faint">
                        <td className="px-3 py-1.5"><button onClick={() => goToDetail(p.ticker)} className="font-semibold text-link hover:underline" title={`Open ${p.ticker} stock detail`}>{p.ticker}</button></td>
                        <td className="px-3 py-1.5">{p.shares}</td>
                        <td className="px-3 py-1.5">{fmtMoney(p.entry_price)}</td>
                        <td className="px-3 py-1.5">{fmtMoney(cur)}
                          <span className={`ml-1 text-[10px] ${isLive ? "text-pos" : "text-mute"}`}>{isLive ? "live" : "stale"}</span>
                        </td>
                        <td className="px-3 py-1.5 font-semibold" style={{ color: gain >= 0 ? SEM.pos : SEM.neg }}>{fmtPct(gain, 1, true)}</td>
                        <td className="px-3 py-1.5">{fmtMoney(p.shares * cur, 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="text-sm text-mute">No open positions recorded.</div>}
        </Card>
      ) : (
        <Card title="Live Deployment State"><div className="text-sm text-mute">Mode: {s?.mode ?? "pre-deploy"} — no positions deployed yet.</div></Card>
      )}
    </div>
  );
}

// ── (a) Historical backtest ───────────────────────────────────────────────────
function BacktestBlock({ data }: { data: C78q }) {
  const bt = data.metrics?.backtest ?? {};
  const summary = data.backtest?.summary ?? [];
  // Real buy-and-hold SPY benchmark (keyless Yahoo, adjusted monthly). The dataset's
  // bundled spy_return is NOT buy-and-hold SPY (compounds to ~32% CAGR / ~$48), so we
  // source actual SPY for the benchmark line.
  const spyFeed = useLiveData<{ ok?: boolean; months?: string[]; close?: number[] }>("/api/spy-monthly", 15000);
  const curve = useMemo(() => {
    const spyByMonth = new Map<string, number>();
    if (spyFeed.status === "ok" && spyFeed.data?.months && spyFeed.data.close)
      spyFeed.data.months.forEach((m, i) => spyByMonth.set(m, spyFeed.data!.close![i]));
    const spyBase = summary.length ? spyByMonth.get(summary[0].date.slice(0, 7)) : undefined;
    let cs = 1; // c78q growth of $1 by compounding per-period decimal returns
    return summary.map((r) => {
      cs *= 1 + r.portfolio_return;
      const spyClose = spyByMonth.get(r.date.slice(0, 7));
      return { t: Date.parse(r.date), strat: cs, spy: spyBase && spyClose ? spyClose / spyBase : null };
    });
  }, [summary, spyFeed]);
  const stratEnd = curve.length ? curve[curve.length - 1].strat : null;
  const spyEnd = (() => { for (let i = curve.length - 1; i >= 0; i--) if (curve[i].spy != null) return curve[i].spy!; return null; })();
  const spyLive = spyFeed.status === "ok" && spyEnd != null;

  // real-data pipeline viz: ACTUAL growth path (compounded portfolio_return) + REAL per-rebalance
  // baskets with each name's realized forward_return for the candle.
  const vizData = useMemo(() => {
    let g = 1; const pts = summary.map((r) => { g *= 1 + r.portfolio_return; return { date: r.date, growth: g }; });
    const hold = ((data.backtest as any)?.holdings ?? []) as { date: string; ticker: string; rank: number; forward_return?: number }[];
    const bk = new Map<string, { date: string; tickers: { sym: string; ret: number }[] }>();
    [...hold].sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank).forEach((h) => {
      if (!bk.has(h.date)) bk.set(h.date, { date: h.date, tickers: [] });
      bk.get(h.date)!.tickers.push({ sym: h.ticker, ret: h.forward_return ?? 0 });
    });
    return buildVizData(pts, [...bk.values()]);
  }, [summary, data]);

  return (
    <div className="space-y-4">
      {vizData.rebalances.length > 0 && (
        <PipelineViz
          title="KATALEPSIS · c78q"
          data={vizData}
          basketSize={data.spec?.basket_size ?? 3}
          weightPct={(data.spec?.weight_per_position ?? 0.333) * 100}
          kpis={{ cagr: (bt.net_cagr ?? 0) * 100, sharpe: bt.sharpe ?? 0, maxdd: (bt.max_drawdown ?? 0) * 100 }}
          edge={{ full: { val: 1.10, t: 2.47, sig: true }, recent: { val: 1.27, t: 1.55, sig: false } }}
          candidate
          streams={C78_STREAMS}
          footer="dump_78q_holdings.py · illustrative top-down pipeline · HEADLINE NOT CERTIFIED — broad rank-IC ≈ 0, thin top-bucket edge, recently t<2 · candidate-grade"
        />
      )}
      {vizData.rebalances.length > 0 && summary.length > 1 && (
        <div className="-mt-2">
          {/* regime strip aligned to the crucible's curve band (x: 12%…88% of the frame) */}
          <RegimeRibbon
            domain={[summary[0].date, summary[summary.length - 1].date]}
            leftInset="12%" rightInset="12%" legend
          />
        </div>
      )}
      <Card title="Validated Backtest" sub={`c78q ${data.spec?.version ?? ""} · ${bt.n_months ?? summary.length} months · TOP-${data.spec?.basket_size ?? 8}, ${(data.spec as any)?.rebalance ?? "monthly"}, equal-weight`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Net CAGR" value={<span className="text-pos">{bt.net_cagr != null ? fmtPct(bt.net_cagr * 100, 1) : "—"}</span>} />
          <Metric label="Sharpe" value={bt.sharpe != null ? bt.sharpe.toFixed(2) : "—"} />
          <Metric label="Max Drawdown" value={<span className="text-neg">{bt.max_drawdown != null ? fmtPct(bt.max_drawdown * 100, 1) : "—"}</span>} />
          <Metric label="Hit Rate" value={bt.hit_rate != null ? fmtPct(bt.hit_rate * 100, 1) : "—"} />
          <Metric label="Turnover" value={bt.turnover != null ? `${(bt.turnover * 100).toFixed(0)}%` : "—"} />
          <Metric label="Months" value={bt.n_months ?? summary.length} />
        </div>
      </Card>

      {data.data_caveat && (
        <div className="rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-[11px] text-brass-hi">
          ⚠️ {data.data_caveat}
        </div>
      )}

      {summary.length > 0 && (
        <div className="rounded-lg border border-line bg-inset px-4 py-3 text-[11px] text-mute">
          The animated pipeline above plots the <span className="text-ink-2">actual</span> backtest path — real cum_strat over {summary.length} months ({summary[0].date} → {summary[summary.length - 1].date}), real per-rebalance baskets, each name's realized return as its candle.
          Terminal per $1: c78q <span className="font-semibold text-pos">${stratEnd != null ? stratEnd.toFixed(0) : "—"}</span>
          {" vs SPY "}<span className="font-semibold text-ink-2">{spyLive ? `$${spyEnd!.toFixed(1)}` : "—"}</span>
          {spyLive ? " (real buy-and-hold)." : ""}
        </div>
      )}
    </div>
  );
}

// ── (c) Analysis ───────────────────────────────────────────────────────────────
function AnalysisBlock({ data }: { data: C78q }) {
  const live = data.metrics?.live;
  const bt = data.metrics?.backtest ?? {};
  return (
    <div className="space-y-4">
      <Card title="Strategy Spec" sub={data.spec?.version}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Config" value={data.spec?.config ?? "—"} />
          <Metric label="Basket size" value={data.spec?.basket_size ?? "—"} />
          <Metric label="Weight/position" value={data.spec ? `${(data.spec.weight_per_position * 100).toFixed(1)}%` : "—"} />
          <Metric label="Default capital" value={fmtMoney(data.spec?.capital_default ?? 0, 0)} />
        </div>
      </Card>

      <Card title="Live vs Backtest" sub="Realized live metrics accrue once ≥3 months are traded; until then only the validated backtest record is shown.">
        <div className="overflow-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead><tr>{["Metric", "Backtest", "Live"].map((h) => <th key={h} className="bg-head px-3 py-2 text-left text-xs uppercase text-mute">{h}</th>)}</tr></thead>
            <tbody>
              {([["Net CAGR", bt.net_cagr != null ? fmtPct(bt.net_cagr * 100, 1) : "—", live?.available ? fmtPct((live.net_cagr ?? 0) * 100, 1) : "—"],
                 ["Sharpe", bt.sharpe?.toFixed?.(2) ?? "—", live?.available ? live.sharpe?.toFixed?.(2) ?? "—" : "—"],
                 ["Hit rate", bt.hit_rate != null ? fmtPct(bt.hit_rate * 100, 1) : "—", live?.available ? fmtPct((live.hit_rate ?? 0) * 100, 1) : "—"],
                 ["Months", String(bt.n_months ?? "—"), String(live?.n_months ?? 0)]] as const).map((r) => (
                <tr key={r[0]} className="border-t border-line-faint"><td className="px-3 py-1.5 text-ink-2">{r[0]}</td><td className="px-3 py-1.5">{r[1]}</td><td className="px-3 py-1.5 text-ink-3">{r[2]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {!live?.available && <div className="mt-2 text-[11px] text-mute">Live track record: {live?.n_months ?? 0} months traded — needs ≥3 for realized metrics.</div>}
      </Card>

      <Card title="Per-stream attribution">
        {data.attribution && data.attribution.length ? (
          <div className="text-sm text-ink-3">{data.attribution.length} attribution rows available in the ETL output.</div>
        ) : <div className="text-sm text-mute">No per-stream attribution in the current ETL output (populated by a separate stream-walk script).</div>}
      </Card>
    </div>
  );
}
