import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import FcfQuality from "../components/FcfQuality";
import StructuredReview from "../components/StructuredReview";
import AiNarrative from "../components/AiNarrative";
import IndexBadges from "../components/IndexBadges";
import { Card, GradePill, RatingBadge, Spinner, Metric, Unavailable } from "../components/ui";
import { fmtMoney, fmtPct, fmtCapB, fmtNum } from "../lib/format";
import { loadTickerDetail, loadTickerPrices, loadTickerTimeseries, type DetailTimeseries } from "../lib/data";
import type { TickerDetail, PriceSeries } from "../lib/types";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart, Bar, Cell, ComposedChart } from "recharts";
import { computeRisk } from "../lib/risk";
import { useLiveData } from "../lib/live";

interface Quote {
  ok?: boolean; price?: number | null; prevClose?: number | null; change?: number | null; changePct?: number | null;
  dayHigh?: number | null; dayLow?: number | null; rangePosition?: number | null; vwap?: number | null; volume?: number | null;
  history?: { dates: string[]; close: number[]; high: number[]; low: number[]; volume: number[] } | null;
}
const PERIODS = ["6mo", "1y", "2y", "5y", "10y", "max"];
// Indicator lookback: fetch a PADDED range (visible window + ≥200 trading days)
// so SMA-200 / RSI-14 are warmed up and span the FULL visible window, then slice
// the display back to the visible window. Without this the 200-SMA only appears
// ~200 bars in (e.g. the last ~2 months of a 1y view).
const RANGE_PAD: Record<string, { fetch: string; visibleDays: number | null }> = {
  "6mo": { fetch: "2y", visibleDays: 126 },
  "1y": { fetch: "2y", visibleDays: 252 },
  "2y": { fetch: "5y", visibleDays: 504 },
  "5y": { fetch: "10y", visibleDays: 1260 },
  "10y": { fetch: "max", visibleDays: 2520 },
  "max": { fetch: "max", visibleDays: null }, // no slice — SMA naturally warms in
};
// simple moving average (trailing n); null until enough points
function smaSeries(closes: number[], n: number): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (closes.length < n) return out;
  let s = 0;
  for (let i = 0; i < closes.length; i++) { s += closes[i]; if (i >= n) s -= closes[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}
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
  const [ts, setTs] = useState<DetailTimeseries | null>(null);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("1y");

  const ticker = selectedTicker ?? rows.find((r) => r.sector !== "ETF")?.ticker ?? null;
  const row = ticker ? byTicker.get(ticker) : null;
  // LIVE quote + history (current to today; covers tickers absent from the baked parquet)
  // fetch the padded range so indicators warm up before the visible window
  const fetchRange = RANGE_PAD[period]?.fetch ?? period;
  const quote = useLiveData<Quote>(ticker ? `/api/quote?ticker=${encodeURIComponent(ticker)}&range=${fetchRange}` : `/api/quote?ticker=`);
  const liveHist = quote.status === "ok" ? quote.data?.history ?? null : null;

  // quarterly earnings/margins history (baked) — load failure renders a visible
  // Unavailable state in the quarterly card, never a silently empty chart (audit §4)
  const [quarterly, setQuarterly] = useState<Record<string, any[]> | null>(null);
  const [quarterlyErr, setQuarterlyErr] = useState(false);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/quarterly.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setQuarterly)
      .catch(() => setQuarterlyErr(true));
  }, []);
  const qhist = ticker && quarterly ? (quarterly[ticker] ?? []) : [];

  // earnings-quality signal (heuristic over the baked review text — #11)
  const [eq, setEq] = useState<Record<string, { quality: string; reason: string }>>({});
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}data/earnings_quality.json`).then((r) => r.ok ? r.json() : null).then((j) => setEq(j?.quality ?? {})).catch(() => {}); }, []);

  // factor correlations (from build_correlations.py — #9; absent until generated → card hides)
  const [corr, setCorr] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}data/correlations_cache.json`).then((r) => r.ok ? r.json() : null).then(setCorr).catch(() => {}); }, []);

  // AI note (Gemini via /api/ai) — on-demand, degrades if no key
  const [ai, setAi] = useState<{ kind: string; status: "idle" | "loading" | "done"; text?: string; reason?: string; price?: number; live?: boolean; verdict?: string; cached?: boolean; period?: string }>({ kind: "", status: "idle" });
  // An 8-K whose figures the parser couldn't extract yields a review full of
  // "Not disclosed" fields (e.g. Intel's exhibit layout). Such a review is NOT
  // real analysis — treat it as unavailable rather than shipping an empty HOLD.
  // (Primary guard is in the bake, which excludes these from earnings_reviews.json;
  // this is the client-side safety net.)
  const isEmptyReview = (text?: string): boolean => {
    if (!text || text.trim().length < 120) return true;
    const hits = (text.match(/not disclosed|not in the provided 8-?k|not provided in|not specified|\bn\/a\b/gi) || []).length;
    return hits >= 4;
  };
  // Verdict parsing/ranking mirrors earnings_reviewer._verdict_rank
  const parseVerdict = (text: string): string | undefined => {
    const m = text.match(/VERDICT:\s*([A-Z ]+)/i);
    const v = (m ? m[1] : "").toUpperCase().trim();
    if (v.includes("BUY ON STRENGTH")) return "BUY ON STRENGTH";
    if (v.startsWith("BUY")) return "BUY";
    if (v.includes("HOLD")) return "HOLD";
    if (v.includes("TRIM")) return "TRIM";
    if (v.includes("EXIT") || v.includes("AVOID")) return "EXIT";
    return undefined;
  };
  const runAi = async (kind: "research" | "earnings") => {
    if (!row) return;
    const livePrice = quote.status === "ok" ? quote.data?.price ?? null : null;
    const usePrice = livePrice ?? row.price;
    const period = kind === "earnings" && qhist.length ? String(qhist[0]?.date ?? "").slice(0, 7) : "";
    // Cache-per-filing: same ticker + reported quarter ⇒ reuse the saved review.
    if (kind === "earnings" && period) {
      try {
        const hit = JSON.parse(localStorage.getItem(`qd_earn_review_${row.ticker}_${period}`) || "null");
        if (hit?.text) { setAi({ kind, status: "done", text: hit.text, verdict: hit.verdict, price: hit.price, live: hit.live, period, cached: true }); return; }
      } catch { /* ignore */ }
      // Pre-baked review (bake copies ai_earnings_cache.json → earnings_reviews.json),
      // so Vercel shows the SAME review as Streamlit without a live LLM key. Strict
      // no-op when the file is absent → falls through to the live /api/ai path below.
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/earnings_reviews.json`, { cache: "force-cache" });
        if (res.ok) {
          const all = await res.json();
          // Try the reported-quarter key, then the per-ticker LATEST (the bake emits
          // {TICKER}_LATEST because the filing month ≠ the reported-quarter month).
          const hit = all?.[`${row.ticker}_${period}`] ?? all?.[`${row.ticker}_LATEST`];
          // earnings_reviewer stores the body as `full_text`; tolerate aliases.
          const text = hit?.full_text ?? hit?.text ?? hit?.review ?? hit?.body;
          if (text && !isEmptyReview(text)) {
            const verdict = hit.verdict ?? parseVerdict(text);
            setAi({ kind, status: "done", text, verdict, price: usePrice ?? undefined, live: false, period, cached: true });
            return;
          }
          // entry present but unparsed (all "Not disclosed") → don't show garbage
          if (hit && isEmptyReview(text)) {
            setAi({ kind, status: "done", reason: "empty_filing", period });
            return;
          }
        }
      } catch { /* fall through to live */ }
    }
    setAi({ kind, status: "loading", period });
    // Rich, PRE-FORMATTED data blob — gives the model real substance (pillar grades, multiples,
    // margins, growth, momentum, the reported-quarter trend) and the valuation relationship already
    // computed (premium/verdict), so it never garbles price arithmetic or invents earnings figures.
    const rw = row.raw || {};
    const pf = (x?: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`); // signed — for growth/momentum (changes)
    const lf = (x?: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`); // unsigned — for margins/ROE (levels)
    const nf = (x?: number | null) => (x == null ? "—" : x.toFixed(x >= 100 ? 0 : 1));
    const prem = row.fvPremium;
    const blob = {
      name: row.name ?? "", sector: row.sector ?? "", mcapB: row.marketCapB != null ? row.marketCapB.toFixed(0) : undefined,
      score: row.composite?.toFixed(2), rating: row.rating, grades: row.grades,
      val: { fpe: nf(rw.forwardPE), pe: nf(rw.trailingPE), peg: nf(rw.pegRatio), ps: nf(rw.priceToSalesTrailing12Months) },
      prof: { gross: lf(rw.grossMargins), oper: lf(rw.operatingMargins), net: lf(rw.profitMargins), roe: lf(rw.returnOnEquity) },
      growth: { rev: pf(rw.revenueGrowth), earn: pf(rw.earningsGrowth) },
      mom: { m3: pf(rw.momentum_3m), m12: pf(rw.momentum_12m), upside: pf(rw.analyst_mean_target_upside) },
      fv: row.fv != null ? { value: row.fv.toFixed(0), premium: prem != null ? `${Math.abs(prem).toFixed(1)}%` : undefined, direction: prem != null ? (prem >= 0 ? "above" : "below") : undefined, verdict: row.fvVerdict ?? undefined } : undefined,
      qbp: row.qbpSignal ?? undefined,
      surprise: rw.earnings_surprise_pct != null ? `${rw.earnings_surprise_pct >= 0 ? "+" : ""}${rw.earnings_surprise_pct.toFixed(1)}%` : undefined,
      quarters: qhist.slice(0, 2).map((qq: { date?: string; revenueGrowth?: number | null; earningsGrowth?: number | null; grossMargins?: number | null; operatingMargins?: number | null; netMargins?: number | null }) => ({ date: String(qq.date || "").slice(0, 7), rev: pf(qq.revenueGrowth), earn: pf(qq.earningsGrowth), gross: lf(qq.grossMargins), oper: lf(qq.operatingMargins), net: lf(qq.netMargins) })),
    };
    const qs = new URLSearchParams({ ticker: row.ticker, kind, period, d: JSON.stringify(blob) });
    fetch(`/api/ai?${qs}`).then((r) => r.json()).then((d) => {
      const verdict = d.ok && kind === "earnings" ? parseVerdict(d.text || "") : undefined;
      if (d.ok && kind === "earnings" && period) {
        try { localStorage.setItem(`qd_earn_review_${row.ticker}_${period}`, JSON.stringify({ text: d.text, verdict, price: usePrice, live: livePrice != null })); } catch { /* ignore */ }
      }
      setAi({ kind, status: "done", text: d.ok ? d.text : undefined, reason: d.reason, price: usePrice ?? undefined, live: livePrice != null, verdict, period, cached: false });
    }).catch(() => setAi({ kind, status: "done", reason: "error" }));
  };
  const VERDICT_COLOR: Record<string, string> = { "BUY ON STRENGTH": "#00C805", BUY: "#8BC34A", HOLD: "#FFC107", TRIM: "#FF9800", EXIT: "#FF5722" };

  useEffect(() => {
    if (!ticker) return;
    let live = true;
    setDetailLoading(true); setTd(null); setSeries(null); setAi({ kind: "", status: "idle" }); // clear stale AI note on ticker change
    loadTickerDetail(floor, ticker).then((d) => { if (live) { setTd(d); setDetailLoading(false); } });
    loadTickerPrices(ticker).then((p) => { if (live) setSeries(p); });
    setTs(null);
    loadTickerTimeseries(ticker).then((t) => { if (live) setTs(t); });
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
    if (!src) return [] as { date: string; close: number; volume: number; rsi: number | null; sma50: number | null; sma200: number | null; fv: number | null; mfv: number | null; qbp: number | null }[];
    const rsi = rsiSeries(src.close);
    const sma50 = smaSeries(src.close, 50), sma200 = smaSeries(src.close, 200);
    const flatFv = row?.fv ?? null, flatQbp = row?.qbp ?? null;
    // Point-in-time FV/QBP per date when the timeseries shard exists; else flat
    // (today's value across the window). Dates outside the timeseries window also fall back.
    const tsMap = ts?.series?.length ? new Map(ts.series.map((p) => [p.date, p])) : null;
    const full = src.dates.map((d, i) => {
      const tp = tsMap?.get(d);
      return {
        date: d, close: src.close[i], volume: (src as any).volume?.[i] ?? 0,
        rsi: rsi[i], sma50: sma50[i], sma200: sma200[i],
        fv: tp ? (tp.fair_value ?? flatFv) : flatFv,
        // modeled PIT FV (raw, null where absent) — the distinct-methodology line
        mfv: tp?.fair_value ?? null,
        qbp: tp ? (tp.buy_point ?? flatQbp) : flatQbp,
      };
    });
    // Indicators are computed over the full padded series above; now trim the
    // DISPLAY to the visible window so SMA-200/RSI-14 span its full left edge.
    const visibleDays = RANGE_PAD[period]?.visibleDays ?? null;
    return visibleDays != null && full.length > visibleDays ? full.slice(-visibleDays) : full;
  }, [liveHist, series, ts, row?.fv, row?.qbp, period]);
  const usingTimeseries = !!ts?.series?.length;
  // FV history is withheld until the PIT-vs-live-FV reconciliation is decided; the
  // shards currently ship close + a genuine daily QBP only, with fair_value nulled.
  const hasFvHistory = !!ts?.series?.some((p) => p.fair_value != null);
  const curRsi = useMemo(() => { for (let i = chartData.length - 1; i >= 0; i--) if (chartData[i].rsi != null) return chartData[i].rsi; return null; }, [chartData]);
  const rsiLabel = curRsi == null ? null : curRsi >= 70 ? { t: "Overbought", c: "#FF5722" } : curRsi <= 30 ? { t: "Oversold", c: "#00C805" } : { t: "Neutral", c: "#FFC107" };

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
        <IndexBadges ticker={row.ticker} />
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
        sub={chartData.length ? `${usingLive ? "Live" : "Baked"} daily close through ${priceAsOf}${usingLive ? "" : " (baked price cache; live unavailable in preview)"}. ${hasFvHistory ? "Modeled FV history — point-in-time SEC filings (dim-gold dotted), a distinct methodology that differs from the live FV card (Live FV marker). Buy Point is a daily line." : usingTimeseries ? "Buy Point is a genuine daily line; Fair Value shown at today's value (history pending)." : "FV/QBP shown as today's values across the window."}` : (quote.status === "loading" ? "Loading price history…" : undefined)}>
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
                <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} labelStyle={{ color: "#9CA7BB" }} formatter={(v: number, n) => [`$${v.toFixed(2)}`, n]} />
                {/* Timeseries: visible stepped FV + daily QBP lines. Flat fallback: a single
                    horizontal ReferenceLine at today's value (with an invisible line for the tooltip). */}
                {!usingTimeseries && row.fv && <ReferenceLine y={row.fv} stroke="#FFC107" strokeDasharray="4 4" label={{ value: "FV", fill: "#FFC107", fontSize: 11 }} />}
                {!usingTimeseries && row.qbp && <ReferenceLine y={row.qbp} stroke="#00C805" strokeDasharray="4 4" label={{ value: "QBP", fill: "#00C805", fontSize: 11 }} />}
                <Line type="monotone" dataKey="close" stroke="#5BA8FF" dot={false} strokeWidth={1.6} name="Close" />
                {usingTimeseries
                  ? <>
                      {hasFvHistory
                        ? <>
                            {/* Modeled PIT FV (point-in-time SEC filings) — distinct dim-gold dotted
                                line; visually separated from the authoritative live "Live FV" marker. */}
                            <Line type="stepAfter" dataKey="mfv" stroke="#B8902B" dot={false} strokeWidth={1.2} strokeDasharray="1 3" name="Modeled FV (PIT filings)" connectNulls activeDot={false} />
                            {row.fv && <ReferenceLine y={row.fv} stroke="#FFC107" strokeDasharray="6 3" label={{ value: "Live FV", fill: "#FFC107", fontSize: 10 }} />}
                          </>
                        : <Line type="stepAfter" dataKey="fv" stroke="#FFC107" dot={false} strokeWidth={1.5} strokeDasharray="5 3" name="Fair Value" connectNulls activeDot={false} />}
                      <Line type="monotone" dataKey="qbp" stroke="#00C805" dot={false} strokeWidth={1.3} name="Buy Point" connectNulls activeDot={false} />
                    </>
                  : <>
                      {row.fv && <Line type="monotone" dataKey="fv" stroke="#FFC107" dot={false} strokeWidth={0} name="Fair Value" legendType="none" connectNulls activeDot={false} />}
                      {row.qbp && <Line type="monotone" dataKey="qbp" stroke="#00C805" dot={false} strokeWidth={0} name="Buy Point" legendType="none" connectNulls activeDot={false} />}
                    </>}
                {chartData.some((d) => d.sma50 != null) && <Line type="monotone" dataKey="sma50" stroke="#E8A33D" dot={false} strokeWidth={1} strokeDasharray="2 2" name="50-SMA" connectNulls />}
                {chartData.some((d) => d.sma200 != null) && <Line type="monotone" dataKey="sma200" stroke="#FF6B6B" dot={false} strokeWidth={1} strokeDasharray="2 2" name="200-SMA" connectNulls />}
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
              <>
              {rsiLabel && <div className="mt-1 text-[11px] text-[#7C879B]">RSI(14): <span className="font-semibold" style={{ color: rsiLabel.c }}>{curRsi!.toFixed(0)} · {rsiLabel.t}</span> <span className="text-[#5C6678]">(&gt;70 overbought · &lt;30 oversold)</span></div>}
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={chartData} margin={{ top: 4, right: 10, bottom: 0, left: 0 }} syncId="sd">
                  <CartesianGrid stroke="#1A2130" vertical={false} />
                  <XAxis dataKey="date" hide /><YAxis domain={[0, 100]} ticks={[30, 70]} tick={{ fill: "#7C879B", fontSize: 10 }} width={56} />
                  <ReferenceLine y={70} stroke="#FF572255" strokeDasharray="2 2" /><ReferenceLine y={30} stroke="#00C80555" strokeDasharray="2 2" />
                  <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} formatter={(v: number) => [v.toFixed(0), "RSI"]} />
                  <Line type="monotone" dataKey="rsi" stroke="#A855F7" dot={false} strokeWidth={1.4} connectNulls />
                </LineChart>
              </ResponsiveContainer>
              </>
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
      {quarterlyErr && <Unavailable what="Quarterly fundamentals" detail="quarterly.json failed to load — the earnings/revenue growth chart is hidden rather than silently absent." />}
      {qhist.length > 0 && (
        <Card title="Quarterly Earnings & Revenue Growth (YoY)" asOfSource="quarterly" sub="From baked quarterly fundamentals. Bars: earnings growth (green ≥0 / red <0); line: revenue growth. EPS-dollar beat/miss requires a live earnings feed (FINNHUB).">
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

      {/* AI correlation read (#9) — only when correlation data has been generated */}
      {corr && corr[row.ticker] != null && (
        <AiNarrative kind="correlation" ticker={row.ticker} blob={{ corr: corr[row.ticker] }}
          label={`AI correlation read — ${row.ticker}`}
          hint="What this name's factor correlations mean for a portfolio (hedge vs redundant risk)." />
      )}

      {/* AI research / earnings review (Gemini, on-demand) */}
      <Card title="AI Analysis" sub="LLM-generated (Gemini). Requires GEMINI_API_KEY in Vercel; otherwise shows a configure note. Earnings Review is a thesis-check against the latest 8-K (Item 2.02) earnings release, cached per reported quarter.">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => runAi("research")} className="rounded-md bg-[#3B82F6] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2f6fd6]">Research Note</button>
          <button onClick={() => runAi("earnings")} className="rounded-md border border-[#1E2632] px-3 py-1.5 text-sm text-[#C3CAD7] hover:bg-[#161D29]">AI Earnings Review</button>
          <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${encodeURIComponent(row.ticker)}&type=8-K&dateb=&owner=include&count=20`} target="_blank" rel="noreferrer"
            className="rounded-md border border-[#1E2632] px-3 py-1.5 text-sm text-[#5BA8FF] hover:bg-[#161D29]">SEC 8-K filings ↗</a>
        </div>
        {ai.status === "loading" && <div className="mt-2"><Spinner label="Generating…" /></div>}
        {ai.status === "done" && (ai.text
          ? <div className="mt-2">
              {ai.kind === "earnings" && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {ai.verdict && <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ color: VERDICT_COLOR[ai.verdict] ?? "#9CA7BB", background: `${VERDICT_COLOR[ai.verdict] ?? "#9CA7BB"}22`, border: `1px solid ${VERDICT_COLOR[ai.verdict] ?? "#9CA7BB"}55` }}>VERDICT: {ai.verdict}</span>}
                  {(() => { const qm = eq[`${row.ticker}_${ai.period}`] || eq[`${row.ticker}_LATEST`]; if (!qm) return null; const c = qm.quality === "High" ? "#00C805" : qm.quality === "Low" ? "#FF5722" : "#FFC107"; return <span title={qm.reason} className="cursor-help rounded px-2 py-0.5 text-xs font-semibold" style={{ color: c, background: `${c}22`, border: `1px solid ${c}55` }}>Quality: {qm.quality}</span>; })()}
                  {ai.period && <span className="text-[11px] text-[#7C879B]">8-K thesis-check · reported quarter ~{ai.period}</span>}
                  {ai.cached && <span className="rounded-full bg-[#1A2130] px-2 py-0.5 text-[10px] text-[#9CA7BB]">cached for this filing</span>}
                </div>
              )}
              <StructuredReview text={ai.text} />
              <span className="mt-1 block text-[10px] text-[#5C6678]">Gemini · {ai.kind} · priced at {ai.live ? "LIVE" : "baked"} {fmtMoney(ai.price)} · composite/FV/QBP baked{ai.kind === "earnings" ? " · source: SEC EDGAR 8-K (linked above)" : ""}</span>
            </div>
          : <p className="mt-2 text-xs text-[#FFB454]">{
              ai.reason === "empty_filing"
                ? "8-K format not parsed for this quarter — review unavailable (the filing's figures weren't machine-extractable)."
              : ai.reason === "no_key"
                ? (ai.kind === "earnings"
                    ? "Earnings review pending next bake — Vercel serves pre-baked reviews (no live LLM). Generate it in the local Streamlit app and it ships on the next bake."
                    : "Set GEMINI_API_KEY in Vercel to enable AI analysis.")
              : `AI unavailable (${ai.reason ?? "error"}).`}</p>)}
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
              {/* FV-by-method bar chart vs current price (source parity) */}
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={Object.entries(td.fv.methods).map(([name, m]) => ({ name, fv: m.fair_value }))} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#1A2130" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#7C879B", fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={48} />
                  <YAxis tick={{ fill: "#7C879B", fontSize: 11 }} width={48} tickFormatter={(v) => `$${Math.round(v)}`} />
                  <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} formatter={(v: number) => [fmtMoney(v), "Fair value"]} />
                  <ReferenceLine y={td.fv.current_price} stroke="#FF6B6B" strokeDasharray="4 3" label={{ value: `Current ${fmtMoney(td.fv.current_price, 0)}`, fill: "#FF6B6B", fontSize: 9, position: "insideTopRight" }} />
                  <ReferenceLine y={td.fv.composite_fair_value} stroke="#00D4AA" strokeDasharray="4 3" label={{ value: `Fair ${fmtMoney(td.fv.composite_fair_value, 0)}`, fill: "#00D4AA", fontSize: 9, position: "insideBottomRight" }} />
                  <Bar dataKey="fv" fill="#4ECDC4" />
                </BarChart>
              </ResponsiveContainer>
              <table className="mt-2 w-full text-sm">
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
              <div className="mb-2 flex items-center gap-3">
                <span className="text-2xl font-bold" style={{ color: td.qbp.signal_color }}>{fmtMoney(td.qbp.buy_point)}</span>
                <span className="rounded px-2 py-0.5 text-xs font-semibold" style={{ color: td.qbp.signal_color, background: `${td.qbp.signal_color}22`, border: `1px solid ${td.qbp.signal_color}55` }}>{td.qbp.signal}</span>
              </div>
              {/* Signal-strength meter — closer to/below the buy point = stronger */}
              {(() => {
                const d = td.qbp.distance_pct;
                const strength = d <= 0 ? 100 : d < 3 ? 85 : d < 8 ? 60 : d < 15 ? 35 : 12;
                return (
                  <div className="mb-3">
                    <div className="flex justify-between text-[11px] text-[#7C879B]"><span>Signal strength</span><span style={{ color: td.qbp.signal_color }}>{strength}/100 · {fmtPct(d, 1, true)} from buy point</span></div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#1A2130]"><div className="h-full rounded-full" style={{ width: `${strength}%`, background: td.qbp.signal_color }} /></div>
                  </div>
                );
              })()}
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

      {/* FCF quality / SBC distortion */}
      <FcfQuality ticker={ticker} />

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
