// Edge function: AI research note / earnings-thesis review (Gemini). Requires
// GEMINI_API_KEY (referenced by name only). Absent key or API error → { ok:false,
// reason:"no_key" } and the UI shows a "configure GEMINI_API_KEY" note. Never throws.
export const config = { runtime: "edge" };

const MODEL = "gemini-2.5-flash-lite";

export default async function handler(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  const url = new URL(req.url);
  const p = Object.fromEntries(url.searchParams.entries());
  const ticker = (p.ticker || "").toUpperCase();
  const kind = p.kind === "earnings" ? "earnings" : "research";
  if (!ticker) return json({ ok: false, reason: "no_ticker" });
  if (!key) return json({ ok: false, reason: "no_key", needs: "GEMINI_API_KEY" });

  const priceLabel = p.price_live === "1" ? "current LIVE price" : "current price";
  const period = p.period || ""; // latest reported fiscal quarter, e.g. "2026-03"
  const ctx = `Ticker ${ticker} (${p.name || ""}), sector ${p.sector || "?"}, quant composite ${p.score || "?"}/12, rating ${p.rating || "?"}, ${priceLabel} $${p.price || "?"}, fair value $${p.fv || "?"}, quant buy point $${p.qbp || "?"}. (Composite/fair value/buy point are from the daily quant pipeline; the price is the live quote.)`;
  const prompt = kind === "earnings"
    ? `You are an equity analyst reviewing ${ticker}'s most recent quarterly earnings release (8-K Item 2.02${period ? `, latest reported period ~${period}` : ""}) as a thesis-check against prior guidance. In ~150 words, assess whether the latest reported results and forward guidance support the current quant rating — call out revenue/EPS trajectory, margins, and any guidance change. Be specific and balanced. Then, on its OWN final line, output exactly: "VERDICT: X" where X is one of BUY ON STRENGTH, BUY, HOLD, TRIM, EXIT.`
    : `You are an equity research analyst. Write a concise (~180 word) research note on ${ticker} given: ${ctx} Cover the bull case, bear case, and key risk. Neutral, factual tone. No disclaimers.`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 600 } }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return json({ ok: false, reason: `api_${r.status}` });
    const d: any = await r.json();
    const text = d?.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join("") || "";
    return json({ ok: !!text, ticker, kind, text, provider: "gemini", model: MODEL });
  } catch (e: any) {
    return json({ ok: false, reason: `error_${e?.name || "unknown"}` });
  }
}
function json(o: unknown) {
  return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } });
}
