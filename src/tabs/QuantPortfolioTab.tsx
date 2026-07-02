import { tooltipProps } from "../components/ChartFrame";
import { ASSET, ENTITY, INK, PAPER, SEM, SURFACE, alpha } from "../theme";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import type { PresetName } from "../lib/types";
import { Card, Metric, RatingBadge, Pill, Unavailable } from "../components/ui";
import { SortableTable, RATING_RANK, type Column } from "../components/SortableTable";
import IndexBadges from "../components/IndexBadges";
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
const DONUT = [SEM.link, SEM.pos, ASSET.btc, ENTITY.auxo, SEM.warnHot, SEM.link, SEM.neg, SEM.warn, ENTITY.prosodos, ENTITY.pronoia, SEM.posSoft];

interface QBT { ok?: boolean; source_file?: string; n_checkpoints?: number; n_populated?: number; populated_range?: [string, string] | null; date_range?: [string, string] | null; span_years?: number; spy_source?: "buyhold_yahoo_v8" | "overlapping_fallback"; spy_asof?: string | null; strategy_label?: string; caveat?: string | null; source_meta?: string | null; coverage?: { first_date?: string; last_date?: string; min_n?: number; max_n?: number } | null; headline?: { quant_total_pct?: number; spy_total_pct?: number; quant_cagr_pct?: number; spy_cagr_pct?: number; win_rate_pct?: number; n_periods?: number }; curve?: { date: string; quant: number; spy: number | null }[] }

// Preset order + colors for the data-driven CAGR panel. The old static CAGR_TABLE
// (3-period × preset literals) is GONE (audit §1.4): per-preset full-period CAGRs now
// come from meta.presets (baked), and the period splits are recomputed client-side
// from the shipped quant_backtest.json curve — every displayed number traces to data.
// The old 15y/5y PER-PRESET cells had no baked source and are not displayed anymore.
const PRESET_ROWS: { key: string; color: string }[] = [
  { key: "m_heavy", color: SEM.pos },
  { key: "v_heavy", color: SEM.link },
  { key: "equal", color: INK.ink2 },
];

export default function QuantPortfolioTab() {
  const { rows, byTicker, preset, meta, goToDetail } = useStore();
  const mkt = useLiveData<any>("/api/market");
  const [bt, setBt] = useState<QBT | null>(null);
  const [btErr, setBtErr] = useState(false);
  useEffect(() => {
    fetch(`${BASE}/quant_backtest.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setBt)
      .catch(() => setBtErr(true));   // visible error state below — never a silent gap (audit §4)
  }, []);

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
    { key: "ticker", header: "Ticker", sortValue: (p) => p.ticker, render: (p) => <><button onClick={() => goToDetail(p.ticker)} className="font-semibold text-link hover:underline">{p.ticker}</button><IndexBadges ticker={p.ticker} /></> },
    { key: "sector", header: "Sector", sortValue: (p) => p.sector ?? "", render: (p) => <span className="text-ink-3">{p.sector}</span> },
    { key: "rating", header: "Rating", sortValue: (p) => RATING_RANK[p.rating] ?? 0, render: (p) => <RatingBadge rating={p.rating} /> },
    { key: "score", header: "Score", align: "right", sortValue: (p) => p.composite_score, render: (p) => <span className="font-semibold">{p.composite_score.toFixed(2)}</span> },
    { key: "weight", header: "Weight", align: "right", sortValue: (p) => p.weight_pct, render: (p) => fmtPct(p.weight_pct) },
    { key: "dollars", header: "Dollars", align: "right", sortValue: (p) => p.dollars, render: (p) => fmtMoney(p.dollars, 0) },
    { key: "shares", header: "Shares", align: "right", sortValue: (p) => p.shares, render: (p) => p.shares },
    { key: "price", header: "Price", align: "right", sortValue: (p) => p.price, render: (p) => fmtMoney(p.price) },
    { key: "cap", header: "Mkt Cap", align: "right", sortValue: (p) => p.market_cap_b, render: (p) => <span className="text-ink-3">{fmtCapB(p.market_cap_b)}</span> },
  ], [goToDetail]);

  const curve = useMemo(() => (bt?.curve ?? []).map((c) => ({ t: Date.parse(c.date), quant: c.quant, spy: c.spy })), [bt]);
  const h = bt?.headline;
  // The robust dataset = 2011+ (pre-2011 is survivorship-biased; shown separately). Rebase to $100 at 2011.
  const robust = useMemo(() => {
    const start = Date.parse("2011-01-01");
    const seg = curve.filter((c) => c.t >= start && c.quant != null);
    if (seg.length < 2) return null;
    const q0 = seg[0].quant; const s0 = seg.find((c) => c.spy != null)?.spy ?? null;
    const reb = seg.map((c) => ({ t: c.t, quant: (c.quant / q0) * 100, spy: c.spy != null && s0 ? (c.spy / s0) * 100 : null }));
    const last = reb[reb.length - 1]; const yrs = (last.t - reb[0].t) / (365.25 * 864e5);
    const lastSpy = (() => { for (let i = reb.length - 1; i >= 0; i--) if (reb[i].spy != null) return reb[i].spy!; return null; })();
    const qCagr = (Math.pow(last.quant / 100, 1 / yrs) - 1) * 100;
    const sCagr = lastSpy != null ? (Math.pow(lastSpy / 100, 1 / yrs) - 1) * 100 : null;
    return { curve: reb, startYear: new Date(reb[0].t).getFullYear(), qTotal: last.quant - 100, qCagr, sTotal: lastSpy != null ? lastSpy - 100 : null, sCagr, alpha: sCagr != null ? qCagr - sCagr : null };
  }, [curve]);

  // Period CAGRs recomputed from the shipped backtest curve (TOP-25 + SPY) — replaces
  // the untraceable per-preset 15y/5y literals of the old CAGR_TABLE.
  const periodCagrs = useMemo(() => {
    if (curve.length < 2) return null;
    const winCagr = (fromIso: string | null) => {
      const from = fromIso ? Date.parse(fromIso) : -Infinity;
      const seg = curve.filter((c) => c.t >= from && c.quant != null);
      if (seg.length < 2) return null;
      const yrs = (seg[seg.length - 1].t - seg[0].t) / (365.25 * 864e5);
      if (yrs <= 0.5) return null;
      const q = (Math.pow(seg[seg.length - 1].quant / seg[0].quant, 1 / yrs) - 1) * 100;
      const s0 = seg.find((c) => c.spy != null)?.spy ?? null;
      const sN = (() => { for (let i = seg.length - 1; i >= 0; i--) if (seg[i].spy != null) return seg[i].spy!; return null; })();
      const s = s0 != null && sN != null ? (Math.pow(sN / s0, 1 / yrs) - 1) * 100 : null;
      return { q, s };
    };
    return [
      { label: "1996–present", biased: true, ...(winCagr(null) ?? {}) },
      { label: "2011–present (robust)", biased: false, ...(winCagr("2011-01-01") ?? {}) },
      { label: "2020–present", biased: false, ...(winCagr("2020-01-01") ?? {}) },
    ].filter((r): r is { label: string; biased: boolean; q: number; s: number | null } => (r as any).q != null);
  }, [curve]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white">Quant Portfolio Builder</h2>
      <p className="text-xs text-mute">
        Two distinct things: (1) the <strong className="text-ink-2">validated strategy backtest</strong> — the historical record of the
        ranking system; and (2) <strong className="text-ink-2">your allocation</strong> — a score-weighted portfolio from the current universe.
        They are separate; the backtest CAGR is the strategy's, not this allocation's.
      </p>

      {/* ── Validated CAGR panel — every number traces to baked data (audit §1.4) ── */}
      <Card title="Validated Backtest CAGR" asOfSource="quant_backtest" sub="Quarterly rebalance, point-in-time SEC EDGAR fundamentals, TOP-25, gross of costs/taxes. Per-preset figures from the baked meta presets; period splits recomputed from the shipped backtest curve.">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead><tr>{["Preset", "Validated CAGR (1996–2026)", "Sharpe", "Max DD"].map((hh) => <th key={hh} className="bg-head px-3 py-2 text-left text-xs uppercase text-mute">{hh}</th>)}</tr></thead>
              <tbody>
                {PRESET_ROWS.filter((p) => meta.presets[p.key as PresetName]).map((p) => {
                  const pi = meta.presets[p.key as PresetName];
                  return (
                    <tr key={p.key} className="border-t border-line-faint">
                      <td className="px-3 py-1.5 font-medium" style={{ color: p.color }}>{pi.label}</td>
                      <td className="px-3 py-1.5 font-semibold text-pos">{fmtPct(pi.backtest_cagr)}</td>
                      <td className="px-3 py-1.5">{pi.backtest_sharpe.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-neg">{fmtPct(pi.backtest_max_dd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead><tr>{["TOP-25 window", "Strategy CAGR", "SPY CAGR"].map((hh) => <th key={hh} className="bg-head px-3 py-2 text-left text-xs uppercase text-mute">{hh}</th>)}</tr></thead>
              <tbody>
                {(periodCagrs ?? []).map((r) => (
                  <tr key={r.label} className="border-t border-line-faint">
                    <td className="px-3 py-1.5 font-medium" style={{ color: r.biased ? alpha(PAPER, 0.85) : INK.ink2 }}>{r.biased ? "⚠ " : ""}{r.label}{r.biased ? " · biased" : ""}</td>
                    <td className="px-3 py-1.5 font-semibold" style={{ color: r.biased ? INK.dim : SEM.pos }}>+{r.q.toFixed(1)}%</td>
                    <td className="px-3 py-1.5 text-mute">{r.s != null ? `+${r.s.toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
                {!periodCagrs?.length && <tr><td className="px-3 py-2 text-xs text-mute" colSpan={3}>Backtest curve unavailable — period splits not shown.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-2 text-[11px] leading-relaxed text-mute">
          <strong className="text-ink-2">Read the 2011+ / 2020+ rows</strong> — the robust, survivorship-clean window. The dimmed <span className="text-paper/70">1996+ row is survivorship-biased upward</span> (pre-2010 scores only names that survived to today) and is kept only for context, not as the headline.
          Per-preset period splits are no longer shown: only the full-period preset CAGRs are baked, and this panel does not display numbers it cannot trace to data. ⚠️ Past performance ≠ future; realized after-cost alpha is typically 2–4% below backtest CAGR.
        </div>
      </Card>

      {btErr && <Unavailable what="Validated backtest data" detail="quant_backtest.json failed to load — the equity curve and period splits are hidden rather than silently absent." />}

      {/* ── ROBUST (2011+) equity curve leads; the pre-2011 survivorship-biased record is shown SEPARATELY below ── */}
      {bt && robust && (() => {
        const buyhold = bt.spy_source === "buyhold_yahoo_v8";
        return (
        <Card title={`📈 Validated TOP-25 Backtest (${robust.startYear}+) — robust dataset, vs Buy-&-Hold SPY`}
          sub={`Cumulative growth of $100 from ${robust.startYear}. This is the survivorship-clean window — point-in-time EDGAR coverage is thin and biased upward pre-2010, so that stretch is excluded from the headline and shown separately below. Same TOP-25 equal-weight quarterly strategy.`}>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label={`TOP-25 (${robust.startYear}+)`} value={<span className="text-pos">+{robust.qTotal.toFixed(0)}%</span>} hint={`$100 → $${(100 + robust.qTotal).toLocaleString(undefined, { maximumFractionDigits: 0 })} · ${robust.qCagr.toFixed(1)}% CAGR`} />
            <Metric label="SPY (buy & hold)" value={robust.sTotal != null ? `+${robust.sTotal.toFixed(0)}%` : "—"} hint={robust.sCagr != null ? `${robust.sCagr.toFixed(1)}% CAGR` : undefined} />
            <Metric label="Alpha (CAGR)" value={robust.alpha != null ? <span className="text-pos">+{robust.alpha.toFixed(1)}%</span> : "—"} hint="vs buy & hold" />
            <Metric label="Win Rate" value={h?.win_rate_pct != null ? `${h.win_rate_pct.toFixed(1)}%` : "—"} hint="full-period (1996+)" />
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={robust.curve} margin={{ top: 5, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={SURFACE.raised} vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => new Date(t).getFullYear().toString()} tick={{ fill: INK.mute, fontSize: 11 }} minTickGap={50} />
              <YAxis tick={{ fill: INK.mute, fontSize: 11 }} width={48} tickFormatter={(v) => `$${v.toFixed(0)}`} />
              <Tooltip {...tooltipProps} labelFormatter={(t) => new Date(t).toLocaleDateString()} formatter={(v: number, n) => [`$${v.toFixed(0)}`, n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="quant" stroke={SEM.pos} dot={false} strokeWidth={2} name="Realistic Strategy" />
              <Line type="monotone" dataKey="spy" stroke={INK.mute} dot={false} strokeWidth={1.6} strokeDasharray="4 2" name="SPY (buy & hold)" connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 text-[11px] leading-relaxed text-mute">
            Source: <code className="text-ink-3">{bt.source_meta ?? bt.source_file}</code> · TOP-25 quarterly rebalance, rebased to $100 at {robust.startYear}.
            SPY line = {buyhold ? <>true <strong className="text-ink-3">buy-&-hold</strong> from the app's Yahoo v8 feed{bt.spy_asof ? `, as-of ${bt.spy_asof}` : ""}</> : <span className="text-warn-hot">approximate (overlapping per-checkpoint returns)</span>}. Gross of costs/taxes.
          </div>
          {/* pre-2011 record, shown SEPARATELY and flagged */}
          {h?.quant_total_pct != null && (
            <div className="mt-4 rounded-md border border-warn/25 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-paper/70">
              <span className="font-semibold text-paper">⚠️ Extended record (1996+) — survivorship-biased, shown separately:</span> over the full 1996 → 2026 span the same strategy reads <span className="text-ink-2">+{h.quant_total_pct.toLocaleString(undefined, { maximumFractionDigits: 0 })}% / {h.quant_cagr_pct?.toFixed(1)}% CAGR</span>. But pre-2010 scores the CURRENT survivors back in time (delisted losers are absent), so it is biased upward and is <strong>not</strong> the headline — use the {robust.startYear}+ figure above. The survivorship-free Era-2 rebuild is a separate project.
            </div>
          )}
        </Card>
        );
      })()}

      {/* ── strategy summary (preset metrics) — validated record OR research prior ── */}
      {presetInfo && (
        <Card title={presetInfo.is_research_prior ? "⚗ Research-Prior Backtest" : "Validated Strategy Backtest"}
              sub={presetInfo.is_research_prior
                ? `Walk-forward OOS · top-${presetInfo.top_n ?? 7} · ~${presetInfo.hold_days ?? 42}-day hold · ${presetInfo.backtest_universe}`
                : `TOP-25 quarterly rebalance · ${presetInfo.backtest_universe}`}>
          {presetInfo.is_research_prior && (
            <div className="mb-2 rounded-md border border-warn/25 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-paper">
              ⚗ {presetInfo.caveat ?? "Research prior, not a validated record."}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label={presetInfo.is_research_prior ? "OOS CAGR" : "CAGR"} value={<span className="text-pos">{fmtPct(presetInfo.backtest_cagr)}</span>}
                    hint={presetInfo.is_research_prior && presetInfo.in_sample_cagr != null ? `${fmtPct(presetInfo.in_sample_cagr)} in-sample` : undefined} />
            <Metric label="Sharpe" value={presetInfo.backtest_sharpe.toFixed(2)} />
            <Metric label="Max Drawdown" value={<span className="text-neg">{fmtPct(presetInfo.backtest_max_dd)}</span>} />
            <Metric label="Portfolio size" value={presetInfo.is_research_prior ? String(presetInfo.top_n ?? 7) : "25"} hint={presetInfo.is_research_prior ? "research prior" : "validated construction"} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-mute">
            {presetInfo.is_research_prior
              ? <>A <strong>research prior</strong> from the walk-forward-OOS sweep on EDGAR-era 2011–2026 data — <strong>not</strong> the validated 1996–2026 TOP-25 record above, and not a default. Survivorship-biased; gated downstream by MLPred.</>
              : <>These describe the validated <strong>TOP-25</strong> equal-rebalance strategy under the <strong>{weightScheme}</strong> preset, 1996–2026, 121 quarterly rebalances. NOT a backtest of the specific allocation built below.</>}
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
            <p className="mt-2 text-xs text-ink-3">{ideal.rationale}</p>
            {ideal.warnings.length > 0 && (
              <details className="mt-2 text-xs"><summary className="cursor-pointer text-mute">⚠️ Important caveats</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-3">{ideal.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>
            )}
          </>
        ) : <div className="text-sm text-mute">Needs live SPY/VIX from /api/market (deployed app only). Defaulting to full deployment.</div>}
      </Card>

      {/* ── Build Your Allocation ── */}
      <Card title="Build Your Allocation" sub="Score-weighted construction with per-aggressiveness sector caps, position ceilings, and score floors.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            <Pill active={mode === "fresh"} onClick={() => setMode("fresh")}>Fresh Portfolio</Pill>
            <Pill active={mode === "rebalance"} onClick={() => setMode("rebalance")}>Rebalance from Existing</Pill>
          </div>
          <label className="text-xs text-ink-3">{mode === "rebalance" ? "New cash to add ($)" : "Capital ($)"}
            <input type="number" value={capital} onChange={(e) => setCapital(Math.max(0, parseFloat(e.target.value) || 0))}
              className="mt-1 block w-36 rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-white" />
          </label>
          <div className="flex flex-wrap gap-1">
            {LEVELS.map((l) => (
              <button key={l} onClick={() => setLevel(l)}
                className={`rounded-md px-3 py-1.5 text-xs ${level === l ? "bg-cta font-semibold text-white" : "bg-raised text-ink-3 hover:bg-active"}`}>{l} ({POS_BY_LEVEL[l]})</button>
            ))}
          </div>
        </div>

        {deployPct < 100 && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-ink-3">
            <input type="checkbox" checked={applyPhased} onChange={(e) => setApplyPhased(e.target.checked)} className="accent-btc" />
            🌡️ Apply suggested phased deployment ({deployPct}% now, hold {100 - deployPct}% for a pullback)
          </label>
        )}
        {deployPct >= 100 && pullback && <div className="mt-2 text-xs text-mute">✓ Pullback pressure suggests full deployment — no phased adjustment needed.</div>}

        {mode === "rebalance" && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-ink-3">Your current holdings — one per line: <code className="text-mute">TICKER shares</code> (or <code className="text-mute">TICKER,shares</code>)</label>
              <button onClick={() => { try { const hs = JSON.parse(localStorage.getItem("qd_holdings") || "[]"); setHoldingsText(hs.map((x: any) => `${x.ticker} ${x.shares}`).join("\n")); } catch { /* ignore */ } }}
                className="rounded bg-raised px-2 py-1 text-[11px] text-ink-3 hover:bg-active">Load my saved holdings</button>
            </div>
            <textarea value={holdingsText} onChange={(e) => setHoldingsText(e.target.value)} rows={4} placeholder={"AAPL 50\nNVDA 20\nMSFT, 15"}
              className="block w-full rounded-md border border-line bg-head px-2 py-1.5 font-mono text-xs text-white" />
            {holdings.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-3">
                <Metric label="Current stock value" value={fmtMoney(currentTotal, 0)} />
                <Metric label="New cash" value={fmtMoney(newCash, 0)} />
                <Metric label="Total to deploy" value={fmtMoney(totalCapital, 0)} />
              </div>
            )}
            {holdingsText.trim() && holdings.length === 0 && <div className="mt-2 text-xs text-warn-hot">No rows matched the scored universe — check tickers (cash/MM tickers aren't supported here).</div>}
          </div>
        )}
        <p className="mt-2 text-[11px] text-mute">Validated TOP-25 = the equal-weight construction the backtest describes. Conservative 30 · Balanced 20 · Aggressive 12 are score-weighted with sector caps. Weighting = {weightScheme}.</p>
      </Card>

      {/* ── Summary metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Positions" value={port.length} hint={`max ${POS_BY_LEVEL[level]} (${level})`} />
        <Metric label="Deployed" value={fmtMoney(deployed, 0)} hint={`of ${fmtMoney(effectiveCapital, 0)}`} />
        <Metric label="Avg Score" value={stats ? stats.avg_score.toFixed(2) : "—"} />
        <Metric label="Sectors" value={stats?.num_sectors ?? 0} />
      </div>

      {port.length === 0 ? (
        <div className="text-sm text-mute">No positions pass the filters at this level / universe.</div>
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
                    <Tooltip {...tooltipProps} formatter={(v: number, n) => [`${v.toFixed(1)}%`, n]} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
              <Card title="vs SPY Top 30">
                <div className="space-y-3">
                  <Metric label="Overlap with SPY" value={`${overlap.overlap_count} stocks`} />
                  <Metric label="Weight in SPY top names" value={`${overlap.overlap_pct.toFixed(0)}%`} />
                  <div className="text-xs text-ink-3"><strong className="text-ink-2">{stats.num_positions - overlap.overlap_count} differentiated picks</strong> vs index.</div>
                  {overlap.overlap_tickers.length > 0 && <div className="text-xs text-mute">Shared: {overlap.overlap_tickers.join(", ")}</div>}
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
  const { goToDetail } = useStore();
  if (!actions.length) return <Card title="🎯 Action Items"><div className="text-sm text-pos">Portfolio matches optimal — no actions needed.</div></Card>;
  const inits = actions.filter((a) => a.action === "INITIATE");
  const adds = actions.filter((a) => a.action === "ADD");
  const trims = actions.filter((a) => a.action === "TRIM");
  const exits = actions.filter((a) => a.action === "EXIT");
  const holds = actions.filter((a) => a.action === "HOLD");
  const buyTotal = [...inits, ...adds].reduce((a, x) => a + x.delta_dollars, 0);
  const sellTotal = [...trims, ...exits].reduce((a, x) => a + -x.delta_dollars, 0);

  const Section = ({ title, items, cols }: { title: string; items: RebalAction[]; cols: ("pct" | "tgt" | "delta" | "score" | "reason")[] }) => items.length === 0 ? null : (
    <div className="mt-3">
      <div className="mb-1 text-xs font-semibold uppercase text-mute">{title}</div>
      <div className="overflow-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead><tr>
            <th className="bg-head px-3 py-1.5 text-left text-xs uppercase text-mute">Ticker</th>
            {cols.includes("score") && <th className="bg-head px-3 py-1.5 text-left text-xs uppercase text-mute">Rating / Score</th>}
            {cols.includes("pct") && <th className="bg-head px-3 py-1.5 text-right text-xs uppercase text-mute">Current %</th>}
            {cols.includes("tgt") && <th className="bg-head px-3 py-1.5 text-right text-xs uppercase text-mute">Target %</th>}
            {cols.includes("delta") && <th className="bg-head px-3 py-1.5 text-right text-xs uppercase text-mute">$ Δ</th>}
            {cols.includes("reason") && <th className="bg-head px-3 py-1.5 text-left text-xs uppercase text-mute">Why</th>}
          </tr></thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.ticker} className="border-t border-line-faint">
                <td className="px-3 py-1.5"><button onClick={() => goToDetail(a.ticker)} className="font-semibold text-link hover:underline" title={`Open ${a.ticker} stock detail`}>{a.ticker}</button></td>
                {cols.includes("score") && <td className="px-3 py-1.5 text-ink-3">{a.rating ?? "—"}{a.score != null ? ` (${a.score.toFixed(1)})` : ""}</td>}
                {cols.includes("pct") && <td className="px-3 py-1.5 text-right">{a.current_pct.toFixed(1)}%</td>}
                {cols.includes("tgt") && <td className="px-3 py-1.5 text-right">{a.target_pct.toFixed(1)}%</td>}
                {cols.includes("delta") && <td className="px-3 py-1.5 text-right font-semibold" style={{ color: a.delta_dollars >= 0 ? SEM.pos : SEM.neg }}>{a.delta_dollars >= 0 ? "+" : "-"}${Math.abs(a.delta_dollars).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>}
                {cols.includes("reason") && <td className="px-3 py-1.5 text-ink-3">{a.reason}</td>}
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
        <details className="mt-3 text-xs"><summary className="cursor-pointer text-mute">✓ HOLD — {holds.length} positions in target range (no action)</summary>
          <Section title="" items={holds} cols={["pct", "tgt", "reason"]} /></details>
      )}
    </Card>
  );
}
