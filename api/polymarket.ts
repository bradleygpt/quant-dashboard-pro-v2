// Edge function: live prediction markets (Polymarket Gamma API). KEYLESS.
// Goal: macro/event-probability markets relevant to equities — NOT a political
// betting feed. Two mechanisms (in order):
//  1) DEDUPE to one row per EVENT (multi-candidate elections were exploding into
//     dozens of near-identical rows sharing the same event volume). Show the
//     leading outcome + outcome count.
//  2) A SMALL, fixed macro-relevance keyword filter on title+tags.
// Plus the existing sports/entertainment tag exclusion.
export const config = { runtime: "edge" };

// short, durable list of macro themes that actually move equities (substring, case-insensitive)
const MACRO = ["fed", "interest rate", "rate cut", "rate hike", "rate decision", "fomc", "cpi", "inflation",
  "recession", "gdp", "unemployment", "jobs report", "s&p 500", "s&p500", "nasdaq", "dow jones",
  "bitcoin", "ethereum", "tariff", "debt ceiling", "government shutdown"];
const DENY = new Set(["sports", "soccer", "nba", "nfl", "mlb", "nhl", "basketball", "baseball", "hockey",
  "football", "tennis", "golf", "ufc", "mma", "boxing", "esports", "games", "counter-strike-2", "valorant",
  "league-of-legends", "dota", "pop-culture", "mentions", "fifa-world-cup", "nascar", "f1", "cricket",
  "olympics", "entertainment", "movies", "music", "awards"]);

async function tfetch(url: string, ms = 9000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { signal: ctrl.signal }); return r.ok ? r : null; }
  catch { return null; } finally { clearTimeout(t); }
}
const parseYes = (m: any): number | null => {
  try { const op = JSON.parse(m.outcomePrices || "[]"); return op.length ? parseFloat(op[0]) : null; } catch { return null; }
};

export default async function handler() {
  const r = await tfetch("https://gamma-api.polymarket.com/events?closed=false&limit=300&order=volume24hr&ascending=false");
  const rows: any[] = [];
  if (r) {
    try {
      const events: any[] = await r.json();
      for (const ev of Array.isArray(events) ? events : []) {
        const tags = (ev.tags || []).map((t: any) => (t.slug || t.label || "").toLowerCase());
        if (tags.some((t: string) => DENY.has(t))) continue;                 // exclude sports/entertainment
        const hay = `${ev.title || ""} ${tags.join(" ")}`.toLowerCase();
        const matched = MACRO.find((k) => hay.includes(k));
        if (!matched) continue;                                              // macro-relevance gate

        const mkts = (ev.markets || []).filter((m: any) => !m.closed && m.question);
        if (!mkts.length) continue;
        // ONE row per event: leading outcome = market with the highest YES probability
        let leading = mkts[0], leadProb = parseYes(mkts[0]) ?? -1;
        for (const m of mkts) { const p = parseYes(m); if (p != null && p > leadProb) { leadProb = p; leading = m; } }
        rows.push({
          question: ev.title || leading.question,
          leading_outcome: mkts.length > 1 ? (leading.groupItemTitle || leading.question) : null,
          yes_prob: leadProb >= 0 ? leadProb : null,
          n_outcomes: mkts.length,
          category: matched,
          volume_24h: ev.volume24hr != null ? parseFloat(ev.volume24hr) : null,
          liquidity: ev.liquidity != null ? parseFloat(ev.liquidity) : null,
          end_date: ev.endDate,
        });
      }
    } catch { /* ignore */ }
  }
  rows.sort((a, b) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0));
  const body = JSON.stringify({ ok: rows.length > 0, generated_at: new Date().toISOString(), markets: rows.slice(0, 40) });
  return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=300, stale-while-revalidate=1800" } });
}
