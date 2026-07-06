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
const FALLBACK_MODEL = "gemini-2.5-flash"; // used only after the lite tier keeps 503-ing (both free tier)
const TRANSIENT = new Set([429, 500, 502, 503, 504]); // retry-worthy: overload / transient upstream errors
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Earnings-review validation (mirrors earnings_reviewer.validate_review_text). A bracketed fragment
// carrying instruction words = the model echoed the skeleton; guided==actual = a self-referential thesis.
const BRACKET_LEAK = /\[[^\]]*?(bullet|sentence|disclosed|e\.g\.|insert|specific number|one of\s*:|if known|if given|X\.X|Y%|placeholder|most important|net effect)[^\]]*?\]/i;
const scrubReview = (t: string): string => t.split("\n").filter((l) => !BRACKET_LEAK.test(l.trim())).join("\n").trim();
const earningsReliable = (t: string): boolean => {
  if (!t || t.trim().length < 120) return false;
  if (BRACKET_LEAK.test(t) || /\$?X\.X{1,2}\b|\bY%/i.test(t)) return false; // leftover placeholders
  const m = t.match(/guided[^.;:\n]*?\$?([\d,]+(?:\.\d+)?)[^.;:\n]*?actual[^.;:\n]*?\$?([\d,]+(?:\.\d+)?)/i);
  if ((m && m[1] === m[2]) || /variance\s+(?:of\s+)?0(?:\.0+)?\s*%/i.test(t)) return false; // thesis vs itself
  const req = ["VERDICT", "HEADLINE", "KEY METRICS", "GUIDANCE", "THESIS CHECK", "BOTTOM LINE"];
  return req.filter((s) => new RegExp(`^[ \\t>#*\\-]*${s}\\b`, "im").test(t)).length >= 4; // tolerate **markdown** headers

};

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
    ? `You are an equity analyst reviewing ${ticker}'s most recent reported quarter${period ? `, as of ${period}` : ""}.

DATA — the ONLY figures you may cite (baked quant fundamentals; you do NOT have the 8-K text, and you have NO other knowledge of this company):
${block}

RULES (mandatory):
- Use ONLY the DATA above. Do NOT use any memory of ${ticker} — its products, executives, or past fiscal years. If a fact is not in the DATA, write "not in the provided data".
- Never state a fiscal year, dollar revenue, EPS, or segment figure that is not in the DATA. The period is ${period || "the latest quarter in the DATA"}.
- Output ONLY the finished review. Never output square brackets [ ], the word "insert", or any placeholder/instruction text — replace every field with a real value or "not in the provided data".

Write these sections, each header on its own UPPERCASE line, then finished prose:

VERDICT: one of BUY ON STRENGTH / BUY / HOLD / TRIM / EXIT
Two sentences on why, tied to the DATA's growth trajectory and valuation verdict.

HEADLINE
One sentence: the most important fact in the DATA this quarter.

KEY METRICS
- Revenue: the revenue YoY figure from the DATA (or "not in the provided data").
- Earnings: the earnings YoY figure from the DATA.
- Margins: gross / operating / net from the DATA.

GUIDANCE
Forward guidance is not in the baked data. Write exactly: "Not in the baked fundamentals — see the 8-K filing." Do not invent guidance.

THESIS CHECK
Compare THIS quarter's revenue and earnings YoY to the PRIOR quarter's figures shown in the DATA, and state both. If the DATA shows only one quarter, write exactly "Only one quarter in the data — no prior-quarter comparison." Never compare a figure to itself.

CALLOUTS
Two or three bullets grounded ONLY in the DATA: margin trend, growth acceleration/deceleration, valuation premium/verdict.

BOTTOM LINE
One or two sentences: net effect on the thesis.

Keep it under ~230 words.`
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

  const body = JSON.stringify({ contents: [{ parts: [{ text: finalPrompt }] }], generationConfig: { temperature: kind === "screener" ? 0.1 : 0.45, maxOutputTokens: 900 } });
  const callModel = async (model: string) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 22000);
    try {
      return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
        signal: ctrl.signal,
      });
    } finally { clearTimeout(t); }
  };

  // Gemini's flash-lite tier returns transient 503s under load. Retry with backoff, then escalate to
  // the (also free-tier) flash model before giving up — turns a hard failure into a brief wait.
  let lastStatus = 0;
  try {
    const attempts = [MODEL, MODEL, MODEL, FALLBACK_MODEL]; // 3 tries on lite, final try on flash
    for (let i = 0; i < attempts.length; i++) {
      const r = await callModel(attempts[i]);
      if (r.ok) {
        const data: any = await r.json();
        let text = data?.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join("") || "";
        // Earnings reviews get scrubbed of any leaked template brackets, then validated. A review
        // that still leaks placeholders, echoes a self-referential thesis, or drops sections is
        // returned as unreliable (reason:"unreliable") so the UI shows unavailable, not a badge.
        if (kind === "earnings" && text) {
          text = scrubReview(text);
          if (!earningsReliable(text)) return json({ ok: false, reason: "unreliable" });
        }
        return json({ ok: !!text, ticker, kind, text, provider: "gemini", model: attempts[i] });
      }
      lastStatus = r.status;
      if (!TRANSIENT.has(r.status)) return json({ ok: false, reason: `api_${r.status}` }); // 400/401/403 = don't retry
      if (i < attempts.length - 1) await sleep(400 * (i + 1)); // 400ms, 800ms, 1200ms backoff
    }
    return json({ ok: false, reason: `api_${lastStatus || 503}` }); // exhausted retries + fallback
  } catch (e: any) {
    return json({ ok: false, reason: `error_${e?.name || "unknown"}` });
  }
}
function json(o: unknown) {
  return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } });
}
