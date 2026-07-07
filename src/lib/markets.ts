// Shared client for the Markets Thesis Engine API (markets-llm server.py).
//
// Base URL comes ONLY from VITE_MARKETS_URL (never hardcode localhost or the tunnel domain in
// src). Auth comes from VITE_MARKETS_TOKEN as `Authorization: Bearer <t>` on every /api/*
// request; GET /health is intentionally unauthenticated so the landing sun and the tab's
// availability probe work without exposing the token on a public prod page that merely LOOKS
// at the engine. The ngrok-skip-browser-warning header rides on every request so probes hit
// the API instead of ngrok's interstitial.
//
// Honest-desk: probeHealth returns a plain up/down verdict with a short reason. Consumers must
// render "down" as down (dim sun, offline panel) and never substitute cached content as live.

const BASE = ((import.meta.env.VITE_MARKETS_URL as string | undefined) ?? "").replace(/\/+$/, "");
const TOKEN = (import.meta.env.VITE_MARKETS_TOKEN as string | undefined) ?? "";

export const MARKETS_CONFIGURED = BASE.length > 0;

function headers(auth: boolean): Record<string, string> {
  const h: Record<string, string> = { "ngrok-skip-browser-warning": "true" };
  if (auth && TOKEN) h["Authorization"] = `Bearer ${TOKEN}`;
  return h;
}

export interface HealthVerdict {
  up: boolean;
  yielding: boolean;
  reason: string;
}

/** GET {base}/health (no auth), hard timeout. Any failure => down, with the reason. */
export async function probeHealth(timeoutMs = 4000): Promise<HealthVerdict> {
  if (!MARKETS_CONFIGURED) return { up: false, yielding: false, reason: "VITE_MARKETS_URL not set" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/health`, { headers: headers(false), signal: ctrl.signal });
    if (!r.ok) return { up: false, yielding: false, reason: `health ${r.status}` };
    const d = await r.json().catch(() => ({}));
    return { up: d?.ok === true || d?.api === "ok", yielding: !!d?.yielding, reason: d?.yielding ? "engine yielding to quant GPU work" : "ok" };
  } catch (e) {
    return { up: false, yielding: false, reason: e instanceof DOMException && e.name === "AbortError" ? "health probe timed out" : "unreachable" };
  } finally {
    clearTimeout(t);
  }
}

export interface ThesisEvent {
  t?: number;
  seq?: number;
  type?: string;
  [k: string]: unknown;
}

export interface ThesisResult {
  job_id: string;
  events: ThesisEvent[];
  done: boolean;
  final: (ThesisEvent & { outcome?: string; answer?: string; citations?: unknown[] }) | null;
}

export class MarketsApiError extends Error {
  status: number;
  yielding: boolean;
  constructor(message: string, status: number, yielding = false) {
    super(message);
    this.status = status;
    this.yielding = yielding;
  }
}

/** POST /api/query -> job_id. Distinguishes the honest 503 GPU-yield and 429 rate-limit states. */
export async function submitQuery(query: string): Promise<string> {
  const r = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { ...headers(true), "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new MarketsApiError(d?.error || `submit failed (${r.status})`, r.status, !!d?.yielding);
  if (!d?.job_id) throw new MarketsApiError("submit returned no job id", 500);
  return d.job_id as string;
}

/** GET /api/result/<id> — polled until done (SSE avoided: headers-with-auth polling is simpler through the tunnel). */
export async function getResult(jobId: string): Promise<ThesisResult> {
  const r = await fetch(`${BASE}/api/result/${encodeURIComponent(jobId)}`, { headers: headers(true) });
  if (!r.ok) throw new MarketsApiError(`result failed (${r.status})`, r.status);
  return (await r.json()) as ThesisResult;
}

// Response validation before anything renders as a thesis (same discipline class as the
// earnings reviewer): non-empty, and no prompt-template leakage markers.
const TEMPLATE_LEAK = /\[[^\]]*?(insert|placeholder|e\.g\.|your |bullet|sentence|TODO|TBD)[^\]]*?\]|<\|[a-z_]+\|>|\{\{[^}]+\}\}/i;

export function validateAnswer(text: string | undefined | null): { ok: boolean; reason?: string } {
  const t = (text ?? "").trim();
  if (t.length < 40) return { ok: false, reason: "empty or too short" };
  if (TEMPLATE_LEAK.test(t)) return { ok: false, reason: "template leakage detected" };
  return { ok: true };
}
