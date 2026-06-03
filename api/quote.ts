// Edge function: LIVE per-ticker quote + recent daily history (KEYLESS Yahoo).
// The Stock Detail price chart is driven by THIS (current to today, like the
// Streamlit source) — not the baked parquet (which is a stale scoring snapshot
// ending 2026-05-04 and missing recent listings). Degrades gracefully.
export const config = { runtime: "edge" };

const UA = { "User-Agent": "Mozilla/5.0 (compatible; QuantDashboard/2.0)" };
async function tfetch(url: string, ms = 9000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: ctrl.signal }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  const range = url.searchParams.get("range") || "1y";
  if (!ticker) return new Response(JSON.stringify({ ok: false, reason: "no_ticker" }), { headers: { "Content-Type": "application/json" } });

  const enc = encodeURIComponent(ticker);
  const [daily, intraday] = await Promise.all([
    tfetch(`https://query1.finance.yahoo.com/v8/finance/chart/${enc}?range=${range}&interval=1d`),
    tfetch(`https://query1.finance.yahoo.com/v8/finance/chart/${enc}?range=1d&interval=1m`),
  ]);

  const dres = daily?.chart?.result?.[0];
  let history: any = null;
  if (dres?.timestamp) {
    const q = dres.indicators?.quote?.[0] || {};
    const dates: string[] = [], close: number[] = [], high: number[] = [], low: number[] = [], volume: number[] = [];
    for (let i = 0; i < dres.timestamp.length; i++) {
      const c = q.close?.[i];
      if (typeof c === "number" && isFinite(c)) {
        dates.push(new Date(dres.timestamp[i] * 1000).toISOString().slice(0, 10));
        close.push(c); high.push(q.high?.[i] ?? c); low.push(q.low?.[i] ?? c); volume.push(q.volume?.[i] ?? 0);
      }
    }
    if (close.length) history = { dates, close, high, low, volume };
  }

  // quote from daily meta; VWAP + intraday range from 1m bars
  const meta = dres?.meta || intraday?.chart?.result?.[0]?.meta || {};
  let vwap: number | null = null, dayHigh: number | null = meta.regularMarketDayHigh ?? null, dayLow: number | null = meta.regularMarketDayLow ?? null;
  const ires = intraday?.chart?.result?.[0];
  if (ires?.timestamp) {
    const iq = ires.indicators?.quote?.[0] || {};
    let pv = 0, vv = 0, hi = -Infinity, lo = Infinity;
    for (let i = 0; i < ires.timestamp.length; i++) {
      const c = iq.close?.[i], v = iq.volume?.[i] ?? 0, h = iq.high?.[i], l = iq.low?.[i];
      if (typeof c === "number" && isFinite(c)) {
        const tp = (typeof h === "number" && typeof l === "number") ? (h + l + c) / 3 : c;
        pv += tp * v; vv += v; if (h > hi) hi = h; if (l < lo) lo = l;
      }
    }
    if (vv > 0) vwap = pv / vv;
    if (hi > -Infinity) dayHigh = dayHigh ?? hi;
    if (lo < Infinity) dayLow = dayLow ?? lo;
  }
  const price = meta.regularMarketPrice ?? (history ? history.close[history.close.length - 1] : null);
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const change = price != null && prevClose != null ? price - prevClose : null;
  const changePct = change != null && prevClose ? (change / prevClose) * 100 : null;
  const rangePosition = price != null && dayHigh != null && dayLow != null && dayHigh > dayLow ? (price - dayLow) / (dayHigh - dayLow) * 100 : null;

  const ok = price != null || history != null;
  return new Response(JSON.stringify({
    ok, ticker, generated_at: new Date().toISOString(),
    price, prevClose, change, changePct, dayHigh, dayLow, rangePosition, vwap,
    volume: meta.regularMarketVolume ?? null, history,
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=120, stale-while-revalidate=900" } });
}
