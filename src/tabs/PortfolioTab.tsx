import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Card, Metric, RatingBadge, TH, TD } from "../components/ui";
import { SortableTable, RATING_RANK, type Column } from "../components/SortableTable";
import { fmtMoney, fmtPct } from "../lib/format";
import { analyzePortfolio, type Holding, type Position } from "../lib/portfolio";
import { generateSuggestions, sugColor, sugIcon } from "../lib/suggestions";
import AiNarrative from "../components/AiNarrative";
import { runMonteCarlo, type Scenario } from "../lib/montecarlo";
import { loadTickerPrices } from "../lib/data";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, CartesianGrid, ReferenceLine } from "recharts";

// Generic Fidelity-style CSV → holdings (Symbol/Ticker, Quantity/Shares, Cost Basis Per Share)
function parseHoldingsCsv(text: string): Holding[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (l: string) => l.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
  const si = find("symbol", "ticker"), qi = find("quantity", "shares"), ci = find("cost basis per share", "average cost", "cost basis");
  if (si < 0 || qi < 0) return [];
  const out: Holding[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = split(lines[i]);
    const t = (c[si] || "").toUpperCase().replace(/[^A-Z.\-]/g, "");
    const q = parseFloat((c[qi] || "").replace(/[^0-9.\-]/g, ""));
    const cb = ci >= 0 ? parseFloat((c[ci] || "").replace(/[^0-9.\-]/g, "")) : NaN;
    if (t && Number.isFinite(q) && q > 0) out.push({ ticker: t, shares: q, cost_basis: Number.isFinite(cb) ? cb : null });
  }
  return out;
}

function useHoldings(): [Holding[], (h: Holding[]) => void] {
  const [h, setH] = useState<Holding[]>(() => {
    try { return JSON.parse(localStorage.getItem("qd_holdings") || "[]"); } catch { return []; }
  });
  const save = (nh: Holding[]) => { setH(nh); localStorage.setItem("qd_holdings", JSON.stringify(nh)); };
  return [h, save];
}

export default function PortfolioTab() {
  const { byTicker, rows, goToDetail } = useStore();
  const [holdings, setHoldings] = useHoldings();
  const [tk, setTk] = useState(""); const [sh, setSh] = useState(""); const [cb, setCb] = useState("");

  const analysis = useMemo(() => analyzePortfolio(holdings, byTicker, rows), [holdings, byTicker, rows]);
  const suggestions = useMemo(() => analysis ? generateSuggestions(analysis, rows) : [], [analysis, rows]);

  // Monte Carlo needs per-holding price series (lazy-loaded) + controls
  const [priceMap, setPriceMap] = useState<Map<string, number[]>>(new Map());
  useEffect(() => {
    let live = true;
    const tickers = (analysis?.positions ?? []).filter((p) => p.weight != null && p.weight > 0).map((p) => p.ticker);
    Promise.all(tickers.map((t) => loadTickerPrices(t).then((s) => [t, s?.close ?? null] as const)))
      .then((pairs) => { if (live) { const m = new Map<string, number[]>(); for (const [t, c] of pairs) if (c) m.set(t, c); setPriceMap(m); } });
    return () => { live = false; };
  }, [analysis]);
  const [mcSims, setMcSims] = useState(5000);
  const [mcHorizon, setMcHorizon] = useState(252);
  const [mcScenario, setMcScenario] = useState<Scenario>("Blended");
  const mc = useMemo(
    () => analysis ? runMonteCarlo(analysis.positions, analysis.total_value, byTicker, priceMap, { sims: mcSims, horizonDays: mcHorizon, scenario: mcScenario }) : null,
    [analysis, byTicker, priceMap, mcSims, mcHorizon, mcScenario],
  );
  const HORIZON_LABEL: Record<number, string> = { 63: "3 Months", 126: "6 Months", 252: "1 Year" };

  const pillarTilt = useMemo(() => analysis ? Object.entries(analysis.factor_tilts).map(([p, f]) => ({ pillar: p.replace(" Revisions", " Rev"), Portfolio: f.portfolio, Universe: f.universe })) : [], [analysis]);

  const onCsv = (file: File) => { const r = new FileReader(); r.onload = () => { const parsed = parseHoldingsCsv(String(r.result || "")); if (parsed.length) setHoldings(parsed); }; r.readAsText(file); };

  const holdingCols = useMemo<Column<Position>[]>(() => [
    { key: "ticker", header: "Ticker", sortValue: (p) => p.ticker,
      render: (p) => <button onClick={() => goToDetail(p.ticker)} className="font-semibold text-[#5BA8FF] hover:underline">{p.ticker}</button> },
    { key: "sector", header: "Sector", sortValue: (p) => p.sector ?? "", render: (p) => <span className="text-[#9CA7BB]">{p.sector}</span> },
    { key: "shares", header: "Shares", align: "right", sortValue: (p) => p.shares, render: (p) => p.shares },
    { key: "price", header: "Price", align: "right", sortValue: (p) => p.price, render: (p) => fmtMoney(p.price) },
    { key: "value", header: "Value", align: "right", sortValue: (p) => p.market_value, render: (p) => fmtMoney(p.market_value, 0) },
    { key: "weight", header: "Weight", align: "right", sortValue: (p) => p.weight, render: (p) => p.weight == null ? "—" : fmtPct(p.weight * 100) },
    { key: "gain", header: "Gain", align: "right", sortValue: (p) => p.gain_pct,
      render: (p) => <span style={{ color: p.gain_pct == null ? "#7C879B" : p.gain_pct >= 0 ? "#00C805" : "#FF5722" }}>{p.gain_pct == null ? "—" : fmtPct(p.gain_pct, 1, true)}</span> },
    { key: "rating", header: "Rating", sortValue: (p) => RATING_RANK[p.rating] ?? 0, render: (p) => <RatingBadge rating={p.rating} /> },
    { key: "remove", header: "", sortable: false, render: (p) => <button onClick={() => setHoldings(holdings.filter((h) => h.ticker !== p.ticker))} className="text-xs text-[#7C879B] hover:text-red-400">remove</button> },
  ], [goToDetail, holdings, setHoldings]);

  const add = () => {
    const t = tk.trim().toUpperCase(); const s = parseFloat(sh);
    if (!t || !Number.isFinite(s) || s <= 0) return;
    setHoldings([...holdings.filter((h) => h.ticker !== t), { ticker: t, shares: s, cost_basis: cb ? parseFloat(cb) : null }]);
    setTk(""); setSh(""); setCb("");
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white">Your Portfolio</h2>

      <Card title="Add holding" sub="Stored locally in your browser (localStorage). Not uploaded anywhere.">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-[#9CA7BB]">Ticker<input value={tk} onChange={(e) => setTk(e.target.value)} className="mt-1 block w-28 rounded-md border border-[#1E2632] bg-[#0F1420] px-2 py-1.5 text-sm text-white" /></label>
          <label className="text-xs text-[#9CA7BB]">Shares<input value={sh} onChange={(e) => setSh(e.target.value)} className="mt-1 block w-24 rounded-md border border-[#1E2632] bg-[#0F1420] px-2 py-1.5 text-sm text-white" /></label>
          <label className="text-xs text-[#9CA7BB]">Cost basis<input value={cb} onChange={(e) => setCb(e.target.value)} placeholder="opt." className="mt-1 block w-24 rounded-md border border-[#1E2632] bg-[#0F1420] px-2 py-1.5 text-sm text-white" /></label>
          <button onClick={add} className="rounded-md bg-[#3B82F6] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2f6fd6]">Add</button>
          <label className="cursor-pointer rounded-md border border-[#1E2632] px-3 py-1.5 text-sm text-[#9CA7BB] hover:bg-[#161D29]">
            Upload CSV
            <input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsv(f); e.target.value = ""; }} />
          </label>
          {holdings.length > 0 && <button onClick={() => setHoldings([])} className="rounded-md border border-[#1E2632] px-3 py-1.5 text-sm text-[#9CA7BB] hover:bg-[#161D29]">Clear all</button>}
        </div>
        <div className="mt-1 text-[10px] text-[#5C6678]">CSV: a header row with Symbol/Ticker, Quantity/Shares, and optional Cost Basis Per Share (Fidelity-style export works).</div>
      </Card>

      {!analysis ? (
        <div className="text-sm text-[#7C879B]">Add holdings to see portfolio analytics.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Value" value={fmtMoney(analysis.total_value, 0)} />
            <Metric label="Holdings" value={analysis.num_holdings} hint={`${analysis.num_stocks} stk / ${analysis.num_etfs} etf`} />
            <Metric label="Weighted Score" value={`${analysis.weighted_composite.toFixed(2)}/12`} />
            <Metric label="Rating" value={<RatingBadge rating={analysis.weighted_rating} />} />
            <Metric label="Concentration" value={analysis.concentration_level} hint={`HHI ${analysis.hhi}`} />
            <Metric label="Stock / ETF" value={`${analysis.stock_weight}% / ${analysis.etf_weight}%`} />
          </div>

          <Card title="Holdings">
            <SortableTable columns={holdingCols} rows={analysis.positions} rowKey={(p) => p.ticker} initialSortKey="value" initialSortDir="desc" maxHeight="56vh" />
            {analysis.unmatched_tickers.length > 0 && <div className="mt-2 text-xs text-[#FF9800]">Unmatched (not in universe): {analysis.unmatched_tickers.join(", ")}</div>}
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Factor tilts vs universe">
              <table className="w-full text-sm">
                <thead><tr><TH>Pillar</TH><TH className="text-right">Portfolio</TH><TH className="text-right">Universe</TH><TH>Tilt</TH></tr></thead>
                <tbody>
                  {Object.entries(analysis.factor_tilts).map(([p, f]) => (
                    <tr key={p} className="border-t border-[#161D29]">
                      <TD className="text-[#C3CAD7]">{p}</TD><TD className="text-right">{f.portfolio.toFixed(1)}</TD>
                      <TD className="text-right text-[#9CA7BB]">{f.universe.toFixed(1)}</TD>
                      <TD style={{ color: f.tilt === "Overweight" ? "#00C805" : f.tilt === "Underweight" ? "#FF5722" : "#9CA7BB" }}>{f.tilt}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Sector allocation">
              <table className="w-full text-sm">
                <thead><tr><TH>Sector</TH><TH className="text-right">Weight</TH><TH className="text-right">Holdings</TH><TH className="text-right">Avg Score</TH></tr></thead>
                <tbody>
                  {Object.entries(analysis.sector_weights).map(([sector, s]) => (
                    <tr key={sector} className="border-t border-[#161D29]">
                      <TD className="text-[#C3CAD7]">{sector}</TD><TD className="text-right">{fmtPct(s.weight * 100)}</TD>
                      <TD className="text-right text-[#9CA7BB]">{s.count}</TD><TD className="text-right">{s.avg_score ? s.avg_score.toFixed(2) : "—"}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          {/* Pillar tilt chart (Portfolio vs Universe) */}
          <Card title="Pillar Tilt — Portfolio vs Universe">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={pillarTilt} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <XAxis dataKey="pillar" tick={{ fill: "#9CA7BB", fontSize: 11 }} />
                <YAxis domain={[0, 12]} tick={{ fill: "#7C879B", fontSize: 11 }} width={28} />
                <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Portfolio" fill="#5BA8FF" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Universe" fill="#3A4254" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* AI Portfolio Advisor (runtime /api/ai over tilts + concentrations) */}
          <AiNarrative kind="portfolio"
            blob={{ tilts: analysis.factor_tilts,
              concentration: analysis.positions.filter((p) => p.weight != null).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 5).map((p) => ({ t: p.ticker, sector: p.sector, w: p.weight })),
              nHoldings: analysis.positions.length }}
            label="AI Portfolio Advisor"
            hint="Plain-English rebalance reasoning — where the book is over/under-exposed and which uncorrelated, strong-quant sectors could diversify it." />

          {/* Actionable recommendations (suggestions_v2) */}
          <Card title="Actionable Recommendations" sub="Prescriptive, prioritized — position sizing, sector risk, tax-loss, momentum exits, new ideas">
            {suggestions.length === 0 ? <div className="text-sm text-[#7C879B]">No flags — portfolio looks balanced.</div> : (
              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <div key={i} className="rounded-md p-3" style={{ background: "#141B27", borderLeft: `4px solid ${sugColor(s.type)}` }}>
                    <div className="text-sm font-semibold" style={{ color: sugColor(s.type) }}>{sugIcon(s.type)} {s.title}</div>
                    <div className="text-sm text-white">→ {s.action}</div>
                    <div className="text-xs text-[#9CA7BB]">{s.reasoning}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Monte Carlo simulation */}
          <Card title="🎲 Monte Carlo Simulation" sub="Geometric Brownian Motion with mean reversion, return caps, 0.45 cross-correlation, and macro scenario adjustment.">
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <label className="text-xs text-[#9CA7BB]">Sims
                <select value={mcSims} onChange={(e) => setMcSims(+e.target.value)} className="mt-1 block rounded-md border border-[#1E2632] bg-[#0F1420] px-2 py-1.5 text-sm text-white">
                  {[1000, 5000, 10000].map((n) => <option key={n} value={n}>{n.toLocaleString()}</option>)}
                </select>
              </label>
              <label className="text-xs text-[#9CA7BB]">Horizon
                <select value={mcHorizon} onChange={(e) => setMcHorizon(+e.target.value)} className="mt-1 block rounded-md border border-[#1E2632] bg-[#0F1420] px-2 py-1.5 text-sm text-white">
                  {[63, 126, 252].map((n) => <option key={n} value={n}>{HORIZON_LABEL[n]}</option>)}
                </select>
              </label>
              <label className="text-xs text-[#9CA7BB]">Scenario
                <select value={mcScenario} onChange={(e) => setMcScenario(e.target.value as Scenario)} className="mt-1 block rounded-md border border-[#1E2632] bg-[#0F1420] px-2 py-1.5 text-sm text-white">
                  {(["Blended", "Bull", "Base", "Bear"] as Scenario[]).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <span className="text-[11px] text-[#7C879B]">Bull +8% drift · Base neutral · Bear −12% · Blended 25/50/25.</span>
            </div>
            {!mc ? <div className="py-4 text-sm text-[#7C879B]">Add priced holdings to run a simulation.</div> : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Metric label="Exp. return" value={fmtPct(mc.expReturnPct, 1, true)} hint="annualized" />
                  <Metric label="Volatility" value={fmtPct(mc.volPct, 1)} hint="annualized" />
                  <Metric label="P(gain)" value={`${mc.pPositive.toFixed(0)}%`} />
                  <Metric label="P(loss > 20%)" value={`${mc.pLoss20.toFixed(0)}%`} />
                  <Metric label="Scenario" value={mc.scenario} />
                </div>
                {/* Fan chart (5/25/50/75/95 bands) */}
                <ResponsiveContainer width="100%" height={340}>
                  <AreaChart data={mc.fan.map((f) => ({ day: f.day, p50: f.p50, base: f.p5, outer: f.p95 - f.p5, base2: f.p25, inner: f.p75 - f.p25 }))} margin={{ top: 12, right: 12, bottom: 0, left: 4 }}>
                    <CartesianGrid stroke="#1A2130" vertical={false} />
                    <XAxis dataKey="day" type="number" domain={[0, mc.horizonDays]} tick={{ fill: "#7C879B", fontSize: 11 }} tickFormatter={(d) => `${d}d`} minTickGap={36} />
                    <YAxis tick={{ fill: "#7C879B", fontSize: 11 }} width={64} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} labelFormatter={(d) => `Day ${d}`}
                      formatter={(v: number, n: string) => n === "p50" ? [fmtMoney(v, 0), "Median"] : [null, null]} />
                    <ReferenceLine y={mc.totalValue} stroke="#666" strokeDasharray="4 4" label={{ value: "Start", fill: "#9CA7BB", fontSize: 10, position: "insideLeft" }} />
                    {/* 5–95 band (transparent base + filled span), then 25–75 band, then median */}
                    <Area type="monotone" dataKey="base" stackId="o" stroke="none" fill="transparent" isAnimationActive={false} legendType="none" />
                    <Area type="monotone" dataKey="outer" stackId="o" stroke="none" fill="#00D4AA" fillOpacity={0.10} isAnimationActive={false} name="5–95th" />
                    <Area type="monotone" dataKey="base2" stackId="i" stroke="none" fill="transparent" isAnimationActive={false} legendType="none" />
                    <Area type="monotone" dataKey="inner" stackId="i" stroke="none" fill="#00D4AA" fillOpacity={0.20} isAnimationActive={false} name="25–75th" />
                    <Area type="monotone" dataKey="p50" stroke="#00D4AA" strokeWidth={2} fill="none" dot={false} name="Median" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="text-[10px] text-[#5C6678]">Shaded = 5th–95th and 25th–75th percentile cone; line = median portfolio value over time.</div>

                <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* Outcome probabilities (6 rows) */}
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase text-[#7C879B]">Outcome Probabilities</div>
                    <table className="w-full text-sm">
                      <thead><tr><TH>Outcome</TH><TH className="text-right">Probability</TH></tr></thead>
                      <tbody>
                        {([
                          ["Gain 50%+", mc.pGain50],
                          ["Gain 20%+", mc.pGain20],
                          ["Any Gain", mc.pPositive],
                          ["Loss < 10%", Math.max(0, 100 - mc.pPositive - mc.pLoss10)],
                          ["Loss 10–20%", Math.max(0, mc.pLoss10 - mc.pLoss20)],
                          ["Loss > 20%", mc.pLoss20],
                        ] as const).map(([l, v]) => (
                          <tr key={l} className="border-t border-[#161D29]"><TD className="text-[#C3CAD7]">{l}</TD><TD className="text-right">{v.toFixed(1)}%</TD></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Value at Risk (terminal percentiles) */}
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase text-[#7C879B]">Value at Risk (terminal)</div>
                    <table className="w-full text-sm">
                      <thead><tr><TH>Percentile</TH><TH className="text-right">Value</TH><TH className="text-right">Return</TH></tr></thead>
                      <tbody>
                        {([["5th (worst)", mc.percentiles.p5], ["25th", mc.percentiles.p25], ["50th (median)", mc.percentiles.p50], ["75th", mc.percentiles.p75], ["95th (best)", mc.percentiles.p95]] as const).map(([l, v]) => (
                          <tr key={l} className="border-t border-[#161D29]"><TD className="text-[#C3CAD7]">{l}</TD><TD className="text-right">{fmtMoney(v, 0)}</TD>
                            <TD className="text-right" style={{ color: v >= mc.totalValue ? "#00C805" : "#FF5722" }}>{fmtPct((v / mc.totalValue - 1) * 100, 1, true)}</TD></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Per-holding assumptions + model params */}
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-[#7C879B]">Model Assumptions (per holding)</summary>
                  <table className="mt-2 w-full text-sm">
                    <thead><tr><TH>Ticker</TH><TH className="text-right">Exp. Return</TH><TH className="text-right">Est. Vol</TH><TH className="text-right">Weight</TH></tr></thead>
                    <tbody>
                      {mc.holdingDetails.map((d) => (
                        <tr key={d.ticker} className="border-t border-[#161D29]"><TD className="text-[#C3CAD7]">{d.ticker}</TD><TD className="text-right">{d.expReturnPct.toFixed(1)}%</TD><TD className="text-right">{d.volPct.toFixed(1)}%</TD><TD className="text-right">{d.weightPct.toFixed(1)}%</TD></tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 space-y-0.5 text-[11px] text-[#7C879B]">
                    <div>Mean reversion: {(mc.modelParams.meanReversionWeight * 100).toFixed(0)}% long-term / {((1 - mc.modelParams.meanReversionWeight) * 100).toFixed(0)}% trailing</div>
                    <div>Return cap: {(mc.modelParams.maxAnnualReturnCap * 100).toFixed(0)}% max per holding · Long-term equity premium: {(mc.modelParams.longTermPremium * 100).toFixed(0)}%</div>
                    <div>Avg cross-correlation: {mc.modelParams.avgCorrelation.toFixed(2)} · Scenario adjustment: {mc.modelParams.scenarioAdjustmentPct >= 0 ? "+" : ""}{mc.modelParams.scenarioAdjustmentPct.toFixed(1)}%</div>
                  </div>
                </details>
                <div className="mt-1 text-[10px] text-[#5C6678]">Per-holding return/vol derived from baked price-series momentum (1m/3m/6m/12m) blended with a long-term premium; not a forecast.</div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
