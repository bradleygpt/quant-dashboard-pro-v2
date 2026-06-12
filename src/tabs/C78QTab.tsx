import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Card, Metric, Pill, Spinner, Unavailable } from "../components/ui";
import { fmtMoney, fmtPct } from "../lib/format";
import { useLiveData } from "../lib/live";
import { computeBreadth } from "../lib/regime";
import { computePpi, type PpiResult } from "../lib/ppiIndex";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceArea } from "recharts";

const BASE = `${import.meta.env.BASE_URL}data`;

interface PpiFeed { ok?: boolean; spy?: { dates: string[]; close: number[] }; vix?: { close: number[] }; vvix?: { close: number[] } }
interface TargetRow { rank: number; ticker: string; posterior_prob: number; n_streams: number }
interface Position { ticker: string; entry_price: number; current_price: number; shares: number; stale_mark?: boolean }
interface SummaryRow { date: string; cum_strat: number; cum_spy: number; portfolio_return: number; spy_return: number; top_ticker: string; turnover: number; regime: string }
interface C78q {
  ok?: boolean; generated_at?: string;
  spec?: { version: string; config: string; capital_default: number; basket_size: number; weight_per_position: number };
  target?: { as_of: string; rows: TargetRow[] } | null;
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
  useEffect(() => { fetch(`${BASE}/c78q.json`).then((r) => r.ok ? r.json() : Promise.reject()).then(setData).catch(() => setErr(true)); }, []);

  const breadthPct = useMemo(() => (rows.length ? computeBreadth(rows).pct_above_50sma : null), [rows]);
  const livePpi = useMemo<PpiResult | null>(() => {
    if (ppiFeed.status !== "ok" || !ppiFeed.data?.spy) return null;
    return computePpi(ppiFeed.data.spy.close, ppiFeed.data.vix?.close, ppiFeed.data.vvix?.close, breadthPct);
  }, [ppiFeed, breadthPct]);

  const tabs: [Sub, string][] = [["ppi", "📊 PPI"], ["deployed", "🎯 Deployed Assets"], ["backtest", "📈 Backtest"], ["analysis", "🧭 Analysis"]];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">c78q Strategy</h2>
        <p className="text-xs text-[#7C879B]">
          The validated c78q strategy (config {data?.spec?.config ?? "A_top8"} · {data?.spec?.basket_size ?? 8} US stocks, equal-weight {(data?.spec?.weight_per_position ?? 0.125) * 100}%).
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
const BANDS = [
  { lo: 0, hi: 20, label: "LOW", color: "#00C805", note: "Market healthy. Deploy normally." },
  { lo: 20, hi: 40, label: "MODERATE", color: "#8BC34A", note: "Normal fluctuation." },
  { lo: 40, hi: 60, label: "ELEVATED", color: "#FF9800", note: "Consider scaling in vs full deployment." },
  { lo: 60, hi: 80, label: "HIGH", color: "#FF5722", note: "Delay new deployment. Pullback likely." },
  { lo: 80, hi: 100, label: "EXTREME", color: "#D32F2F", note: "Active correction. Wait for resolution." },
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
                <div className="text-4xl font-bold" style={{ color: live.color }}>{live.score.toFixed(1)}<span className="text-lg text-[#7C879B]">/100</span></div>
                <div className="text-sm font-semibold" style={{ color: live.color }}>{live.level}</div>
              </div>
              <div className="flex-1 text-sm text-[#9CA7BB]">{live.action}<div className="mt-1 text-xs text-[#7C879B]">Suggested deployment: <span className="font-semibold text-[#C3CAD7]">{live.band_deploy_pct}%</span> now.</div></div>
            </div>
            {/* gradient band scale with marker */}
            <div className="mt-3">
              <div className="flex h-3 w-full overflow-hidden rounded-full">
                {BANDS.map((b) => <div key={b.label} style={{ width: "20%", background: b.color, opacity: 0.55 }} />)}
              </div>
              <div className="relative h-4">
                <div className="absolute -mt-3 h-4 w-0.5 bg-white" style={{ left: `${Math.min(100, live.score)}%` }} />
              </div>
              <div className="flex justify-between text-[9px] text-[#5C6678]">{BANDS.map((b) => <span key={b.label}>{b.lo}</span>)}<span>100</span></div>
            </div>

            <div className="mt-4 overflow-auto rounded-lg border border-[#1E2632]">
              <table className="w-full text-sm">
                <thead><tr>{["Component", "Score", "Weight", "Contribution", "Detail"].map((h) => <th key={h} className="bg-[#0F1420] px-3 py-2 text-left text-xs uppercase text-[#7C879B]">{h}</th>)}</tr></thead>
                <tbody>
                  {live.components.map((c) => (
                    <tr key={c.key} className="border-t border-[#161D29]">
                      <td className="px-3 py-1.5 font-medium text-[#C3CAD7]">{c.name}</td>
                      <td className="px-3 py-1.5 font-semibold" style={{ color: c.score < 30 ? "#00C805" : c.score < 50 ? "#FFC107" : c.score < 70 ? "#FF9800" : "#FF5722" }}>{c.score}</td>
                      <td className="px-3 py-1.5 text-[#9CA7BB]">{(c.weight * 100).toFixed(0)}%</td>
                      <td className="px-3 py-1.5 text-[#9CA7BB]">{(c.score * c.weight).toFixed(1)}</td>
                      <td className="px-3 py-1.5 text-xs text-[#7C879B]">{c.detail}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-[#2A3242] bg-[#0F1420]/40 font-semibold">
                    <td className="px-3 py-1.5 text-[#E6E9EF]">PPI</td>
                    <td className="px-3 py-1.5" style={{ color: live.color }}>{live.score.toFixed(1)}</td>
                    <td className="px-3 py-1.5 text-[#9CA7BB]">100%</td>
                    <td className="px-3 py-1.5 text-[#C3CAD7]">{live.score.toFixed(1)}</td>
                    <td className="px-3 py-1.5 text-xs text-[#7C879B]">{live.level}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[10px] text-[#5C6678]">
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
              <span className="w-16 text-right text-xs text-[#7C879B]">{b.lo}–{b.hi}</span>
              <span className="w-24 font-semibold" style={{ color: b.color }}>{b.label}</span>
              <span className="text-[#9CA7BB]">{b.note}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Trend (only if a history file is present — never fabricated) */}
      {history && history.length > 1 && (
        <Card title="PPI Trend" sub="Historical PPI series from the ETL.">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#1A2130" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#7C879B", fontSize: 11 }} minTickGap={40} />
              <YAxis domain={[0, 100]} tick={{ fill: "#7C879B", fontSize: 11 }} width={32} />
              <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} />
              <Line type="monotone" dataKey="score" stroke="#FF9800" dot={false} strokeWidth={1.8} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Cross-reference: the ETL's last computed PPI (Python, real parquet breadth) */}
      {baked && (
        <Card title="ETL cross-reference" sub={`The daily Python ETL's last computed PPI (as of ${baked.as_of}) — uses real per-stock parquet breadth.`}>
          <div className="flex flex-wrap items-center gap-4">
            <Metric label="ETL PPI" value={`${baked.score.toFixed(1)} · ${baked.level}`} hint={`deploy ${baked.band_deploy_pct}%`} />
            <div className="text-xs text-[#7C879B]">{live ? `Live recompute: ${live.score.toFixed(1)} · ${live.level}. Differences come from data recency + breadth source (baked universe vs parquets).` : "Live recompute unavailable in preview."}</div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── (b) Current monthly deployed assets ──────────────────────────────────────
function DeployedBlock({ data }: { data: C78q }) {
  const t = data.target, s = data.state, wpp = data.spec?.weight_per_position ?? 0.125;
  const cap = s?.capital ?? data.spec?.capital_default ?? 25000;
  // Live-preferred deployment prices: the c78q ledger's current_price is a static
  // ETL snapshot frozen at the deploy date (stale_mark), so "current"/gains read 0%.
  // Prefer a live intraday quote (batched keyless /api/quotes) so this Live Deployment
  // view reflects today; fall back to the baked snapshot, labeled per row.
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
      <Card title="Current Monthly Target" sub={t ? `c78q picks as of ${t.as_of} · ${t.rows.length} stocks · equal-weight ${(wpp * 100).toFixed(1)}% each` : undefined}>
        {!t?.rows?.length ? <div className="text-sm text-[#7C879B]">No current target available.</div> : (
          <div className="overflow-auto rounded-lg border border-[#1E2632]">
            <table className="w-full text-sm">
              <thead><tr>{["#", "Ticker", "Weight", "Posterior", "Streams", "Allocation"].map((h) => <th key={h} className="bg-[#0F1420] px-3 py-2 text-left text-xs uppercase text-[#7C879B]">{h}</th>)}</tr></thead>
              <tbody>
                {t.rows.map((r) => (
                  <tr key={r.ticker} className="border-t border-[#161D29]">
                    <td className="px-3 py-1.5 text-[#7C879B]">{r.rank}</td>
                    <td className="px-3 py-1.5 font-semibold text-[#5BA8FF]">{r.ticker}</td>
                    <td className="px-3 py-1.5">{(wpp * 100).toFixed(1)}%</td>
                    <td className="px-3 py-1.5">{(r.posterior_prob * 100).toFixed(1)}%</td>
                    <td className="px-3 py-1.5 text-[#9CA7BB]">{r.n_streams}</td>
                    <td className="px-3 py-1.5">{fmtMoney(cap * wpp, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {s?.mode === "deployed" ? (
        <Card title="Live Deployment State" sub={`Deployed ${s.deployed_date} · scale-in ${s.scale_in_pct}% · next rebalance ${s.next_rebalance}. Current = live intraday quote when available (else baked snapshot, labeled).`}>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Capital" value={fmtMoney(s.capital ?? 0, 0)} />
            <Metric label="Scale-in" value={`${s.scale_in_pct}%`} />
            <Metric label="Cash reserve" value={fmtMoney(s.cash_reserve ?? 0, 0)} />
            <Metric label="Next rebalance" value={s.next_rebalance ?? "—"} />
          </div>
          {s.positions?.length ? (
            <div className="overflow-auto rounded-lg border border-[#1E2632]">
              <table className="w-full text-sm">
                <thead><tr>{["Ticker", "Shares", "Entry", "Current", "Gain", "Value"].map((h) => <th key={h} className="bg-[#0F1420] px-3 py-2 text-left text-xs uppercase text-[#7C879B]">{h}</th>)}</tr></thead>
                <tbody>
                  {s.positions.map((p) => {
                    const lq = livePx.get(p.ticker);
                    const cur = lq ?? p.current_price;
                    const isLive = lq != null;
                    const gain = p.entry_price > 0 ? (cur / p.entry_price - 1) * 100 : 0;
                    return (
                      <tr key={p.ticker} className="border-t border-[#161D29]">
                        <td className="px-3 py-1.5 font-semibold text-[#5BA8FF]">{p.ticker}</td>
                        <td className="px-3 py-1.5">{p.shares}</td>
                        <td className="px-3 py-1.5">{fmtMoney(p.entry_price)}</td>
                        <td className="px-3 py-1.5">{fmtMoney(cur)}
                          <span className={`ml-1 text-[10px] ${isLive ? "text-[#00C805]" : "text-[#7C879B]"}`}>{isLive ? "live" : "stale"}</span>
                        </td>
                        <td className="px-3 py-1.5 font-semibold" style={{ color: gain >= 0 ? "#00C805" : "#FF5722" }}>{fmtPct(gain, 1, true)}</td>
                        <td className="px-3 py-1.5">{fmtMoney(p.shares * cur, 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="text-sm text-[#7C879B]">No open positions recorded.</div>}
        </Card>
      ) : (
        <Card title="Live Deployment State"><div className="text-sm text-[#7C879B]">Mode: {s?.mode ?? "pre-deploy"} — no positions deployed yet.</div></Card>
      )}
    </div>
  );
}

// ── (a) Historical backtest ───────────────────────────────────────────────────
function BacktestBlock({ data }: { data: C78q }) {
  const bt = data.metrics?.backtest ?? {};
  const summary = data.backtest?.summary ?? [];
  const regimes = data.backtest?.regime_periods ?? [];
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

  return (
    <div className="space-y-4">
      <Card title="Validated Backtest" sub={`c78q ${data.spec?.version ?? ""} · ${bt.n_months ?? summary.length} months · TOP-${data.spec?.basket_size ?? 8} monthly, equal-weight`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Net CAGR" value={<span className="text-[#00C805]">{bt.net_cagr != null ? fmtPct(bt.net_cagr * 100, 1) : "—"}</span>} />
          <Metric label="Sharpe" value={bt.sharpe != null ? bt.sharpe.toFixed(2) : "—"} />
          <Metric label="Max Drawdown" value={<span className="text-[#FF5722]">{bt.max_drawdown != null ? fmtPct(bt.max_drawdown * 100, 1) : "—"}</span>} />
          <Metric label="Hit Rate" value={bt.hit_rate != null ? fmtPct(bt.hit_rate * 100, 1) : "—"} />
          <Metric label="Turnover" value={bt.turnover != null ? `${(bt.turnover * 100).toFixed(0)}%` : "—"} />
          <Metric label="Months" value={bt.n_months ?? summary.length} />
        </div>
      </Card>

      <Card title="Equity Curve — c78q vs SPY" sub="Growth of $1, log scale. Both curves compound per-period returns; SPY = real buy-and-hold (adjusted close). Shaded = stress/crisis regime months.">
        {curve.length > 1 ? (
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={curve} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid stroke="#1A2130" vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => new Date(t).getFullYear().toString()} tick={{ fill: "#7C879B", fontSize: 11 }} minTickGap={50} />
              <YAxis scale="log" domain={["auto", "auto"]} allowDataOverflow tick={{ fill: "#7C879B", fontSize: 11 }} width={52} tickFormatter={(v) => `$${v >= 10 ? v.toFixed(0) : v.toFixed(1)}`} />
              <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} labelFormatter={(t) => new Date(t).toLocaleDateString()} formatter={(v: number, n) => [`$${v.toFixed(2)} (${((v - 1) * 100).toFixed(0)}%)`, n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {regimes.map((rp, i) => <ReferenceArea key={i} x1={Date.parse(rp.start)} x2={Date.parse(rp.end)} fill={rp.regime === "crisis" ? "#E74C3C" : "#FF9800"} fillOpacity={0.08} ifOverflow="extendDomain" />)}
              <Line type="monotone" dataKey="strat" stroke="#00C805" dot={false} strokeWidth={2} name="c78q" isAnimationActive={false} />
              <Line type="monotone" dataKey="spy" stroke="#7C879B" dot={false} strokeWidth={1.6} strokeDasharray="4 2" name="SPY" connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <Unavailable what="Backtest equity curve" detail="No backtest summary rows in c78q.json — the ETL output may be degenerate or missing." />}
        {summary.length > 0 && (
          <div className="mt-2 text-[11px] text-[#7C879B]">
            Final per $1 over {summary.length} months ({summary[0].date} → {summary[summary.length - 1].date}): c78q <span className="font-semibold text-[#00C805]">${stratEnd != null ? stratEnd.toFixed(0) : "—"}</span>
            {" vs SPY "}<span className="font-semibold text-[#C3CAD7]">{spyLive ? `$${spyEnd!.toFixed(1)}` : "unavailable in preview"}</span>
            {spyLive ? " (real buy-and-hold)." : " — SPY benchmark needs the keyless /api/spy-monthly feed (deployed app)."}
            <span className="block text-[#5C6678]">Note: the c78q dataset's bundled SPY field is an upstream relative series (compounds to ~$48 / ~32% CAGR), so the chart uses actual SPY for an honest benchmark.</span>
          </div>
        )}
      </Card>
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
        <div className="overflow-auto rounded-lg border border-[#1E2632]">
          <table className="w-full text-sm">
            <thead><tr>{["Metric", "Backtest", "Live"].map((h) => <th key={h} className="bg-[#0F1420] px-3 py-2 text-left text-xs uppercase text-[#7C879B]">{h}</th>)}</tr></thead>
            <tbody>
              {([["Net CAGR", bt.net_cagr != null ? fmtPct(bt.net_cagr * 100, 1) : "—", live?.available ? fmtPct((live.net_cagr ?? 0) * 100, 1) : "—"],
                 ["Sharpe", bt.sharpe?.toFixed?.(2) ?? "—", live?.available ? live.sharpe?.toFixed?.(2) ?? "—" : "—"],
                 ["Hit rate", bt.hit_rate != null ? fmtPct(bt.hit_rate * 100, 1) : "—", live?.available ? fmtPct((live.hit_rate ?? 0) * 100, 1) : "—"],
                 ["Months", String(bt.n_months ?? "—"), String(live?.n_months ?? 0)]] as const).map((r) => (
                <tr key={r[0]} className="border-t border-[#161D29]"><td className="px-3 py-1.5 text-[#C3CAD7]">{r[0]}</td><td className="px-3 py-1.5">{r[1]}</td><td className="px-3 py-1.5 text-[#9CA7BB]">{r[2]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {!live?.available && <div className="mt-2 text-[11px] text-[#7C879B]">Live track record: {live?.n_months ?? 0} months traded — needs ≥3 for realized metrics.</div>}
      </Card>

      <Card title="Per-stream attribution">
        {data.attribution && data.attribution.length ? (
          <div className="text-sm text-[#9CA7BB]">{data.attribution.length} attribution rows available in the ETL output.</div>
        ) : <div className="text-sm text-[#7C879B]">No per-stream attribution in the current ETL output (populated by a separate stream-walk script).</div>}
      </Card>
    </div>
  );
}
