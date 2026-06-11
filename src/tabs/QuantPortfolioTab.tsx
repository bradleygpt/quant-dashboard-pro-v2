import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Card, Metric, RatingBadge, Pill } from "../components/ui";
import { SortableTable, RATING_RANK, type Column } from "../components/SortableTable";
import { fmtMoney, fmtPct, fmtCapB } from "../lib/format";
import {
  buildOptimalPortfolio, buildTop25, computeRebalanceDeltas, computeDiversificationStats,
  compareToSpyOverlap, computeIdealAllocation, type Aggressiveness, type QpPosition,
  type CurrentHolding, type RebalAction,
} from "../lib/portfolio";
import { computeBreadth } from "../lib/regime";
import { computePullback } from "../lib/pullback";
import { useLiveData } from "../lib/live";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from "recharts";

const BASE = `${import.meta.env.BASE_URL}data`;

type Level = Aggressiveness | "Validated TOP-25";
const LEVELS: Level[] = ["Validated TOP-25", "Conservative", "Balanced", "Aggressive"];
const POS_BY_LEVEL: Record<Level, number> = { "Validated TOP-25": 25, Conservative: 30, Balanced: 20, Aggressive: 12 };
const DONUT = ["#3B82F6", "#00C805", "#F7931A", "#9B59B6", "#FF9800", "#5DADE2", "#E74C3C", "#FFC107", "#1ABC9C", "#E91E63", "#8BC34A"];

interface QBT { ok?: boolean; source_file?: string; n_checkpoints?: number; n_populated?: number; populated_range?: [string, string] | null; date_range?: [string, string] | null; span_years?: number; spy_source?: "buyhold_yahoo_v8" | "overlapping_fallback"; spy_asof?: string | null; strategy_label?: string; headline?: { quant_total_pct?: number; spy_total_pct?: number; quant_cagr_pct?: number; spy_cagr_pct?: number; win_rate_pct?: number; n_periods?: number }; curve?: { date: string; quant: number; spy: number | null }[] }

// Static validated 3-period × preset CAGR table (app.py, 121 quarterly rebalances 1996-2026)
const CAGR_TABLE = {
  periods: ["1996–present (30y)", "2010–present (15y)", "2020–present (5y)"],
  rows: [
    { label: "Momentum (m_heavy)", vals: ["+30.12%", "+30.01%", "+37.19%"], color: "#00C805" },
    { label: "Value (v_heavy)", vals: ["+28.18%", "+31.67%", "+34.78%"], color: "#5DADE2" },
    { label: "Equal Weighted (equal)", vals: ["+26.22%", "+27.30%", "+29.87%"], color: "#C3CAD7" },
    { label: "SPY benchmark", vals: ["~+10.0%", "~+14.1%", "~+14.8%"], color: "#7C879B" },
  ],
};

export default function QuantPortfolioTab() {
  const { rows, byTicker, preset, meta, goToDetail } = useStore();
  const mkt = useLiveData<any>("/api/market");
  const [bt, setBt] = useState<QBT | null>(null);
  useEffect(() => { fetch(`${BASE}/quant_backtest.json`).then((r) => r.ok ? r.json() : null).then(setBt).catch(() => {}); }, []);

  const [level, setLevel] = useState<Level>("Validated TOP-25");
  const [mode, setMode] = useState<"fresh" | "rebalance">("fresh");
  const [capital, setCapital] = useState(100000);
  const [applyPhased, setApplyPhased] = useState(false);
  const [holdingsText, setHoldingsText] = useState("");

  const weightScheme = preset === "Custom" ? "equal" : preset;
  const presetInfo = preset !== "Custom" ? meta.presets[preset] : null;

  // ── Ideal allocation from live pullback pressure ──
  const breadth = useMemo(() => (rows.length ? computeBreadth(rows) : null), [rows]);
  const pullback = useMemo(
    () => (breadth && mkt.status === "ok" ? computePullback(mkt.data?.spy ?? null, mkt.data?.vix?.current ?? null, breadth.pct_above_50sma) : null),
    [breadth, mkt],
  );
  const ideal = pullback ? computeIdealAllocation(pullback.score) : null;
  const deployPct = pullback?.deploy_pct ?? 100;

  // ── Parse current holdings (rebalance mode) ──
  const holdings: CurrentHolding[] = useMemo(() => {
    if (mode !== "rebalance") return [];
    const out: CurrentHolding[] = [];
    for (const line of holdingsText.split(/\n+/)) {
      const m = line.trim().split(/[\s,]+/);
      if (m.length < 2) continue;
      const t = m[0].toUpperCase(), shares = parseFloat(m[1]);
      if (!t || !isFinite(shares) || shares <= 0) continue;
      const r = byTicker.get(t);
      if (r && r.price != null && r.price > 0) out.push({ ticker: t, shares, current_price: r.price });
    }
    return out;
  }, [mode, holdingsText, byTicker]);
  const currentTotal = holdings.reduce((a, h) => a + h.shares * h.current_price, 0);

  // ── Effective capital (phased + rebalance) ──
  const newCash = capital;
  const totalCapital = mode === "rebalance" ? currentTotal + newCash : capital;
  const effectiveCapital = applyPhased && deployPct < 100
    ? (mode === "rebalance" ? currentTotal + newCash * (deployPct / 100) : capital * (deployPct / 100))
    : totalCapital;

  const port = useMemo(
    () => level === "Validated TOP-25" ? buildTop25(rows, effectiveCapital) : buildOptimalPortfolio(rows, effectiveCapital, level, weightScheme),
    [rows, effectiveCapital, level, weightScheme],
  );

  const stats = useMemo(() => computeDiversificationStats(port), [port]);
  const overlap = useMemo(() => compareToSpyOverlap(port), [port]);
  const actions = useMemo<RebalAction[]>(
    () => (mode === "rebalance" && holdings.length ? computeRebalanceDeltas(port, holdings, byTicker, totalCapital) : []),
    [mode, holdings, port, byTicker, totalCapital],
  );

  const deployed = port.reduce((a, p) => a + p.dollars, 0);

  const columns = useMemo<Column<QpPosition>[]>(() => [
    { key: "ticker", header: "Ticker", sortValue: (p) => p.ticker, render: (p) => <button onClick={() => goToDetail(p.ticker)} className="font-semibold text-[#5BA8FF] hover:underline">{p.ticker}</button> },
    { key: "sector", header: "Sector", sortValue: (p) => p.sector ?? "", render: (p) => <span className="text-[#9CA7BB]">{p.sector}</span> },
    { key: "rating", header: "Rating", sortValue: (p) => RATING_RANK[p.rating] ?? 0, render: (p) => <RatingBadge rating={p.rating} /> },
    { key: "score", header: "Score", align: "right", sortValue: (p) => p.composite_score, render: (p) => <span className="font-semibold">{p.composite_score.toFixed(2)}</span> },
    { key: "weight", header: "Weight", align: "right", sortValue: (p) => p.weight_pct, render: (p) => fmtPct(p.weight_pct) },
    { key: "dollars", header: "Dollars", align: "right", sortValue: (p) => p.dollars, render: (p) => fmtMoney(p.dollars, 0) },
    { key: "shares", header: "Shares", align: "right", sortValue: (p) => p.shares, render: (p) => p.shares },
    { key: "price", header: "Price", align: "right", sortValue: (p) => p.price, render: (p) => fmtMoney(p.price) },
    { key: "cap", header: "Mkt Cap", align: "right", sortValue: (p) => p.market_cap_b, render: (p) => <span className="text-[#9CA7BB]">{fmtCapB(p.market_cap_b)}</span> },
  ], [goToDetail]);

  const curve = useMemo(() => (bt?.curve ?? []).map((c) => ({ t: Date.parse(c.date), quant: c.quant, spy: c.spy })), [bt]);
  const h = bt?.headline;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white">Quant Portfolio Builder</h2>
      <p className="text-xs text-[#7C879B]">
        Two distinct things: (1) the <strong className="text-[#C3CAD7]">validated strategy backtest</strong> — the historical record of the
        ranking system; and (2) <strong className="text-[#C3CAD7]">your allocation</strong> — a score-weighted portfolio from the current universe.
        They are separate; the backtest CAGR is the strategy's, not this allocation's.
      </p>

      {/* ── Validated CAGR table (30y/15y/5y × presets) ── */}
      <Card title="Validated Backtest CAGR by Period & Preset" sub="121 quarterly rebalances (1996-Q1 → 2026-Q1), point-in-time SEC EDGAR fundamentals. TOP-25, quarterly rebalance. Gross of costs/taxes.">
        <div className="overflow-auto rounded-lg border border-[#1E2632]">
          <table className="w-full text-sm">
            <thead><tr>{["Preset", ...CAGR_TABLE.periods].map((hh) => <th key={hh} className="bg-[#0F1420] px-3 py-2 text-left text-xs uppercase text-[#7C879B]">{hh}</th>)}</tr></thead>
            <tbody>
              {CAGR_TABLE.rows.map((r) => (
                <tr key={r.label} className="border-t border-[#161D29]">
                  <td className="px-3 py-1.5 font-medium" style={{ color: r.color }}>{r.label}</td>
                  {r.vals.map((v, i) => <td key={i} className="px-3 py-1.5 font-semibold" style={{ color: r.label.includes("SPY") ? "#7C879B" : "#00C805" }}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] leading-relaxed text-[#7C879B]">
          Momentum (m_heavy) shows no decay across regimes (2020-present +37.19% strongest). Value (v_heavy) edges Momentum on 15y by Sharpe but trails on recent CAGR.
          Equal-weighted is the conservative floor — never the top, always profitable. Alpha vs SPY ranges +12% (30y) to +22% (5y). ⚠️ Past performance ≠ future results; realized after-cost alpha is typically 2–4% below backtest CAGR.
        </div>
      </Card>

      {/* ── Realistic swing equity curve vs REAL buy-&-hold SPY (distinct from the TOP-25 table) ── */}
      {bt && curve.length > 1 && (() => {
        const buyhold = bt.spy_source === "buyhold_yahoo_v8";
        const alphaCagr = h?.quant_cagr_pct != null && h?.spy_cagr_pct != null ? h.quant_cagr_pct - h.spy_cagr_pct : null;
        return (
        <Card title="📉 Realistic Swing Backtest: Strategy vs Buy-&-Hold SPY"
          sub={`Cumulative growth of $100. ${bt.strategy_label ?? "Realistic swing strategy"}, monthly checkpoints${bt.populated_range ? ` ${bt.populated_range[0].slice(0, 7)} → ${bt.populated_range[1].slice(0, 7)}` : ""}. This is a stricter, after-cost record — NOT the validated TOP-25 quarterly strategy in the table above.`}>
          <div className="mb-2 rounded-md border border-[#3A2A12] bg-[#1C1407] px-3 py-2 text-[11px] leading-relaxed text-[#D8B878]">
            ⚠️ Different strategy from the table above. This is the <strong>realistic top-10 swing</strong> floor (≈63-day holds, after costs) — it intentionally trails buy-&-hold SPY here. The validated <strong>TOP-25 quarterly</strong> record (CAGR table above) is the headline strategy; its full 1996–2026 equity series is regenerated upstream and will replace this curve once bundled.
          </div>
          {h && (
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Realistic Strategy" value={<span className="text-[#00C805]">{h.quant_total_pct != null ? `${h.quant_total_pct >= 0 ? "+" : ""}${h.quant_total_pct.toFixed(0)}%` : "—"}</span>} hint={h.quant_total_pct != null ? `$100 → $${(100 + h.quant_total_pct).toFixed(0)}${h.quant_cagr_pct != null ? ` · ${h.quant_cagr_pct.toFixed(1)}% CAGR` : ""}` : undefined} />
              <Metric label="SPY (buy & hold)" value={h.spy_total_pct != null ? `${h.spy_total_pct >= 0 ? "+" : ""}${h.spy_total_pct.toFixed(0)}%` : "—"} hint={h.spy_total_pct != null ? `$100 → $${(100 + h.spy_total_pct).toFixed(0)}${h.spy_cagr_pct != null ? ` · ${h.spy_cagr_pct.toFixed(1)}% CAGR` : ""}` : undefined} />
              <Metric label="Alpha (CAGR)" value={alphaCagr != null ? <span className={alphaCagr >= 0 ? "text-[#00C805]" : "text-[#FF5722]"}>{alphaCagr >= 0 ? "+" : ""}{alphaCagr.toFixed(1)}%</span> : "—"} hint="vs buy & hold" />
              <Metric label="Win Rate" value={h.win_rate_pct != null ? `${h.win_rate_pct.toFixed(1)}%` : "—"} hint={h.n_periods != null ? `${h.n_periods} periods` : undefined} />
            </div>
          )}
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={curve} margin={{ top: 5, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid stroke="#1A2130" vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => new Date(t).getFullYear().toString()} tick={{ fill: "#7C879B", fontSize: 11 }} minTickGap={50} />
              <YAxis tick={{ fill: "#7C879B", fontSize: 11 }} width={48} tickFormatter={(v) => `$${v.toFixed(0)}`} />
              <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} labelFormatter={(t) => new Date(t).toLocaleDateString()} formatter={(v: number, n) => [`$${v.toFixed(0)}`, n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="quant" stroke="#00C805" dot={false} strokeWidth={2} name="Realistic Strategy" />
              <Line type="monotone" dataKey="spy" stroke="#7C879B" dot={false} strokeWidth={1.6} strokeDasharray="4 2" name="SPY (buy & hold)" connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 text-[11px] leading-relaxed text-[#7C879B]">
            Source: <code className="text-[#9CA7BB]">{bt.source_file}</code> · {bt.n_checkpoints} checkpoints
            {bt.populated_range ? `, returns populated ${bt.populated_range[0]} → ${bt.populated_range[1]} (${bt.n_populated} populated)` : ""}.
            SPY line = {buyhold ? <>true <strong className="text-[#9CA7BB]">buy-&-hold</strong> from the app's Yahoo v8 feed{bt.spy_asof ? `, as-of ${bt.spy_asof}` : ""}</> : <span className="text-[#FF9800]">approximate (overlapping per-checkpoint returns — live buy-&-hold fetch unavailable at bake time)</span>}.
            Survivorship bias, sparse pre-2009 data, and modeled costs apply.
          </div>
        </Card>
        );
      })()}

      {/* ── Validated strategy summary (preset metrics) ── */}
      {presetInfo && (
        <Card title="Validated Strategy Backtest" sub={`TOP-25 quarterly rebalance · ${presetInfo.backtest_universe}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="CAGR" value={<span className="text-[#00C805]">{fmtPct(presetInfo.backtest_cagr)}</span>} />
            <Metric label="Sharpe" value={presetInfo.backtest_sharpe.toFixed(2)} />
            <Metric label="Max Drawdown" value={<span className="text-[#FF5722]">{fmtPct(presetInfo.backtest_max_dd)}</span>} />
            <Metric label="Portfolio size" value="25" hint="validated construction" />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#7C879B]">
            These describe the validated <strong>TOP-25</strong> equal-rebalance strategy under the <strong>{weightScheme}</strong> preset, 1996–2026, 121 quarterly rebalances. NOT a backtest of the specific allocation built below.
          </p>
        </Card>
      )}

      {/* ── Ideal allocation (pullback-driven) ── */}
      <Card title="🎯 Ideal Portfolio Allocation" sub="Cash/stock split suggested by live pullback pressure (SPY momentum, VIX, breadth).">
        {ideal ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Target Stock %" value={`${ideal.target_stock_pct}%`} />
              <Metric label="Target Cash %" value={`${ideal.target_cash_pct}%`} />
              <Metric label="Regime" value={ideal.regime_label} hint={`pullback ${pullback!.score.toFixed(0)}/100`} />
            </div>
            <p className="mt-2 text-xs text-[#9CA7BB]">{ideal.rationale}</p>
            {ideal.warnings.length > 0 && (
              <details className="mt-2 text-xs"><summary className="cursor-pointer text-[#7C879B]">⚠️ Important caveats</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[#9CA7BB]">{ideal.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>
            )}
          </>
        ) : <div className="text-sm text-[#7C879B]">Needs live SPY/VIX from /api/market (deployed app only). Defaulting to full deployment.</div>}
      </Card>

      {/* ── Build Your Allocation ── */}
      <Card title="Build Your Allocation" sub="Score-weighted construction with per-aggressiveness sector caps, position ceilings, and score floors.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            <Pill active={mode === "fresh"} onClick={() => setMode("fresh")}>Fresh Portfolio</Pill>
            <Pill active={mode === "rebalance"} onClick={() => setMode("rebalance")}>Rebalance from Existing</Pill>
          </div>
          <label className="text-xs text-[#9CA7BB]">{mode === "rebalance" ? "New cash to add ($)" : "Capital ($)"}
            <input type="number" value={capital} onChange={(e) => setCapital(Math.max(0, parseFloat(e.target.value) || 0))}
              className="mt-1 block w-36 rounded-md border border-[#1E2632] bg-[#121723] px-2 py-1.5 text-sm text-white" />
          </label>
          <div className="flex flex-wrap gap-1">
            {LEVELS.map((l) => (
              <button key={l} onClick={() => setLevel(l)}
                className={`rounded-md px-3 py-1.5 text-xs ${level === l ? "bg-[#3B82F6] font-semibold text-white" : "bg-[#1A2130] text-[#9CA7BB] hover:bg-[#222B3C]"}`}>{l} ({POS_BY_LEVEL[l]})</button>
            ))}
          </div>
        </div>

        {deployPct < 100 && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[#9CA7BB]">
            <input type="checkbox" checked={applyPhased} onChange={(e) => setApplyPhased(e.target.checked)} className="accent-[#F7931A]" />
            🌡️ Apply suggested phased deployment ({deployPct}% now, hold {100 - deployPct}% for a pullback)
          </label>
        )}
        {deployPct >= 100 && pullback && <div className="mt-2 text-xs text-[#7C879B]">✓ Pullback pressure suggests full deployment — no phased adjustment needed.</div>}

        {mode === "rebalance" && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-[#9CA7BB]">Your current holdings — one per line: <code className="text-[#7C879B]">TICKER shares</code> (or <code className="text-[#7C879B]">TICKER,shares</code>)</label>
              <button onClick={() => { try { const hs = JSON.parse(localStorage.getItem("qd_holdings") || "[]"); setHoldingsText(hs.map((x: any) => `${x.ticker} ${x.shares}`).join("\n")); } catch { /* ignore */ } }}
                className="rounded bg-[#1A2130] px-2 py-1 text-[11px] text-[#9CA7BB] hover:bg-[#222B3C]">Load my saved holdings</button>
            </div>
            <textarea value={holdingsText} onChange={(e) => setHoldingsText(e.target.value)} rows={4} placeholder={"AAPL 50\nNVDA 20\nMSFT, 15"}
              className="block w-full rounded-md border border-[#1E2632] bg-[#0F1420] px-2 py-1.5 font-mono text-xs text-white" />
            {holdings.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-3">
                <Metric label="Current stock value" value={fmtMoney(currentTotal, 0)} />
                <Metric label="New cash" value={fmtMoney(newCash, 0)} />
                <Metric label="Total to deploy" value={fmtMoney(totalCapital, 0)} />
              </div>
            )}
            {holdingsText.trim() && holdings.length === 0 && <div className="mt-2 text-xs text-[#FF9800]">No rows matched the scored universe — check tickers (cash/MM tickers aren't supported here).</div>}
          </div>
        )}
        <p className="mt-2 text-[11px] text-[#7C879B]">Validated TOP-25 = the equal-weight construction the backtest describes. Conservative 30 · Balanced 20 · Aggressive 12 are score-weighted with sector caps. Weighting = {weightScheme}.</p>
      </Card>

      {/* ── Summary metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Positions" value={port.length} hint={`max ${POS_BY_LEVEL[level]} (${level})`} />
        <Metric label="Deployed" value={fmtMoney(deployed, 0)} hint={`of ${fmtMoney(effectiveCapital, 0)}`} />
        <Metric label="Avg Score" value={stats ? stats.avg_score.toFixed(2) : "—"} />
        <Metric label="Sectors" value={stats?.num_sectors ?? 0} />
      </div>

      {port.length === 0 ? (
        <div className="text-sm text-[#7C879B]">No positions pass the filters at this level / universe.</div>
      ) : (
        <>
          <Card title={`Your allocation — ${level} (${port.length} positions, ${weightScheme} weighting)`}>
            <SortableTable columns={columns} rows={port} rowKey={(p) => p.ticker} initialSortKey="weight" initialSortDir="desc" maxHeight="64vh" />
          </Card>

          {/* ── Sector donut + SPY overlap ── */}
          {stats && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card title="Sector Allocation" className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={stats.sector_breakdown} dataKey="weight" nameKey="sector" innerRadius={60} outerRadius={110} paddingAngle={1}
                      label={(e: any) => `${e.sector} ${e.weight.toFixed(0)}%`} labelLine={false}>
                      {stats.sector_breakdown.map((_, i) => <Cell key={i} fill={DONUT[i % DONUT.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} formatter={(v: number, n) => [`${v.toFixed(1)}%`, n]} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
              <Card title="vs SPY Top 30">
                <div className="space-y-3">
                  <Metric label="Overlap with SPY" value={`${overlap.overlap_count} stocks`} />
                  <Metric label="Weight in SPY top names" value={`${overlap.overlap_pct.toFixed(0)}%`} />
                  <div className="text-xs text-[#9CA7BB]"><strong className="text-[#C3CAD7]">{stats.num_positions - overlap.overlap_count} differentiated picks</strong> vs index.</div>
                  {overlap.overlap_tickers.length > 0 && <div className="text-xs text-[#7C879B]">Shared: {overlap.overlap_tickers.join(", ")}</div>}
                </div>
              </Card>
            </div>
          )}

          {/* ── Rebalance action items ── */}
          {mode === "rebalance" && holdings.length > 0 && <RebalanceActions actions={actions} />}
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
function RebalanceActions({ actions }: { actions: RebalAction[] }) {
  if (!actions.length) return <Card title="🎯 Action Items"><div className="text-sm text-[#00C805]">Portfolio matches optimal — no actions needed.</div></Card>;
  const inits = actions.filter((a) => a.action === "INITIATE");
  const adds = actions.filter((a) => a.action === "ADD");
  const trims = actions.filter((a) => a.action === "TRIM");
  const exits = actions.filter((a) => a.action === "EXIT");
  const holds = actions.filter((a) => a.action === "HOLD");
  const buyTotal = [...inits, ...adds].reduce((a, x) => a + x.delta_dollars, 0);
  const sellTotal = [...trims, ...exits].reduce((a, x) => a + -x.delta_dollars, 0);

  const Section = ({ title, items, cols }: { title: string; items: RebalAction[]; cols: ("pct" | "tgt" | "delta" | "score" | "reason")[] }) => items.length === 0 ? null : (
    <div className="mt-3">
      <div className="mb-1 text-xs font-semibold uppercase text-[#7C879B]">{title}</div>
      <div className="overflow-auto rounded-lg border border-[#1E2632]">
        <table className="w-full text-sm">
          <thead><tr>
            <th className="bg-[#0F1420] px-3 py-1.5 text-left text-xs uppercase text-[#7C879B]">Ticker</th>
            {cols.includes("score") && <th className="bg-[#0F1420] px-3 py-1.5 text-left text-xs uppercase text-[#7C879B]">Rating / Score</th>}
            {cols.includes("pct") && <th className="bg-[#0F1420] px-3 py-1.5 text-right text-xs uppercase text-[#7C879B]">Current %</th>}
            {cols.includes("tgt") && <th className="bg-[#0F1420] px-3 py-1.5 text-right text-xs uppercase text-[#7C879B]">Target %</th>}
            {cols.includes("delta") && <th className="bg-[#0F1420] px-3 py-1.5 text-right text-xs uppercase text-[#7C879B]">$ Δ</th>}
            {cols.includes("reason") && <th className="bg-[#0F1420] px-3 py-1.5 text-left text-xs uppercase text-[#7C879B]">Why</th>}
          </tr></thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.ticker} className="border-t border-[#161D29]">
                <td className="px-3 py-1.5 font-semibold text-[#C3CAD7]">{a.ticker}</td>
                {cols.includes("score") && <td className="px-3 py-1.5 text-[#9CA7BB]">{a.rating ?? "—"}{a.score != null ? ` (${a.score.toFixed(1)})` : ""}</td>}
                {cols.includes("pct") && <td className="px-3 py-1.5 text-right">{a.current_pct.toFixed(1)}%</td>}
                {cols.includes("tgt") && <td className="px-3 py-1.5 text-right">{a.target_pct.toFixed(1)}%</td>}
                {cols.includes("delta") && <td className="px-3 py-1.5 text-right font-semibold" style={{ color: a.delta_dollars >= 0 ? "#00C805" : "#FF5722" }}>{a.delta_dollars >= 0 ? "+" : "-"}${Math.abs(a.delta_dollars).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>}
                {cols.includes("reason") && <td className="px-3 py-1.5 text-[#9CA7BB]">{a.reason}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <Card title="🎯 Action Items">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="New positions" value={inits.length} />
        <Metric label="To buy" value={fmtMoney(buyTotal, 0)} />
        <Metric label="To sell" value={fmtMoney(sellTotal, 0)} />
        <Metric label="Net cash" value={fmtMoney(buyTotal - sellTotal, 0)} />
      </div>
      <Section title="🆕 INITIATE — New positions to open" items={inits} cols={["score", "tgt", "delta", "reason"]} />
      <Section title="➕ ADD — Increase existing positions" items={adds} cols={["pct", "tgt", "delta", "reason"]} />
      <Section title="✂️ TRIM — Reduce existing positions" items={trims} cols={["pct", "tgt", "delta", "reason"]} />
      <Section title="🚪 EXIT — Close positions" items={exits} cols={["score", "delta", "reason"]} />
      {holds.length > 0 && (
        <details className="mt-3 text-xs"><summary className="cursor-pointer text-[#7C879B]">✓ HOLD — {holds.length} positions in target range (no action)</summary>
          <Section title="" items={holds} cols={["pct", "tgt", "reason"]} /></details>
      )}
    </Card>
  );
}
