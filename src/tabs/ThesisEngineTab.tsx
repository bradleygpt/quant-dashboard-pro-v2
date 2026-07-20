// Markets Thesis Engine — fetch-based query UI against the markets-llm API (replaces the old
// iframe embed entirely). Base URL and token come from Vite env (src/lib/markets.ts); nothing
// engine-specific is hardcoded here.
//
// Honest-desk contract:
//   - /health probed on mount + a modest interval; engine down => a clearly-labeled offline
//     panel with a retry button. No fake content, no cached answers presented as live.
//   - The engine's own refusals (no_coverage, GPU-yield 503, rate-limit 429) render as what
//     they are, never dressed up as answers.
//   - A final answer renders ONLY after validation (non-empty, no template-leak markers) —
//     the same discipline class as the earnings reviewer.
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Spinner } from "../components/ui";
import { INK, LINE, SEM, SURFACE } from "../theme";
import {
  MARKETS_CONFIGURED,
  MarketsApiError,
  getResult,
  probeHealth,
  submitQuery,
  validateAnswer,
  type HealthVerdict,
  type ThesisEvent,
} from "../lib/markets";
import { clearActiveJob, loadActiveJob, saveActiveJob, takePrefill } from "../lib/marketsPrefill";

const HEALTH_INTERVAL_MS = 45_000; // modest cadence; the tab is niche, no polling storm
const RESULT_POLL_MS = 2_500;

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "running"; jobId: string; events: ThesisEvent[] }
  | { kind: "done"; jobId: string; outcome: string; answer: string; citations: unknown[] }
  | { kind: "invalid"; jobId: string; reason: string }
  | { kind: "error"; message: string; yielding?: boolean };

function StageTrail({ events }: { events: ThesisEvent[] }) {
  // staged progress, rendered generically by event type (the pipeline's vocabulary can grow)
  const shown = events.filter((e) => e.type && e.type !== "done").slice(-8);
  if (!shown.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {shown.map((e, i) => (
        <div key={`${e.seq ?? i}`} className="flex items-center gap-2 text-xs" style={{ color: INK.ink3 }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: SEM.link }} />
          <span className="font-mono">{String(e.type)}</span>
          {typeof e.stage === "string" && <span style={{ color: INK.mute }}>{e.stage}</span>}
          {typeof e.note === "string" && <span style={{ color: INK.mute }}>{e.note}</span>}
        </div>
      ))}
    </div>
  );
}

function AnswerBody({ text }: { text: string }) {
  // The engine emits markdown-lite (bold + paragraphs). Render conservatively: paragraphs with
  // **bold** spans; no raw HTML, no external renderer.
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="space-y-2 text-sm leading-relaxed" style={{ color: INK.ink2 }}>
      {paras.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {p.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
            seg.startsWith("**") && seg.endsWith("**") ? (
              <strong key={j} style={{ color: INK.ink }}>{seg.slice(2, -2)}</strong>
            ) : (
              <span key={j}>{seg}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

export default function ThesisEngineTab() {
  const [health, setHealth] = useState<HealthVerdict | null>(null);
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // proxy-honesty label carried in from the Stock Detail entry block (travels with the click)
  const [proxyLabel, setProxyLabel] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const checkHealth = useCallback(async () => setHealth(await probeHealth()), []);

  useEffect(() => {
    checkHealth();
    const iv = window.setInterval(checkHealth, HEALTH_INTERVAL_MS);
    return () => window.clearInterval(iv);
  }, [checkHealth]);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await getResult(jobId);
        if (!r.done) {
          setPhase({ kind: "running", jobId, events: r.events });
          return;
        }
        if (pollRef.current) window.clearInterval(pollRef.current);
        clearActiveJob();
        const answer = (r.final?.answer as string | undefined) ?? "";
        const v = validateAnswer(answer);
        if (!v.ok) {
          setPhase({ kind: "invalid", jobId, reason: v.reason ?? "failed validation" });
          return;
        }
        setPhase({
          kind: "done",
          jobId,
          outcome: (r.final?.outcome as string | undefined) ?? "answered",
          answer,
          citations: Array.isArray(r.final?.citations) ? (r.final?.citations as unknown[]) : [],
        });
      } catch (e) {
        // 404 = the server no longer knows this job (engine restarted): stop + forget it.
        // Anything else is transient: keep polling; the job persists server-side and the
        // next tick re-reads the full event log (reconnect-by-job-id semantics).
        if (e instanceof MarketsApiError && e.status === 404) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          clearActiveJob();
          setPhase({ kind: "error", message: "The engine no longer knows this job (it likely restarted). Re-ask when ready." });
        }
      }
    }, RESULT_POLL_MS);
  }, []);

  // Mount: (1) apply a one-shot prefill from the Stock Detail entry block — fill the
  // input + show the proxy label, NEVER submit; (2) resume a persisted running job so
  // navigating away doesn't orphan a 7-minute slot (job state is component-local).
  useEffect(() => {
    const p = takePrefill();
    if (p) {
      setQuery(p.query);
      setProxyLabel(p.proxyLabel);
    }
    const j = loadActiveJob();
    if (j) {
      setQuery((q) => q || j.query);
      setPhase({ kind: "running", jobId: j.jobId, events: [] });
      startPolling(j.jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(async () => {
    const q = query.trim();
    if (!q || phase.kind === "submitting" || phase.kind === "running") return;
    setPhase({ kind: "submitting" });
    try {
      const jobId = await submitQuery(q);
      saveActiveJob(jobId, q);
      setPhase({ kind: "running", jobId, events: [] });
      startPolling(jobId);
    } catch (e) {
      if (e instanceof MarketsApiError) {
        // capacity etiquette: 429 gets the expectation copy, and the rate limiter is the
        // guard — no automatic retry loops here.
        const msg = e.status === 429
          ? "Engine is working on another question (~7 min typical). Try again shortly."
          : e.message;
        setPhase({ kind: "error", message: msg, yielding: e.yielding });
      } else {
        setPhase({ kind: "error", message: "submit failed (network)" });
      }
    }
  }, [query, phase.kind, startPolling]);

  const offline = !health?.up;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: INK.white }}>📝 Markets Thesis Engine</h2>
          <p className="mt-0.5 text-sm" style={{ color: INK.ink3 }}>
            Ask a markets question; the engine grounds a thesis in its corpus (S&P 100 filings, Fed/FOMC
            materials, practitioner letters) and refuses what it cannot ground.
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{
            color: health == null ? INK.mute : health.up ? SEM.pos : SEM.neg,
            background: SURFACE.raised,
            border: `1px solid ${LINE.line}`,
          }}
        >
          {health == null ? "checking…" : health.up ? (health.yielding ? "live · yielding to quant GPU" : "live") : "offline"}
        </span>
      </div>

      {!MARKETS_CONFIGURED && (
        <Card title="Thesis Engine not configured">
          <p className="text-sm" style={{ color: INK.ink3 }}>
            VITE_MARKETS_URL is not set for this build. Set it (and VITE_MARKETS_TOKEN) in the deploy
            environment; the tab activates on the next build.
          </p>
        </Card>
      )}

      {MARKETS_CONFIGURED && offline && (
        <Card title="Engine offline">
          <p className="text-sm" style={{ color: INK.ink3 }}>
            The thesis engine is unreachable{health?.reason ? ` (${health.reason})` : ""}. It runs on the
            markets machine; when it is back, this panel goes live automatically. Nothing cached is shown
            as live.
          </p>
          <button
            onClick={checkHealth}
            className="mt-3 rounded-md px-3 py-1.5 text-sm font-medium"
            style={{ background: SURFACE.active, color: INK.ink, border: `1px solid ${LINE.line}` }}
          >
            Retry now
          </button>
        </Card>
      )}

      {MARKETS_CONFIGURED && !offline && (
        <>
          <Card title="Ask">
            {proxyLabel && (
              <p className="mb-2 rounded-md px-3 py-1.5 text-[11px]"
                style={{ color: INK.ink3, background: SURFACE.raised, border: `1px solid ${LINE.line}` }}>
                {proxyLabel}
              </p>
            )}
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                placeholder='e.g. "How exposed is the S&P 100 to AI capex risk?"'
                className="w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{ background: SURFACE.inset, color: INK.ink, border: `1px solid ${LINE.line}` }}
              />
              <button
                onClick={submit}
                disabled={phase.kind === "submitting" || phase.kind === "running" || !query.trim()}
                className="shrink-0 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: SEM.cta, color: INK.white }}
              >
                {phase.kind === "submitting" || phase.kind === "running" ? "Working…" : "Ask"}
              </button>
            </div>
            <p className="mt-1.5 text-[11px]" style={{ color: INK.dim }}>
              One GPU job at a time — typically ~7 minutes, up to ~20 with charts; after ~10pm the engine
              yields to the nightly quant run. The job persists server-side and survives navigating away
              from this tab (polling resumes when you return).
            </p>
          </Card>

          {phase.kind === "submitting" && <Spinner label="Submitting…" />}

          {phase.kind === "running" && (
            <Card title="Reasoning" sub={`job ${phase.jobId} · staged pipeline running`}>
              <Spinner label="The engine is working — stages stream in as they complete." />
              <StageTrail events={phase.events} />
            </Card>
          )}

          {phase.kind === "error" && (
            <Card title={phase.yielding ? "Engine yielding" : "Request failed"}>
              <p className="text-sm" style={{ color: phase.yielding ? SEM.warn : SEM.neg }}>{phase.message}</p>
              {phase.yielding && (
                <p className="mt-1 text-xs" style={{ color: INK.mute }}>
                  The quant pipeline owns the GPU right now; the engine accepts queries again automatically
                  once it clears.
                </p>
              )}
            </Card>
          )}

          {phase.kind === "invalid" && (
            <Card title="Response withheld">
              <p className="text-sm" style={{ color: SEM.warn }}>
                The engine returned output that failed validation ({phase.reason}) — withheld rather than
                rendered. Job {phase.jobId} is preserved server-side for inspection.
              </p>
            </Card>
          )}

          {phase.kind === "done" && (
            <Card
              title={phase.outcome === "no_coverage" ? "No corpus coverage" : "Thesis"}
              sub={`job ${phase.jobId} · outcome: ${phase.outcome}`}
            >
              <AnswerBody text={phase.answer} />
              {phase.citations.length > 0 && (
                <div className="mt-3 border-t pt-2" style={{ borderColor: LINE.faint }}>
                  <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: INK.mute }}>
                    Citations
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs" style={{ color: INK.ink3 }}>
                    {phase.citations.slice(0, 12).map((c, i) => (
                      <li key={i} className="truncate">• {typeof c === "string" ? c : JSON.stringify(c)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
