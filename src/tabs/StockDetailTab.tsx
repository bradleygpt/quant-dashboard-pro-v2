import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Card, GradePill, RatingBadge, Spinner, Metric } from "../components/ui";
import { fmtMoney, fmtPct, fmtCapB, fmtNum } from "../lib/format";
import { loadTickerDetail, loadTickerPrices } from "../lib/data";
import type { TickerDetail, PriceSeries } from "../lib/types";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart, Bar, Cell, ComposedChart } from "recharts";
import { computeRisk } from "../lib/risk";
import { useLiveData } from "../lib/live";

interface Quote {
  ok?: boolean; price?: number | null; prevClose?: number | null; change?: number | null; changePct?: number | null;
  dayHigh?: number | null; dayLow?: number | null; rangePosition?: number | null; vwap?: number | null; volume?: number | null;
  history?: { dates: string[]; close: number[]; high: number[]; low: number[]; volume: number[] } | null;
}
const PERIODS = ["6mo", "1y", "2y", "5y"];
// RSI(14), simple rolling-average method (matches buy_point.py _compute_rsi)
function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (closes.length < period + 1) return out;
  const gains: number[] = [], losses: number[] = [];
  for (let i = 1; i < closes.length; i++) { const d = closes[i] - closes[i - 1]; gains.push(Math.max(0, d)); losses.push(Math.max(0, -d)); }
  for (let i = period; i < gains.length + 1; i++) {
    const ag = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    const al = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

export default function StockDetailTab() {
  const { rows, byTicker, selectedTicker, selectTicker, floor, watchlist, toggleWatch, meta } = useStore();
  const [td, setTd] = useState<TickerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [series, setSeries] = useState<PriceSeries | null>(null);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("1y");

  const ticker = selectedTicker ?? rows.find((r) => r.sector !== "ETF")?.ticker ?? null;
  const row = ticker ? byTicker.get(ticker) : null;
  // LIVE quote + history (current to today; covers tickers absent from the baked parquet)
  const quote = useLiveData<Quote>(ticker ? `/api/quote?ticker=${encodeURIComponent(ticker)}&range=${period}` : `/api/quote?ticker=`);
  const liveHist = quote.status === "ok" ? quote.data?.history ?? null : null;

  // quarterly earnings/margins history (baked)
  const [quarterly, setQuarterly] = useState<Record<string, any[]> | null>(null);
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}data/quarterly.json`).then((r) => r.ok ? r.json() : null).then(setQuarterly).catch(() => {}); }, []);
  const qhist = ticker && quarterly ? (quarterly[ticker] ?? []) : [];

  // AI note (Gemini via /api/ai) — on-demand, degrades if no key
  const [ai, setAi] = useState<{ kind: string; status: "idle" | "loading" | "done"; text?: string; reason?: string; price?: number; live?: boolean }>({ kind: "", status: "idle" });
  const runAi = (kind: "research" | "earnings") => {
    if (!row) return;
    setAi({ kind, status: "loading" });
    // Current price = LIVE /api/quote (matches the chart); composite/FV/QBP stay BAKED.
    const livePrice = quote.status === "ok" ? quote.data?.price ?? null : null;
    const usePrice = livePrice ?? row.price;
    const qs = new URLSearchParams({ ticker: row.ticker, kind, name: row.name ?? "", sector: row.sector ?? "", score: String(row.composite), rating: row.rating, price: String(usePrice ?? ""), price_live: livePrice != null ? "1" : "0", fv: String(row.fv ?? ""), qbp: String(row.qbp ?? "") });
    fetch(`/api/ai?${qs}`).then((r) => r.json()).then((d) => setAi({ kind, status: "done", text: d.ok ? d.text : undefined, reason: d.reason, price: usePrice ?? undefined, live: livePrice != null })).catch(() => setAi({ kind, status: "done", reason: "error" }));
  };

  useEffect(() => {
    if (!ticker) return;
    let live = true;
    setDetailLoading(true); setTd(null); setSeries(null); setAi({ kind: "", status: "idle" }); // clear stale AI note on ticker change
    loadTickerDetail(floor, ticker).then((d) => { if (live) { setTd(d); setDetailLoading(false); } });
    loadTickerPrices(ticker).then((p) => { if (live) setSeries(p); });
    return () => { live = false; };
  }, [ticker, floor]);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const s = query.trim().toUpperCase();
    return rows.filter((r) => r.ticker.includes(s) || (r.name ?? "").toUpperCase().includes(s)).slice(0, 8);
  }, [query, rows]);

  // Prefer LIVE history (current to today) over the baked parquet series (stale snapshot).
  const usingLive = !!liveHist?.close?.length;
  const chartData = useMemo(() => {
    const src = liveHist ?? (series ? { dates: series.dates, close: series.close, volume: series.close.map(() => 0) } : null);
    if (!src) return [] as { date: string; close: number; volume: number; rsi: number | null }[];
    const rsi = rsiSeries(src.close);
    return src.dates.map((d, i) => ({ date: d, close: src.close[i], volume: (src as any).volume?.[i] ?? 0, rsi: rsi[i] }));
  }, [liveHist, series]);

  // y-domain ALWAYS includes FV and QBP so neither reference line clips off-scale
  const yDomain = useMemo<[number, number] | undefined>(() => {
    if (!chartData.length) return undefined;
    const vals = chartData.map((d) => d.close);
    if (row?.fv) vals.push(row.fv);
    if (row?.qbp) vals.push(row.qbp);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.05 || hi * 0.05;
    return [Math.max(0, lo - pad), hi + pad];
  }, [chartData, row?.fv, row?.qbp]);
  const priceAsOf = chartData.length ? chartData[chartData.length - 1].date : null;

  if (!row) return <div className="p-4 text-[#9CA7BB]">Select a ticker.</div>;

  return (
    <div className="space-y-4">
      {/* selector */}
      <div className="relative max-w-md">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ticker (current: ${row.ticker})`}
          className="w-full rounded-md border border-[#1E2632] bg-[#121723] px-3 py-2 text-sm text-white"
        />
        {suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-[#1E2632] bg-[#0F1420] shadow-xl">
            {suggestions.map((s) => (
              <button key={s.ticker} onClick={() => { selectTicker(s.ticker); setQuery(""); }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[#1B2433]">
                <span className="font-semibold text-[#5BA8FF]">{s.ticker}</span> <span className="text-[#9CA7BB]">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-2xl font-bold text-white">{row.ticker}</div>
          <div className="text-sm text-[#9CA7BB]">{row.name} · {row.sector} · {row.industry}</div>
        </div>
        <RatingBadge rating={row.rating} />
        <button onClick={() => toggleWatch(row.ticker)} className="rounded-md border border-[#1E2632] px-2 py-1 text-xs text-[#9CA7BB] hover:bg-[#161D29]">
          {watchlist.includes(row.ticker) ? "★ Watching" : "☆ Watch"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Price" value={fmtMoney(row.price)} hint="baked (daily refresh)" />
        <Metric label="Composite" value={`${row.composite.toFixed(2)} / 12`} />
        <Metric label="Fair Value" value={fmtMoney(row.fv)} />
        <Metric label="Quant Buy Point" value={fmtMoney(row.qbp)} />
        <Metric label="Mkt Cap" value={fmtCapB(row.marketCapB)} />
        <Metric label="Prem / Disc" value={row.fv ? fmtPct((row.price! / row.fv - 1) * 100, 1, true) : "—"} hint="price vs FV" />
      </div>

      {/* Live Current Quote (intraday, from /api/quote) */}
      {quote.status === "ok" && quote.data?.price != null && (
        <Card title="Current Quote" sub="Live intraday — keyless Yahoo (separate from the baked daily price used for scoring/FV/QBP)">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Price" value={fmtMoney(quote.data.price)} hint={quote.data.changePct != null ? `${quote.data.change! >= 0 ? "▲" : "▼"} ${fmtPct(quote.data.changePct, 2, true)}` : undefined} />
            <Metric label="Day Range" value={quote.data.dayLow != null && quote.data.dayHigh != null ? `${fmtNum(quote.data.dayLow, 2)}–${fmtNum(quote.data.dayHigh, 2)}` : "—"} />
            <Metric label="Range Position" value={quote.data.rangePosition != null ? `${quote.data.rangePosition.toFixed(0)}%` : "—"} />
            <Metric label="Volume" value={quote.data.volume != null ? `${(quote.data.volume / 1e6).toFixed(1)}M` : "—"} />
            <Metric label="VWAP" value={fmtMoney(quote.data.vwap)} hint={quote.data.vwap != null && quote.data.price != null ? fmtPct((quote.data.price / quote.data.vwap - 1) * 100, 1, true) : undefined} />
            <Metric label="Quant Score" value={`${row.composite.toFixed(1)}/12`} hint={row.rating} />
          </div>
        </Card>
      )}

      {/* price chart */}
      <Card title="Price, Volume & RSI"
        sub={chartData.length ? `${usingLive ? "Live" : "Baked"} daily close through ${priceAsOf}${usingLive ? "" : " (baked price cache; live unavailable in preview)"}. FV/QBP lines always in view.` : (quote.status === "loading" ? "Loading price history…" : undefined)}>
        <div className="mb-2 flex gap-1">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`rounded px-2 py-1 text-xs ${period === p ? "bg-[#3B82F6] font-semibold text-white" : "bg-[#1A2130] text-[#9CA7BB] hover:bg-[#222B3C]"}`}>{p}</button>
          ))}
        </div>
        {chartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }} syncId="sd">
                <CartesianGrid stroke="#1A2130" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#7C879B", fontSize: 11 }} minTickGap={48} />
                <YAxis domain={yDomain ?? ["auto", "auto"]} allowDataOverflow tick={{ fill: "#7C879B", fontSize: 11 }} width={56} tickFormatter={(v) => `$${Math.round(v)}`} />
                <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} labelStyle={{ color: "#9CA7BB" }} formatter={(v: number) => [`$${v.toFixed(2)}`, "Close"]} />
                {row.fv && <ReferenceLine y={row.fv} stroke="#FFC107" strokeDasharray="4 4" label={{ value: "FV", fill: "#FFC107", fontSize: 11 }} />}
                {row.qbp && <ReferenceLine y={row.qbp} stroke="#00C805" strokeDasharray="4 4" label={{ value: "QBP", fill: "#00C805", fontSize: 11 }} />}
                <Line type="monotone" dataKey="close" stroke="#5BA8FF" dot={false} strokeWidth={1.6} />
              </LineChart>
            </ResponsiveContainer>
            {usingLive && chartData.some((d) => d.volume > 0) && (
              <ResponsiveContainer width="100%" height={90}>
                <BarChart data={chartData} margin={{ top: 0, right: 10, bottom: 0, left: 0 }} syncId="sd">
                  <XAxis dataKey="date" hide /><YAxis hide /><Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} formatter={(v: number) => [`${(v / 1e6).toFixed(1)}M`, "Vol"]} />
                  <Bar dataKey="volume">{chartData.map((d, i) => <Cell key={i} fill={i > 0 && d.close >= chartData[i - 1].close ? "#1f6f43" : "#7a2e2e"} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {chartData.some((d) => d.rsi != null) && (
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={chartData} margin={{ top: 4, right: 10, bottom: 0, left: 0 }} syncId="sd">
                  <CartesianGrid stroke="#1A2130" vertical={false} />
                  <XAxis dataKey="date" hide /><YAxis domain={[0, 100]} ticks={[30, 70]} tick={{ fill: "#7C879B", fontSize: 10 }} width={56} />
                  <ReferenceLine y={70} stroke="#FF572255" strokeDasharray="2 2" /><ReferenceLine y={30} stroke="#00C80555" strokeDasharray="2 2" />
                  <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} formatter={(v: number) => [v.toFixed(0), "RSI"]} />
                  <Line type="monotone" dataKey="rsi" stroke="#A855F7" dot={false} strokeWidth={1.4} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </>
        ) : (
          <div className="py-8 text-center text-sm text-[#7C879B]">{quote.status === "loading" ? "Loading…" : "No price history available for this ticker."}</div>
        )}
      </Card>

      {/* Risk-adjusted performance (computed from the displayed daily close series) */}
      {(() => {
        const rm = chartData.length ? computeRisk(chartData.map((d) => d.close)) : null;
        if (!rm) return null;
        const f = (v: number | null, dp = 2, suf = "") => v == null ? "—" : `${v.toFixed(dp)}${suf}`;
        return (
          <Card title="Risk-Adjusted Performance" sub={`From the ${period} daily close series (annualized, rf 4%)`}>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Metric label="CAGR" value={f(rm.cagr_pct, 1, "%")} />
              <Metric label="Sharpe" value={f(rm.sharpe)} />
              <Metric label="Sortino" value={f(rm.sortino)} />
              <Metric label="Calmar" value={f(rm.calmar)} />
              <Metric label="Max DD" value={rm.max_drawdown_pct == null ? "—" : `-${rm.max_drawdown_pct.toFixed(1)}%`} />
              <Metric label="Volatility" value={f(rm.volatility_pct, 1, "%")} />
              <Metric label="Current DD" value={rm.current_drawdown_pct == null ? "—" : `-${rm.current_drawdown_pct.toFixed(1)}%`} />
            </div>
          </Card>
        );
      })()}

      {/* Pillar radar */}
      <Card title="Pillar Profile" sub="Sector-relative pillar scores (0–12)">
        <ResponsiveContainer width="100%" height={240}>
          <RadarChart data={Object.entries(row.pillars).map(([k, v]) => ({ pillar: k.replace(" Revisions", " Rev"), score: v ?? 0 }))}>
            <PolarGrid stroke="#1E2632" />
            <PolarAngleAxis dataKey="pillar" tick={{ fill: "#9CA7BB", fontSize: 11 }} />
            <Radar dataKey="score" stroke="#5BA8FF" fill="#5BA8FF" fillOpacity={0.3} />
            <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} formatter={(v: number) => [v.toFixed(2), "Score"]} />
          </RadarChart>
        </ResponsiveContainer>
      </Card>

      {/* Quarterly earnings & revenue growth (YoY) */}
      {qhist.length > 0 && (
        <Card title="Quarterly Earnings & Revenue Growth (YoY)" sub="From baked quarterly fundamentals. Bars: earnings growth (green ≥0 / red <0); line: revenue growth. EPS-dollar beat/miss requires a live earnings feed (FINNHUB).">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={[...qhist].reverse().map((q) => ({ date: (q.date || "").slice(0, 7), eps: (q.earningsGrowth ?? 0) * 100, rev: (q.revenueGrowth ?? 0) * 100, _g: (q.earningsGrowth ?? 0) >= 0 }))} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#1A2130" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#7C879B", fontSize: 11 }} />
              <YAxis tick={{ fill: "#7C879B", fontSize: 11 }} width={44} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} formatter={(v: number, n) => [`${v.toFixed(1)}%`, n === "eps" ? "Earnings YoY" : "Revenue YoY"]} />
              <Bar dataKey="eps">{[...qhist].reverse().map((q, i) => <Cell key={i} fill={(q.earningsGrowth ?? 0) >= 0 ? "#1f6f43" : "#7a2e2e"} />)}</Bar>
              <Line type="monotone" dataKey="rev" stroke="#FFC107" dot={false} strokeWidth={1.6} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* AI research / earnings thesis (Gemini, on-demand) */}
      <Card title="AI Analysis" sub="LLM-generated (Gemini). Requires GEMINI_API_KEY in Vercel; otherwise shows a configure note.">
        <div className="flex gap-2">
          <button onClick={() => runAi("research")} className="rounded-md bg-[#3B82F6] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2f6fd6]">Research Note</button>
          <button onClick={() => runAi("earnings")} className="rounded-md border border-[#1E2632] px-3 py-1.5 text-sm text-[#C3CAD7] hover:bg-[#161D29]">Earnings Thesis Review</button>
        </div>
        {ai.status === "loading" && <div className="mt-2"><Spinner label="Generating…" /></div>}
        {ai.status === "done" && (ai.text
          ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#C3CAD7]">{ai.text}<span className="mt-1 block text-[10px] text-[#5C6678]">Gemini · {ai.kind} · priced at {ai.live ? "LIVE" : "baked"} {fmtMoney(ai.price)} · composite/FV/QBP baked</span></p>
          : <p className="mt-2 text-xs text-[#FFB454]">{ai.reason === "no_key" ? "Set GEMINI_API_KEY in Vercel to enable AI analysis." : `AI unavailable (${ai.reason ?? "error"}).`}</p>)}
      </Card>

      {/* FV + QBP */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Fair Value" sub={td?.fv ? `${td.fv.verdict} · ${td.fv.num_methods_used} methods` : undefined}>
          {detailLoading ? <Spinner /> : td?.fv ? (
            <div>
              <div className="mb-2 flex items-baseline gap-3">
                <span className="text-2xl font-bold" style={{ color: td.fv.verdict_color }}>{fmtMoney(td.fv.composite_fair_value)}</span>
                <span className="text-sm" style={{ color: td.fv.verdict_color }}>{fmtPct(td.fv.premium_discount_pct, 1, true)} vs price</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(td.fv.methods).map(([name, m]) => (
                    <tr key={name} className="border-t border-[#161D29]">
                      <td className="py-1.5 text-[#C3CAD7]">{name}</td>
                      <td className="py-1.5 text-right font-medium">{fmtMoney(m.fair_value)}</td>
                      <td className="py-1.5 text-right text-[#7C879B]">{fmtPct(m.premium_discount_pct, 1, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 text-xs text-[#7C879B]">North star: {td.fv.north_star_metric}</div>
            </div>
          ) : <div className="py-4 text-sm text-[#7C879B]">Fair value unavailable (insufficient data).</div>}
        </Card>

        <Card title="Quant Buy Point" sub={td?.qbp ? `${td.qbp.signal} · ${fmtPct(td.qbp.distance_pct, 1, true)} from buy point` : undefined}>
          {detailLoading ? <Spinner /> : td?.qbp ? (
            <div>
              <div className="mb-2 text-2xl font-bold" style={{ color: td.qbp.signal_color }}>{fmtMoney(td.qbp.buy_point)}</div>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(td.qbp.components).map(([name, c]) => (
                    <tr key={name} className="border-t border-[#161D29]">
                      <td className="py-1.5 text-[#C3CAD7]">{name}</td>
                      <td className="py-1.5 text-right text-[#7C879B]">{(c.weight * 100).toFixed(0)}%</td>
                      <td className="py-1.5 text-right font-medium">{fmtMoney(c.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {Object.entries(td.qbp.technicals).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-[#7C879B]">{k}</span><span className="text-[#C3CAD7]">{v}</span></div>
                ))}
              </div>
            </div>
          ) : <div className="py-4 text-sm text-[#7C879B]">Buy point unavailable (insufficient price history).</div>}
        </Card>
      </div>

      {/* pillar detail */}
      {td && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Object.entries(td.pillar_detail).map(([pillar, pd]) => (
            <Card key={pillar} title={pillar} sub={`Pillar grade ${pd.pillar_grade} · score ${pd.pillar_score?.toFixed?.(2) ?? pd.pillar_score}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-[#7C879B]">
                    <th className="py-1 text-left font-medium">Metric</th>
                    <th className="py-1 text-right font-medium">Value</th>
                    <th className="py-1 text-center font-medium">Grade</th>
                    <th className="py-1 text-right font-medium">Pctile</th>
                    <th className="py-1 text-right font-medium">Sector Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {pd.metrics.map((m) => (
                    <tr key={m.metric} className="border-t border-[#161D29]">
                      <td className="py-1.5 text-[#C3CAD7]">{m.metric}</td>
                      <td className="py-1.5 text-right">{m.value}</td>
                      <td className="py-1.5 text-center"><GradePill grade={m.grade} /></td>
                      <td className="py-1.5 text-right text-[#7C879B]">{m.percentile}</td>
                      <td className="py-1.5 text-right text-[#7C879B]">{m.sector_avg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
