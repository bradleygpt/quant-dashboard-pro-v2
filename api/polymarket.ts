// Edge function: live prediction-market data (Polymarket Gamma API). KEYLESS.
// Filters to relevant categories (politics / economics / finance / crypto /
// geopolitics) via event tags and EXCLUDES sports/esports/games/pop-culture,
// matching the source's intent (the markets endpoint has no category field, so
// we use the /events endpoint which carries tag slugs).
export const config = { runtime: "edge" };

const ALLOW = new Set(["politics", "economy", "economics", "business", "finance", "crypto", "bitcoin",
  "ethereum", "elections", "fed", "fed-rates", "inflation", "interest-rates", "geopolitics", "world",
  "trade", "stocks", "recession", "gdp", "tariffs", "us-presidential-election", "global-elections"]);
const DENY = new Set(["sports", "soccer", "nba", "nfl", "mlb", "nhl", "basketball", "baseball", "hockey",
  "football", "tennis", "golf", "ufc", "mma", "boxing", "esports", "games", "counter-strike-2", "valorant",
  "league-of-legends", "dota", "pop-culture", "mentions", "fifa-world-cup", "nascar", "f1", "cricket",
  "olympics", "entertainment", "movies", "music"]);

async function tfetch(url: string, ms = 9000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { signal: ctrl.signal }); return r.ok ? r : null; }
  catch { return null; } finally { clearTimeout(t); }
}

export default async function handler() {
  const r = await tfetch("https://gamma-api.polymarket.com/events?closed=false&limit=200&order=volume24hr&ascending=false");
  const markets: any[] = [];
  if (r) {
    try {
      const events: any[] = await r.json();
      for (const ev of Array.isArray(events) ? events : []) {
        const tags = (ev.tags || []).map((t: any) => (t.slug || t.label || "").toLowerCase());
        if (tags.some((t: string) => DENY.has(t))) continue;       // exclude sports/etc.
        if (!tags.some((t: string) => ALLOW.has(t))) continue;     // require a relevant tag
        const category = tags.find((t: string) => ALLOW.has(t)) || "other";
        for (const m of ev.markets || []) {
          if (m.closed) continue;
          let prob: number | null = null;
          try { const op = JSON.parse(m.outcomePrices || "[]"); prob = op.length ? parseFloat(op[0]) : null; } catch { /* */ }
          const vol = m.volume24hr != null ? parseFloat(m.volume24hr) : (ev.volume24hr != null ? parseFloat(ev.volume24hr) : null);
          if (!m.question) continue;
          markets.push({ question: m.question, category, yes_prob: prob, volume_24h: vol,
            liquidity: m.liquidity ? parseFloat(m.liquidity) : null, end_date: m.endDate || ev.endDate });
        }
      }
    } catch { /* ignore */ }
  }
  markets.sort((a, b) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0));
  const body = JSON.stringify({ ok: markets.length > 0, generated_at: new Date().toISOString(), markets: markets.slice(0, 50) });
  return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=300, stale-while-revalidate=1800" } });
}
