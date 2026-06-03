// Edge function: live prediction-market data (Polymarket Gamma API). KEYLESS.
export const config = { runtime: "edge" };

async function tfetch(url: string, ms = 8000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { signal: ctrl.signal }); return r.ok ? r : null; }
  catch { return null; } finally { clearTimeout(t); }
}

export default async function handler() {
  const r = await tfetch("https://gamma-api.polymarket.com/markets?closed=false&limit=60&order=volume24hr&ascending=false");
  let markets: any[] = [];
  if (r) {
    try {
      const j: any = await r.json();
      const arr = Array.isArray(j) ? j : [];
      markets = arr.map((m: any) => {
        let prob: number | null = null;
        try { const op = JSON.parse(m.outcomePrices || "[]"); prob = op.length ? parseFloat(op[0]) : null; } catch { /* ignore */ }
        return {
          question: m.question, slug: m.slug,
          yes_prob: prob, volume_24h: m.volume24hr ? parseFloat(m.volume24hr) : null,
          liquidity: m.liquidity ? parseFloat(m.liquidity) : null, end_date: m.endDate,
        };
      }).filter((m: any) => m.question);
    } catch { /* ignore */ }
  }
  const body = JSON.stringify({ ok: markets.length > 0, generated_at: new Date().toISOString(), markets });
  return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=300, stale-while-revalidate=1800" } });
}
