// Edge function: earnings + IPO calendar (Finnhub). Requires FINNHUB_API_KEY
// (referenced by name only). If the key is absent or the API errors, returns
// { ok:false } and the Home tab shows a clean "add FINNHUB_API_KEY" note —
// never crashes. The client filters earnings to the tracked universe.
export const config = { runtime: "edge" };

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

async function tfetch(url: string, ms = 9000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { signal: ctrl.signal }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}

export default async function handler() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ ok: false, reason: "no_key", needs: "FINNHUB_API_KEY" }),
      { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=60" } });
  }
  const today = new Date();
  const plus14 = new Date(today.getTime() + 14 * 86400000);
  const [earn, ipo] = await Promise.all([
    tfetch(`https://finnhub.io/api/v1/calendar/earnings?from=${ymd(today)}&to=${ymd(plus14)}&token=${key}`),
    tfetch(`https://finnhub.io/api/v1/calendar/ipo?from=${ymd(today)}&to=${ymd(plus14)}&token=${key}`),
  ]);
  const earnings = (earn?.earningsCalendar ?? []).map((e: any) => ({
    symbol: (e.symbol || "").toUpperCase(), date: e.date, hour: e.hour,
    epsEstimate: e.epsEstimate, revenueEstimate: e.revenueEstimate,
  }));
  const ipos = (ipo?.ipoCalendar ?? []).map((i: any) => ({
    symbol: i.symbol, name: i.name, date: i.date, exchange: i.exchange, price: i.price,
  }));
  const ok = earn != null || ipo != null;
  return new Response(JSON.stringify({ ok, generated_at: new Date().toISOString(), earnings, ipos }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } });
}
