// Investment Thesis panel (handoff §2, 2026-07-20).
// Architecture: dossier → queue → Claude Code generation → baked JSON → this render.
// The app NEVER generates. "Generate Thesis" builds a full dossier snapshot of what
// the app knows right now and downloads it; Bradley drops it into
// quant-dashboard-pro/theses/queue/ and generation happens in Claude Code per
// theses/PROMPT_PACK.md (zero marginal cost). Baked theses ship via the bake as
// data/theses/ + theses_index.json.
import { useEffect, useState } from "react";
import { Card } from "./ui";
import { loadDataJSON } from "../lib/data";
import { SEM, alpha } from "../theme";

interface ThesisSide { claim: string; pillars: string[]; catalysts: string[]; falsifiers: string[] }
interface GradeSlot { graded_at?: string; realized_return_pct?: number; winner?: string; falsifiers_triggered?: string[] }
interface Thesis {
  ticker: string; generated_at: string; generator?: string; snapshot_hash: string;
  inputs?: Record<string, any>;
  bull: ThesisSide; bear: ThesisSide;
  synthesis: { crux_variables: string[]; divergence_summary: string };
  grading?: { h3m?: GradeSlot | null; h6m?: GradeSlot | null; h12m?: GradeSlot | null };
}
type ThesisIndex = Record<string, { latest: string; files: string[]; count: number }>;

const NA = "N/A";

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

// Mirror build_thesis_dossier.py: full snapshot, N/A for missing (never 0).
async function buildDossier(ticker: string, row: any, rows: any[], td: any, qhist: any[]) {
  const comp = (r: any) => r?.byPreset?.equal?.c ?? Object.values(r?.byPreset ?? {}).map((v: any) => v?.c)[0];
  const sector = row?.sector ?? NA;
  const peers = (rows || []).filter((r) => r.sector === sector).map(comp).filter((c) => typeof c === "number").sort((a, b) => b - a);
  const my = comp(row);
  const inputs = {
    name: row?.name ?? NA, sector, industry: row?.industry ?? NA,
    price: row?.price ?? NA, market_cap_b: row?.marketCapB ?? NA,
    composite_by_preset: row?.byPreset ?? NA, pillars: row?.pillars ?? NA,
    grades: row?.grades ?? NA, raw_metrics: row?.raw ?? NA,
    fair_value: td?.fv ?? row?.fv ?? NA, fv_premium_pct: row?.fvPremium ?? NA, fv_verdict: row?.fvVerdict ?? NA,
    buy_point: td?.qbp ?? row?.qbp ?? NA, qbp_distance_pct: row?.qbpDistance ?? NA, qbp_signal: row?.qbpSignal ?? NA,
    pillar_detail: td?.pillar_detail ?? NA,
    quarterly: qhist?.length ? qhist : NA,
    c78q: NA, // book membership resolves repo-side; the CLI builder fills it
    sector_context: peers.length && typeof my === "number"
      ? { n_sector: peers.length, rank_in_sector: peers.indexOf(my) + 1 || NA, sector_median_composite: peers[Math.floor(peers.length / 2)] }
      : NA,
  };
  const stamp = new Date();
  return {
    ticker,
    built_at: stamp.toISOString().slice(0, 19),
    builder: "app Generate Thesis button v1",
    snapshot_hash: await sha256hex16(JSON.stringify(inputs)),
    inputs,
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

export default function ThesisPanel({ ticker, row, rows, td, qhist }: { ticker: string | null; row: any; rows: any[]; td: any; qhist: any[] }) {
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [checked, setChecked] = useState(false);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let live = true;
    setThesis(null); setChecked(false); setQueued(false);
    loadDataJSON<ThesisIndex>("theses_index.json").then(async (idx) => {
      const latest = idx?.[ticker]?.latest;
      const t = latest ? await loadDataJSON<Thesis>(`theses/${latest}`) : null;
      if (live) { setThesis(t); setChecked(true); }
    });
    return () => { live = false; };
  }, [ticker]);

  if (!ticker || !row) return null;

  const enqueue = async () => {
    const dossier = await buildDossier(ticker, row, rows, td, qhist);
    const blob = new Blob([JSON.stringify(dossier, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${ticker}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setQueued(true);
  };

  const aging = thesis ? agingInfo(thesis, row) : null;
  const grades = thesis?.grading ? Object.entries(thesis.grading).filter(([, v]) => v) as [string, GradeSlot][] : [];

  return (
    <Card title="Investment Thesis" sub="Bull and bear cases generated from a full dossier snapshot (Claude Code, zero-cost; the app never calls an LLM). Pillars cite dossier numbers; each side names its own falsifiers; the crux is what the two cases actually disagree on.">
      {thesis ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-mute">
            <span>generated {thesis.generated_at?.slice(0, 10)}</span>
            <span>· snapshot {thesis.snapshot_hash}</span>
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
      ) : checked ? (
        <p className="text-sm text-mute">No thesis baked for {ticker} yet.</p>
      ) : (
        <p className="text-sm text-mute">Checking for a baked thesis…</p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button onClick={enqueue} className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:bg-hover">
          {thesis ? "Re-queue with fresh snapshot" : "Generate Thesis"}
        </button>
        {queued && (
          <span className="text-[11px] text-mute">
            Dossier downloaded — drop it in <code>quant-dashboard-pro/theses/queue/</code> and ask Claude Code to generate (see theses/PROMPT_PACK.md).
          </span>
        )}
      </div>
    </Card>
  );
}
