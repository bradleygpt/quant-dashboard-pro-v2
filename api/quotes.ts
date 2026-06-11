// Edge function: batch live intraday prices (regularMarketPrice) for up to ~120
// tickers in one call. KEYLESS Yahoo v8. Used by the ML Predictions tab to rank the
// top tables off LIVE prices instead of stale baked prices (which manufacture fake
// upside in target/price-1). Price-only and bounded so we never fire 1,000+ calls.
export const config = { runtime: "edge" };
const UA = { "User-Agent": "Mozilla/5.0 (compatible; QuantDashboard/2.0)" };

async function tfetch(url: string, ms = 7000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: ctrl.signal }); return r.ok ? r : null; }
  catch { return null; } finally { clearTimeout(t); }
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const tickers = (url.searchParams.get("tickers") || "")
    .split(",").map((t) => t.trim().toUpperCase()).filter(Boolean).slice(0, 120);
  const prices: Record<string, number> = {};
  // Bounded concurrency so a big pool doesn't trip Yahoo throttling.
  const CHUNK = 12;
  for (let i = 0; i < tickers.length; i += CHUNK) {
    await Promise.all(tickers.slice(i, i + CHUNK).map(async (t) => {
      const r = await tfetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=1d&interval=1d`);
      if (!r) return;
      try {
        const j: any = await r.json();
        const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (typeof p === "number" && isFinite(p) && p > 0) prices[t] = p;
      } catch { /* skip */ }
    }));
  }
  return new Response(JSON.stringify({ ok: Object.keys(prices).length > 0, n: Object.keys(prices).length, prices }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=120, stale-while-revalidate=600" },
  });
}
