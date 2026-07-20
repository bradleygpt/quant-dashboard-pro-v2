// Hand-off channel between the Stock Detail "Markets Engine" entry block and the
// Thesis Engine tab (engine-wiring handoff Phases 2-3, 2026-07-20).
//
// - Prefill (sessionStorage, consumed once): the entry block writes the gate-validated
//   query + the proxy-honesty label; the tab reads it on mount, fills the input, shows
//   the label, and NEVER auto-submits (one slot, 7-21 min jobs — a misfired click costs
//   real capacity).
// - Active job (localStorage): job/query state in the tab is component-local, so
//   navigating away orphaned a running 7-minute job (verified 2026-07-20). Persist the
//   job id; the tab resumes polling on mount. Cleared on terminal states or when the
//   server no longer knows the job (engine restart).

export interface MarketsPrefill {
  query: string;
  proxyLabel: string; // "via semiconductors (SMH ETF proxy) — ..." travels with the click
  ticker: string;
}

const PREFILL_KEY = "markets_prefill_v1";
const JOB_KEY = "markets_active_job_v1";

export function setPrefill(p: MarketsPrefill): void {
  try { sessionStorage.setItem(PREFILL_KEY, JSON.stringify(p)); } catch { /* storage off */ }
}

/** Read-and-clear: the prefill applies exactly once. */
export function takePrefill(): MarketsPrefill | null {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PREFILL_KEY);
    const p = JSON.parse(raw);
    return typeof p?.query === "string" && p.query ? (p as MarketsPrefill) : null;
  } catch {
    return null;
  }
}

export interface ActiveJob { jobId: string; query: string; startedAt: number }

export function saveActiveJob(jobId: string, query: string): void {
  try { localStorage.setItem(JOB_KEY, JSON.stringify({ jobId, query, startedAt: Date.now() })); } catch { /* */ }
}

export function loadActiveJob(): ActiveJob | null {
  try {
    const raw = localStorage.getItem(JOB_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (typeof j?.jobId !== "string" || !j.jobId) return null;
    // a job older than 2h is stale regardless (jobs run 7-21 min) — drop it
    if (typeof j.startedAt === "number" && Date.now() - j.startedAt > 2 * 3600_000) {
      clearActiveJob();
      return null;
    }
    return j as ActiveJob;
  } catch {
    return null;
  }
}

export function clearActiveJob(): void {
  try { localStorage.removeItem(JOB_KEY); } catch { /* */ }
}
