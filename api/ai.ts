// Edge function: AI research note / earnings-thesis review (Gemini). Requires GEMINI_API_KEY
// (referenced by name only). Absent key or API error → { ok:false, reason:"no_key" } and the UI
// shows a configure note. Never throws.
//
// Depth + correctness: the client passes a pre-formatted data blob `d` (pillar grades, valuation
// multiples, margins, growth, momentum, the PRE-COMPUTED fair-value premium/verdict, and the real
// reported-quarter trend). The model is told to use these figures verbatim and never to recompute
// prices (LLMs garble arithmetic — the old prompt handed raw price+FV and produced "$133.99 above
// $715.97") or invent earnings numbers it wasn't given.
export const config = { runtime: "edge" };

const MODEL = "gemini-2.5-flash-lite";

type Blob = {
  name?: string; sector?: string; mcapB?: string; score?: string; rating?: string;
  grades?: Record<string, string>;
  val?: { fpe?: string; pe?: string; peg?: string; ps?: string };
  prof?: { gross?: string; oper?: string; net?: string; roe?: string };
  growth?: { rev?: string; earn?: string };
  mom?: { m3?: string; m12?: string; upside?: string };
  fv?: { value?: string; premium?: string; direction?: string; verdict?: string };
  qbp?: string; surprise?: string;
  quarters?: { date: string; rev: string; earn: string; gross?: string; oper?: string; net?: string }[];
  // runtime-kind payloads (screener / doppelganger / portfolio / correlation)
  query?: string;
  analogs?: unknown; fwd?: unknown;
  tilts?: unknown; concentration?: unknown; diversifiers?: unknown; nHoldings?: number;
  corr?: unknown;
};

export default async function handler(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  const url = new URL(req.url);
  const p = Object.fromEntries(url.searchParams.entries());
  const ticker = (p.ticker || "").toUpperCase();
  const TICKER_KINDS = ["earnings", "research", "doppelganger", "correlation"];
  const kind = [...TICKER_KINDS, "screener", "portfolio"].includes(p.kind) ? p.kind : "research";
  const period = p.period || "";
  if (!key) return json({ ok: false, reason: "no_key", needs: "GEMINI_API_KEY" });
  if (TICKER_KINDS.includes(kind) && !ticker) return json({ ok: false, reason: "no_ticker" });

  let d: Blob = {};
  try { d = p.d ? JSON.parse(p.d) : {}; } catch { d = {}; }
  const g = d.grades || {};
  const q0 = d.quarters?.[0], q1 = d.quarters?.[1];

  const block = [
    `${ticker} (${d.name || ""}) — ${d.sector || "?"} · market cap $${d.mcapB || "?"}B · quant composite ${d.score || "?"}/12 (${d.rating || "?"})`,
    `Pillar grades — Valuation ${g.Valuation || "?"}, Growth ${g.Growth || "?"}, Profitability ${g.Profitability || "?"}, Momentum ${g.Momentum || "?"}, EPS Revisions ${g["EPS Revisions"] || "?"}`,
    `Valuation — fwd P/E ${d.val?.fpe || "—"}, trailing P/E ${d.val?.pe || "—"}, PEG ${d.val?.peg || "—"}, P/S ${d.val?.ps || "—"}`,
    `Profitability — gross ${d.prof?.gross || "—"}, operating ${d.prof?.oper || "—"}, net ${d.prof?.net || "—"}, ROE ${d.prof?.roe || "—"}`,
    `Growth — revenue ${d.growth?.rev || "—"} YoY, earnings ${d.growth?.earn || "—"} YoY`,
    `Momentum — 3M ${d.mom?.m3 || "—"}, 12M ${d.mom?.m12 || "—"}; analyst mean-target upside ${d.mom?.upside || "—"}`,
    d.fv?.value ? `Fair value $${d.fv.value}: the stock trades ${d.fv.premium || "?"} ${d.fv.direction || ""} fair value — verdict ${d.fv.verdict || "?"}.` : "",
    d.qbp ? `Quant buy-point signal: ${d.qbp}.` : "",
    q0 ? `Reported quarter ${q0.date}: revenue ${q0.rev} YoY, earnings ${q0.earn} YoY, gross margin ${q0.gross || "—"}, operating margin ${q0.oper || "—"}, net margin ${q0.net || "—"}.` : "",
    q1 ? `Prior quarter ${q1.date}: revenue ${q1.rev} YoY, earnings ${q1.earn} YoY.` : "",
    d.surprise ? `Latest analyst earnings surprise: ${d.surprise}.` : "",
  ].filter(Boolean).join("\n");

  const prompt = kind === "earnings"
    ? `You are an equity analyst reviewing ${ticker}'s most recent reported quarter${period ? ` (~${period})` : ""}.

DATA — the ONLY figures you may cite (baked fundamentals; you do NOT have the full 8-K text):
${block}

Produce a review with EXACTLY these section headers, each on its own line (uppercase), matching this structure:

VERDICT: [BUY ON STRENGTH | BUY | HOLD | TRIM | EXIT]
[2 sentences: why this verdict, tied to the reported trajectory + valuation.]

HEADLINE
[1-2 sentences: the single most important fact about this quarter.]

KEY METRICS
- Revenue: [YoY growth from the data]
- Earnings: [YoY growth from the data]
- Margins: [gross / operating / net from the data]

GUIDANCE
- [Forward guidance is NOT in the baked data — write exactly: "Not available in the baked fundamentals — see the 8-K filing." Do NOT invent guidance numbers.]

THESIS CHECK
[Compare the latest quarter to the prior quarter shown above — state the revenue and earnings deltas explicitly.]

CALLOUTS
- [2-3 bullets grounded ONLY in the metrics above: margin trend, growth acceleration/deceleration, and the valuation premium/verdict.]

BOTTOM LINE
[1-2 sentences: net effect on the thesis.]

Cite only the figures above; never invent revenue, EPS, margin, segment, or guidance numbers. Keep it under ~230 words.`
    : `You are a senior equity analyst. Write a 4-paragraph research note on ${ticker}.

DATA (quant pipeline + filings — use these figures; do not recompute prices or invent numbers):
${block}

Write 4 paragraphs (no headers, no bullet points, no em-dashes):
1) Thesis — what is working, citing the strong pillar grades and specific metrics above (margins, growth, momentum).
2) Risks — honest and specific to this name, citing the weak grades/metrics.
3) Valuation — is the price justified? Use the stated fair-value premium/discount and verdict verbatim; do NOT recompute or restate raw prices.
4) Bottom line — a clear stance with a timeframe.
~320 words. Write in a Morgan Stanley analyst voice, not marketing copy. Every claim must trace to the data above.`;

  // runtime kinds override the per-stock prompt above (small payloads — the LLM parses/narrates,
  // never crunches the universe; integrity: only the provided data is cited).
  let finalPrompt = prompt;
  if (kind === "screener") {
    finalPrompt = `Convert a plain-English stock screen into filter criteria. User query: "${d.query || ""}".
Return ONLY JSON (no prose): {"filters":{"minComposite":<0-12|null>,"ratingMin":<"Strong Buy+"|"Strong Buy"|"Buy"|"Hold"|null>,"sectors":[<exact sector names>],"fvVerdict":<"Deeply Undervalued"|"Undervalued"|"Fairly Valued"|"Overvalued"|null>,"gradeMin":{"Valuation":<"A".."F"|null>,"Growth":<same|null>,"Profitability":<same|null>,"Momentum":<same|null>}},"explain":"<one sentence>"}
Hints: cheap/undervalued -> fvVerdict or a low Valuation requirement; growth -> Growth grade ~"B+"; quality/profitable -> Profitability; momentum/leaders -> Momentum; "buy-rated" -> ratingMin. Use null for anything not implied.`;
  } else if (kind === "doppelganger") {
    finalPrompt = `Historical analogues for ${ticker} (closest by valuation/growth/momentum fingerprint) and their forward returns: ${JSON.stringify(d.analogs || []).slice(0, 1400)}. Aggregate forward-return stats: ${JSON.stringify(d.fwd || {})}.
In 2-3 sentences: what the analogues imply for ${ticker} (central tendency + dispersion/risk) and what historically separated winners from losers in this cluster. Use ONLY the analogues/returns given; never invent tickers or figures.`;
  } else if (kind === "portfolio") {
    finalPrompt = `Portfolio book: sector tilts ${JSON.stringify(d.tilts || {})}; top concentrations ${JSON.stringify(d.concentration || [])}; ${d.nHoldings ?? "?"} holdings; strongest-rated uncorrelated sectors available: ${JSON.stringify(d.diversifiers || [])}.
In 2-3 sentences give actionable rebalance reasoning: where the book is over/under-exposed and which uncorrelated, strong-quant sectors could diversify it. Use ONLY the data given; never invent figures.`;
  } else if (kind === "correlation") {
    finalPrompt = `Explain in 2 plain-English sentences what ${ticker}'s factor correlations mean for a portfolio: ${JSON.stringify(d.corr || {})}. e.g. "0.7 to gold means it tends to move with gold — a hedge, or redundant if you already hold gold." Use ONLY the values given; never invent numbers.`;
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 22000);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: finalPrompt }] }], generationConfig: { temperature: kind === "screener" ? 0.1 : 0.45, maxOutputTokens: 900 } }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return json({ ok: false, reason: `api_${r.status}` });
    const data: any = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join("") || "";
    return json({ ok: !!text, ticker, kind, text, provider: "gemini", model: MODEL });
  } catch (e: any) {
    return json({ ok: false, reason: `error_${e?.name || "unknown"}` });
  }
}
function json(o: unknown) {
  return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } });
}
