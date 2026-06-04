// Edge function: real buy-and-hold SPY monthly history (total return via adjusted
// close). KEYLESS Yahoo. Used by the c78q Backtest chart as the SPY benchmark,
// because the c78q dataset's bundled spy_return field is not buy-and-hold SPY
// (it compounds to ~32% CAGR — an artifact of the upstream ETL's relative series).
export const config = { runtime: "edge" };
const UA = { "User-Agent": "Mozilla/5.0 (compatible; QuantDashboard/2.0)" };

export default async function handler() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=max&interval=1mo", { headers: UA, signal: ctrl.signal });
    if (!r.ok) return json({ ok: false });
    const j: any = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const adj: (number | null)[] = res?.indicators?.adjclose?.[0]?.adjclose ?? res?.indicators?.quote?.[0]?.close ?? [];
    const months: string[] = [], close: number[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (typeof adj[i] === "number" && isFinite(adj[i] as number)) {
        months.push(new Date(ts[i] * 1000).toISOString().slice(0, 7)); // YYYY-MM
        close.push(adj[i] as number);
      }
    }
    return json({ ok: close.length > 0, months, close });
  } catch {
    return json({ ok: false });
  } finally {
    clearTimeout(t);
  }
}
function json(o: unknown) {
  return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" } });
}
