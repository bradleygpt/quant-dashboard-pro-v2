import { useEffect, useState } from "react";
import { REGIME, mapMlRegime, alpha, type RegimeState } from "../theme";

// RegimeRibbon — a thin (~8px) strip of market-regime state, attachable under
// any time-series chart. Colored by the regime tokens (risk-on / neutral /
// drawdown, defined once in theme.ts); segments come from the ML classifier's
// dominant_regime run-length series (5 states, collapsed via mapMlRegime).
//
// Alignment: the ribbon must span exactly the parent chart's plot area. Pass
// either pixel insets (Recharts: leftInset = margin.left + YAxis width,
// rightInset = margin.right) or percentage strings (canvas charts with
// fractional plot areas, e.g. PipelineViz's 12%…88% curve band).
//
// Data: fetches the baked public/data/regime_timeseries.json. Until the bake
// ships it (deferred change — see the session report), dev builds fall back to
// src/fixtures/regime_timeseries.dev.json, generated from the real parquet;
// the fallback is compiled out of production bundles.

export interface RegimeSegment { start: string; end: string; regime: string }
interface RegimeFile { generated_at?: string; as_of?: string; segments: RegimeSegment[] }

const BASE = `${import.meta.env.BASE_URL}data`;

let cached: Promise<RegimeFile | null> | null = null;
function loadRegimeSeries(): Promise<RegimeFile | null> {
  cached ??= fetch(`${BASE}/regime_timeseries.json`)
    .then((r) => (r.ok ? (r.json() as Promise<RegimeFile>) : null))
    .catch(() => null)
    .then(async (d) => {
      if (d?.segments?.length) return d;
      if (import.meta.env.DEV) {
        // dev-only fixture from the real classifications parquet
        const fx = await import("../fixtures/regime_timeseries.dev.json");
        return fx.default as RegimeFile;
      }
      return null;
    })
    .catch(() => null);
  return cached;
}

export function useRegimeSeries(): RegimeFile | null {
  const [d, setD] = useState<RegimeFile | null>(null);
  useEffect(() => { let on = true; loadRegimeSeries().then((x) => { if (on) setD(x); }); return () => { on = false; }; }, []);
  return d;
}

export default function RegimeRibbon({
  domain, leftInset = 0, rightInset = 0, height = 8, legend = false, className = "",
}: {
  /** parent chart's x extent as ISO dates: [first, last] */
  domain: [string, string];
  /** px number or CSS length ("12%") from the container's left edge to the plot area */
  leftInset?: number | string;
  rightInset?: number | string;
  height?: number;
  /** render the one-line legend under the strip */
  legend?: boolean;
  className?: string;
}) {
  const data = useRegimeSeries();
  if (!data?.segments?.length) return null;

  const t0 = Date.parse(domain[0]), t1 = Date.parse(domain[1]);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return null;
  const span = t1 - t0;
  const frac = (t: number) => Math.max(0, Math.min(1, (t - t0) / span));

  const segs = data.segments
    .map((s) => ({ ...s, a: Date.parse(s.start), b: Date.parse(s.end) + 86_400_000 })) // end is inclusive (daily grid)
    .filter((s) => s.b > t0 && s.a < t1)
    .map((s) => {
      const x0 = frac(s.a), x1 = frac(s.b);
      const state: RegimeState = mapMlRegime(s.regime);
      return { ...s, x0, x1, state };
    });

  const inset = (v: number | string) => (typeof v === "number" ? `${v}px` : v);

  return (
    <div className={className}>
      <div style={{ marginLeft: inset(leftInset), marginRight: inset(rightInset) }}>
        <div className="relative w-full overflow-hidden rounded-sm" style={{ height }}>
          {segs.map((s, i) => (
            <div
              key={i}
              title={`${REGIME[s.state].label} · ${s.regime.replace("_", " ")} — ${s.start} → ${s.end}`}
              className="absolute top-0 h-full"
              style={{
                left: `${(s.x0 * 100).toFixed(3)}%`,
                width: `${Math.max(0.15, (s.x1 - s.x0) * 100).toFixed(3)}%`,
                background: alpha(REGIME[s.state].color, s.state === "neutral" ? 0.55 : 0.8),
              }}
            />
          ))}
        </div>
        {legend && (
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-dim">
            {(Object.keys(REGIME) as RegimeState[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="inline-block h-1.5 w-3 rounded-sm" style={{ background: alpha(REGIME[k].color, 0.8) }} />
                {REGIME[k].label}
              </span>
            ))}
            <span>· ML regime classifier{data.as_of ? ` · as of ${data.as_of}` : ""}</span>
          </div>
        )}
      </div>
    </div>
  );
}
