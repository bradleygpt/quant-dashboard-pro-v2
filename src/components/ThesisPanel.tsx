// Investment Thesis panel — REWORKED 2026-07-21 to the AI Analysis pattern.
// "Generate Thesis" calls the same Gemini edge function as Research Note / Earnings
// Review (/api/ai, kind=thesis): server-side key, strict-JSON output, the PROMPT_PACK
// anti-slop contract validated server-side (one retry with failures fed back, then an
// honest error state — slop is never rendered silently). Works for ANY scored ticker.
// Cache: localStorage per (ticker, snapshot_hash) following the Earnings Review
// mechanism — repeat views are free; regeneration matters only when the dossier
// drifts (same thresholds as the DATED badge). Repo-baked theses (source claude-code)
// remain as seed content; the dossier-download/queue UX is gone from the product.
import { useEffect, useState } from "react";
import { Card, Spinner } from "./ui";
import { loadDataJSON } from "../lib/data";
import { INK, SEM, alpha } from "../theme";

interface ThesisSide { claim: string; pillars: string[]; catalysts: string[]; falsifiers: string[] }
interface GradeSlot { graded_at?: string; realized_return_pct?: number; winner?: string; falsifiers_triggered?: string[] }
interface BookRef { book: string; label?: string; as_of?: string }
interface Thesis {
  ticker: string; generated_at: string; generator?: string; source?: string; snapshot_hash: string;
  books?: BookRef[]; // live-book membership AT SNAPSHOT TIME (S5 provenance — travels with the thesis)
  inputs?: Record<string, any>;
  bull: ThesisSide; bear: ThesisSide;
  synthesis: { crux_variables: string[]; divergence_summary: string };
  grading?: { h3m?: GradeSlot | null; h6m?: GradeSlot | null; h12m?: GradeSlot | null };
}
type ThesisIndex = Record<string, { latest: string; files: string[]; count: number }>;

// Aging: the thesis is a snapshot; badge it when today's inputs have moved
// materially off the snapshot (price ±12% or default-preset composite ±1.0).
function agingInfo(t: Thesis, row: any): string | null {
  const snap = t.inputs || {};
  const drift: string[] = [];
  const p0 = Number(snap.price), p1 = Number(row?.price);
  if (isFinite(p0) && isFinite(p1) && p0 > 0 && Math.abs(p1 / p0 - 1) > 0.12)
    drift.push(`price ${(100 * (p1 / p0 - 1)).toFixed(0)}% off snapshot`);
  const c0 = Number(snap.composite_by_preset?.equal?.c), c1 = Number(row?.byPreset?.equal?.c);
  if (isFinite(c0) && isFinite(c1) && Math.abs(c1 - c0) > 1.0)
    drift.push(`composite ${c0.toFixed(1)}→${c1.toFixed(1)}`);
  return drift.length ? drift.join(" · ") : null;
}

async function sha256hex16(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// Live-book membership from the same artifacts the strategies table reads
// (c78q.json latest LIVE target; aristeia current_holdings). Module-cached.
interface LiveBooks { c78q?: { rows: string[]; as_of?: string }; ari?: { rows: string[]; as_of?: string } }
let booksCache: LiveBooks | null = null;
let booksInflight: Promise<LiveBooks> | null = null;
async function loadBooks(): Promise<LiveBooks> {
  if (booksCache) return booksCache;
  if (!booksInflight) {
    booksInflight = Promise.all([
      loadDataJSON<any>("c78q.json"),
      loadDataJSON<any>("aristeia_strategy.json"),
    ]).then(([c, a]) => {
      const out: LiveBooks = {};
      const t = c?.target;
      if (t?.book_type === "live") out.c78q = { rows: (t.rows || []).map((r: any) => r.ticker), as_of: t.as_of };
      const ch = a?.current_holdings;
      if (ch?.book_type === "live") out.ari = { rows: ch.tickers || [], as_of: ch.as_of };
      booksCache = out;
      return out;
    });
  }
  return booksInflight;
}
async function booksFor(ticker: string): Promise<BookRef[]> {
  const b = await loadBooks();
  const out: BookRef[] = [];
  if (b?.c78q?.rows.includes(ticker)) out.push({ book: "c78q", label: "Katalepsis", as_of: b.c78q.as_of });
  if (b?.ari?.rows.includes(ticker)) out.push({ book: "aristeia", label: "Aristeia", as_of: b.ari.as_of });
  return out;
}

// Compact DATA blob for the edge function — same pre-formatted style as the AI
// Analysis card (the model narrates given figures, never recomputes prices).
function thesisBlob(row: any, rows: any[], qhist: any[], books: BookRef[]) {
  const rw = row.raw || {};
  const pf = (x?: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`);
  const lf = (x?: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
  const nf = (x?: number | null) => (x == null ? "—" : x.toFixed(x >= 100 ? 0 : 1));
  const prem = row.fvPremium;
  const comp = (r: any) => r?.byPreset?.equal?.c;
  const peers = (rows || []).filter((r) => r.sector === row.sector).map(comp).filter((c) => typeof c === "number").sort((a, b) => b - a);
  const my = comp(row);
  const rank = peers.length && typeof my === "number"
    ? `${peers.indexOf(my) + 1} of ${peers.length} in ${row.sector} (sector median composite ${peers[Math.floor(peers.length / 2)].toFixed(2)})`
    : undefined;
  return {
    name: row.name ?? "", sector: row.sector ?? "", mcapB: row.marketCapB != null ? row.marketCapB.toFixed(0) : undefined,
    score: row.composite?.toFixed(2), rating: row.rating, grades: row.grades, rank,
    val: { fpe: nf(rw.forwardPE), pe: nf(rw.trailingPE), peg: nf(rw.pegRatio), ps: nf(rw.priceToSalesTrailing12Months), evs: nf(rw.enterpriseToEbitda) },
    prof: { gross: lf(rw.grossMargins), oper: lf(rw.operatingMargins), net: lf(rw.profitMargins), roe: lf(rw.returnOnEquity) },
    growth: { rev: pf(rw.revenueGrowth), earn: pf(rw.earningsGrowth) },
    mom: { m3: pf(rw.momentum_3m), m12: pf(rw.momentum_12m), sma200: pf(rw.momentum_vs_sma200), upside: pf(rw.analyst_mean_target_upside) },
    analysts: rw.analyst_count != null ? `${rw.analyst_count} analysts, recommendation score ${rw.analyst_recommendation_score ?? "—"}` : undefined,
    fv: row.fv != null ? { value: row.fv.toFixed(0), premium: prem != null ? `${Math.abs(prem).toFixed(1)}%` : undefined, direction: prem != null ? (prem >= 0 ? "above" : "below") : undefined, verdict: row.fvVerdict ?? undefined } : undefined,
    qbp: row.qbpSignal ?? undefined,
    books: books.length ? books.map((b) => `${b.label ?? b.book} (as of ${b.as_of ?? "?"})`).join(", ") : undefined,
    quarters: (qhist || []).slice(0, 9).map((q: any) => ({
      date: String(q.date || "").slice(0, 7), rev: pf(q.revenueGrowth), earn: pf(q.earningsGrowth),
      gross: lf(q.grossMargins), oper: lf(q.operatingMargins), net: lf(q.netMargins),
    })),
  };
}

function SideCol({ label, side, color }: { label: string; side: ThesisSide; color: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: alpha(color, 0.35), background: alpha(color, 0.05) }}>
      <div className="text-xs font-bold uppercase tracking-wide" style={{ color }}>{label}</div>
      <div className="mt-1 text-sm font-semibold text-ink-1">{side.claim}</div>
      <div className="mt-2 text-[11px] font-semibold uppercase text-mute">Pillars</div>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-ink-2">{side.pillars?.map((p, i) => <li key={i}>{p}</li>)}</ul>
      <div className="mt-2 text-[11px] font-semibold uppercase text-mute">Catalysts</div>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-ink-2">{side.catalysts?.map((c, i) => <li key={i}>{c}</li>)}</ul>
      <div className="mt-2 text-[11px] font-semibold uppercase text-mute">What kills this</div>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-ink-3">{side.falsifiers?.map((f, i) => <li key={i}>{f}</li>)}</ul>
    </div>
  );
}

type GenState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "failed"; reason: string; errors?: string[] };

export default function ThesisPanel({ ticker, row, rows, td, qhist }: { ticker: string | null; row: any; rows: any[]; td: any; qhist: any[] }) {
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [checked, setChecked] = useState(false);
  const [gen, setGen] = useState<GenState>({ kind: "idle" });
  const [curHash, setCurHash] = useState<string | null>(null);
  const [books, setBooks] = useState<BookRef[]>([]);

  // current snapshot hash + books (drives cache freshness and the DATED semantics)
  useEffect(() => {
    if (!ticker || !row) return;
    let live = true;
    (async () => {
      const b = await booksFor(ticker);
      const blob = thesisBlob(row, rows, qhist, b);
      const h = await sha256hex16(JSON.stringify(blob));
      if (live) { setBooks(b); setCurHash(h); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, row, qhist?.length]);

  // load: live-generated cache first (Earnings-Review mechanism), else the baked seed
  useEffect(() => {
    if (!ticker) return;
    let live = true;
    setThesis(null); setChecked(false); setGen({ kind: "idle" });
    (async () => {
      try {
        const hit = JSON.parse(localStorage.getItem(`qd_thesis_${ticker}`) || "null");
        if (hit?.bull?.claim && hit?.bear?.claim) { if (live) { setThesis(hit); setChecked(true); } return; }
      } catch { /* fall through */ }
      const idx = await loadDataJSON<ThesisIndex>("theses_index.json");
      const latest = idx?.[ticker]?.latest;
      const t = latest ? await loadDataJSON<Thesis>(`theses/${latest}`) : null;
      if (live) { setThesis(t); setChecked(true); }
    })();
    return () => { live = false; };
  }, [ticker]);

  if (!ticker || !row) return null;

  const generate = async () => {
    setGen({ kind: "loading" });
    try {
      const blob = thesisBlob(row, rows, qhist, books);
      const hash = curHash ?? (await sha256hex16(JSON.stringify(blob)));
      const qs = new URLSearchParams({ ticker, kind: "thesis", d: JSON.stringify(blob) });
      const d = await fetch(`/api/ai?${qs}`).then((r) => r.json());
      if (!d.ok) { setGen({ kind: "failed", reason: d.reason || "error", errors: d.errors }); return; }
      const t: Thesis = {
        ticker,
        generated_at: new Date().toISOString().slice(0, 19),
        generator: `gemini (${d.model || "?"})`,
        source: "gemini-live",
        snapshot_hash: hash,
        books,
        // minimal snapshot for the DATED drift check (full persistence is a separate decision)
        inputs: { price: row.price, composite_by_preset: row.byPreset },
        bull: d.thesis.bull, bear: d.thesis.bear, synthesis: d.thesis.synthesis,
        grading: { h3m: null, h6m: null, h12m: null },
      };
      try { localStorage.setItem(`qd_thesis_${ticker}`, JSON.stringify(t)); } catch { /* storage full/off */ }
      setThesis(t); setGen({ kind: "idle" });
    } catch {
      setGen({ kind: "failed", reason: "error" });
    }
  };

  const aging = thesis ? agingInfo(thesis, row) : null;
  const grades = thesis?.grading ? (Object.entries(thesis.grading).filter(([, v]) => v) as [string, GradeSlot][]) : [];
  const upToDate = !!thesis && thesis.source === "gemini-live" && !!curHash && thesis.snapshot_hash === curHash;

  return (
    <Card title="Investment Thesis" sub="Bull and bear cases generated on demand (Gemini) from this ticker's current dossier snapshot — scores, multiples, margins, quarterly history, fair value, buy point, live-book membership. Validated before render: pillars must cite dossier numbers, each side names its own falsifiers, and the crux is what the two cases actually disagree on. Works for any scored ticker.">
      {thesis ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-mute">
            <span>generated {thesis.generated_at?.slice(0, 10)}</span>
            <span>· {thesis.source === "gemini-live" ? "gemini-live" : `seed (${(thesis.generator || "claude-code").split(" ")[0]})`}</span>
            <span>· snapshot {thesis.snapshot_hash}</span>
            {/* book provenance AT SNAPSHOT TIME (S5): what the live books were when this
                was written — never reconstructed later. Canonical strategy labels. */}
            {thesis.books?.map((b) => (
              <span key={b.book} className="rounded border px-1.5 py-0.5 font-semibold"
                style={{ color: SEM.link, borderColor: SEM.link }}>
                {b.label ?? b.book} book{b.as_of ? ` · as of ${b.as_of}` : ""}
              </span>
            ))}
            {thesis.books && thesis.books.length === 0 && (
              <span className="rounded border border-line px-1.5 py-0.5">off-book at writing</span>
            )}
            {aging && (
              <span className="rounded border px-1.5 py-0.5 font-semibold" style={{ color: SEM.warn, borderColor: SEM.warn }}>
                DATED — {aging}
              </span>
            )}
            {grades.map(([h, g]) => (
              <span key={h} className="rounded border border-line px-1.5 py-0.5">
                {h}: {g.realized_return_pct != null ? `${g.realized_return_pct >= 0 ? "+" : ""}${g.realized_return_pct}%` : "—"} → {g.winner}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <SideCol label="Bull" side={thesis.bull} color={SEM.pos} />
            <SideCol label="Bear" side={thesis.bear} color={SEM.neg} />
          </div>
          <div className="mt-3 rounded-lg border border-line p-3">
            <div className="text-[11px] font-semibold uppercase text-mute">The crux — where the cases actually disagree</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {thesis.synthesis?.crux_variables?.map((c, i) => (
                <span key={i} className="rounded bg-raised px-2 py-0.5 text-xs font-semibold text-ink-1">{c}</span>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-2">{thesis.synthesis?.divergence_summary}</p>
          </div>
        </>
      ) : checked && gen.kind !== "loading" ? (
        <p className="text-sm text-mute">No thesis for {ticker} yet — generate one from the current snapshot.</p>
      ) : gen.kind !== "loading" ? (
        <p className="text-sm text-mute">Checking for a thesis…</p>
      ) : null}

      {gen.kind === "loading" && <div className="mt-2"><Spinner label="Generating thesis — Gemini is writing both cases from the dossier snapshot…" /></div>}

      {gen.kind === "failed" && (
        <div className="mt-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: SEM.warn, color: SEM.warn }}>
          {gen.reason === "no_key"
            ? "LLM not configured — requires GEMINI_API_KEY in Vercel (same key as the AI Analysis card); the generator activates on the next deploy."
            : gen.reason === "validation_failed"
              ? <>The model's output failed the anti-slop validator twice — withheld rather than rendered.{gen.errors?.length ? <span className="mt-1 block" style={{ color: INK.mute }}>{gen.errors.slice(0, 4).join(" · ")}</span> : null}</>
              : `Generation failed (${gen.reason}) — usually transient; try again shortly.`}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={generate}
          disabled={gen.kind === "loading" || upToDate}
          title={upToDate ? "Already generated from the current snapshot — regeneration matters only when the dossier drifts (DATED badge)." : undefined}
          className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:bg-hover disabled:opacity-50"
        >
          {gen.kind === "loading" ? "Generating…" : thesis ? (upToDate ? "Up to date with current snapshot" : "Regenerate from current snapshot") : "Generate Thesis"}
        </button>
      </div>
    </Card>
  );
}
