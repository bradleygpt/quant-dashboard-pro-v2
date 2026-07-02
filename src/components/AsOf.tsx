import { useEffect, useState } from "react";

const BASE = `${import.meta.env.BASE_URL}data`;

// ── Freshness thresholds: THE single definition (audit §3.3) ────────────────────
// fresh < 3d · aging 3–10d · stale > 10d. Every staleness surface must read these,
// and the badge always carries an icon + text label — never color alone.
export const FRESH_DAYS = 3;
export const AMBER_DAYS = 10;
export type FreshTier = "fresh" | "amber" | "stale" | "unknown";

// freshness_manifest.json is fetched once per session and shared by every badge.
let manifestPromise: Promise<any> | null = null;
function loadManifest(): Promise<any> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${BASE}/freshness_manifest.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return manifestPromise;
}

export function tierOf(iso?: string | null): { tier: FreshTier; ageDays: number | null } {
  if (!iso) return { tier: "unknown", ageDays: null };
  const t = Date.parse(iso);
  if (isNaN(t)) return { tier: "unknown", ageDays: null };
  const ageDays = (Date.now() - t) / 86400000;
  return { tier: ageDays < FRESH_DAYS ? "fresh" : ageDays <= AMBER_DAYS ? "amber" : "stale", ageDays };
}

const STYLE: Record<FreshTier, { icon: string; cls: string; label: string }> = {
  fresh: { icon: "✓", cls: "text-pos border-pos/35 bg-pos/10", label: "fresh" },
  amber: { icon: "⚠", cls: "text-warn border-paper/30 bg-paper/10", label: "aging" },
  stale: { icon: "✕", cls: "text-neg border-neg/35 bg-neg/10", label: "STALE" },
  unknown: { icon: "◌", cls: "text-mute border-line bg-panel", label: "vintage unknown" },
};

/** Resolve a panel's data vintage: an explicit ISO date wins; otherwise the
 *  freshness_manifest source entry; otherwise the manifest's own stamp. */
export function useAsOf(source?: string, date?: string | null): string | null {
  const [iso, setIso] = useState<string | null>(date ?? null);
  useEffect(() => {
    if (date) { setIso(date); return; }
    if (!source) { setIso(null); return; }
    let on = true;
    loadManifest().then((m) => {
      if (!on) return;
      const e = m?.sources?.[source];
      setIso(e?.generated_at ?? e?.as_of ?? null);
    });
    return () => { on = false; };
  }, [source, date]);
  return date ?? iso;
}

/** The one stale-data badge. `source` = freshness_manifest key (e.g. "universe_floor0",
 *  "quant_backtest"); `date` = explicit vintage for panels that carry their own. */
export default function AsOf({ source, date, className = "" }: { source?: string; date?: string | null; className?: string }) {
  const iso = useAsOf(source, date);
  const { tier, ageDays } = tierOf(iso);
  const s = STYLE[tier];
  const day = iso ? String(iso).slice(0, 10) : null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.cls} ${className}`}
      title={iso
        ? `Data vintage ${iso} (${ageDays!.toFixed(1)}d old). Thresholds: fresh <${FRESH_DAYS}d · aging ${FRESH_DAYS}–${AMBER_DAYS}d · stale >${AMBER_DAYS}d.`
        : "No vintage metadata available for this panel's data source."}
    >
      <span aria-hidden="true">{s.icon}</span>
      {day ? `${s.label} · as of ${day}` : s.label}
    </span>
  );
}
