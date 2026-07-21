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
  const plus7 = new Date(today.getTime() + 7 * 86400000);
  const plus14 = new Date(today.getTime() + 14 * 86400000);

  // Finnhub silently CAPS the earnings calendar at 1500 rows and truncates the
  // EARLIEST days first (observed 2026-07-21: a [today, +14d] earnings-season
  // request came back as exactly 1500 rows starting six days in the future — the
  // widget looked like it "started next Monday" while tomorrow's reporters were
  // invisible). Ask only for the 7 days the widget shows, and if a response still
  // hits the cap, split the window and refetch each half (depth-limited).
  const CAP = 1500;
  const fetchEarnings = async (from: Date, to: Date, depth = 0): Promise<any[]> => {
    const r = await tfetch(`https://finnhub.io/api/v1/calendar/earnings?from=${ymd(from)}&to=${ymd(to)}&token=${key}`);
    const rows = r?.earningsCalendar ?? null;
    if (rows == null) return depth === 0 ? [] : [];
    if (rows.length < CAP || depth >= 2 || to.getTime() - from.getTime() <= 86400000) return rows;
    const mid = new Date(from.getTime() + Math.floor((to.getTime() - from.getTime()) / 2 / 86400000) * 86400000);
    const [a, b] = await Promise.all([
      fetchEarnings(from, mid, depth + 1),
      fetchEarnings(new Date(mid.getTime() + 86400000), to, depth + 1),
    ]);
    return [...a, ...b];
  };

  const [earnRows, ipo] = await Promise.all([
    fetchEarnings(today, plus7),
    tfetch(`https://finnhub.io/api/v1/calendar/ipo?from=${ymd(today)}&to=${ymd(plus14)}&token=${key}`),
  ]);
  const earnings = earnRows.map((e: any) => ({
    symbol: (e.symbol || "").toUpperCase(), date: e.date, hour: e.hour,
    epsEstimate: e.epsEstimate, revenueEstimate: e.revenueEstimate,
  }));
  const ipos = (ipo?.ipoCalendar ?? []).map((i: any) => ({
    symbol: i.symbol, name: i.name, date: i.date, exchange: i.exchange, price: i.price,
  }));
  const ok = earnings.length > 0 || ipo != null;
  return new Response(JSON.stringify({ ok, generated_at: new Date().toISOString(), earnings, ipos }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } });
}
