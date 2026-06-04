// Edge function: raw series for the Pullback Pressure Index (c78q PPI).
// KEYLESS — Yahoo chart API. Returns SPY 2y daily + ^VIX 6mo + ^VVIX 6mo close
// series; lib/ppi.ts computes the 7-component PPI client-side (breadth is computed
// from the app's baked universe, not here). ^VVIX is fetched here for the first time.
export const config = { runtime: "edge" };

const UA = { "User-Agent": "Mozilla/5.0 (compatible; QuantDashboard/2.0)" };

async function tfetch(url: string, ms = 9000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: ctrl.signal }); return r.ok ? r : null; }
  catch { return null; } finally { clearTimeout(t); }
}

async function yahooCloses(symbol: string, range: string): Promise<{ dates: string[]; close: number[] } | null> {
  const r = await tfetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`);
  if (!r) return null;
  try {
    const j: any = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const cl: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    const dates: string[] = [], close: number[] = [];
    for (let i = 0; i < ts.length; i++) if (typeof cl[i] === "number" && isFinite(cl[i] as number)) { dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10)); close.push(cl[i] as number); }
    return close.length ? { dates, close } : null;
  } catch { return null; }
}

export default async function handler() {
  const [spy, vix, vvix] = await Promise.all([
    yahooCloses("SPY", "2y"),
    yahooCloses("^VIX", "6mo"),
    yahooCloses("^VVIX", "6mo"),
  ]);
  const body = JSON.stringify({
    ok: !!spy, generated_at: new Date().toISOString(),
    spy, vix, vvix,
  });
  return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=900, stale-while-revalidate=3600" } });
}
