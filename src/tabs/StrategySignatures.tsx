import { useEffect, useState } from "react";
import { Card, Spinner } from "../components/ui";

// The five strategies as themed "signatures": each strategy's REAL backtest equity curve,
// drawn in a motif built from the Greek meaning of its name. Numbers are real (equity curve +
// metrics from each *_strategy.json / c78q.json); the motif flourishes are computed from that curve.
const BASE = `${import.meta.env.BASE_URL}data`;

type Motif = "focus" | "ridge" | "living" | "inflow" | "foresight";
interface Theme {
  key: string; label: string; greek: string; meaning: string;
  accent: string; bright: string; file: string; kind: "c78q" | "quant"; motif: Motif;
}
const THEMES: Theme[] = [
  { key: "katalepsis", label: "Katalepsis", greek: "κατάληψις", meaning: "the certain grasp", accent: "#6FD6E8", bright: "#BFF0FF", file: "c78q.json", kind: "c78q", motif: "focus" },
  { key: "aristeia", label: "Aristeia", greek: "ἀριστεία", meaning: "the heroic peak", accent: "#F0C46A", bright: "#FFE3A6", file: "aristeia_strategy.json", kind: "quant", motif: "ridge" },
  { key: "auxo", label: "Auxo", greek: "Αὐξώ", meaning: "growth, increase", accent: "#5FD38A", bright: "#A6F0C4", file: "auxo_strategy.json", kind: "quant", motif: "living" },
  { key: "prosodos", label: "Prosodos", greek: "πρόσοδος", meaning: "the inflow", accent: "#46C7B8", bright: "#86E6D8", file: "prosodos_strategy.json", kind: "quant", motif: "inflow" },
  { key: "pronoia", label: "Pronoia", greek: "πρόνοια", meaning: "foresight", accent: "#9B8CFF", bright: "#C7BCFF", file: "pronoia_strategy.json", kind: "quant", motif: "foresight" },
];

interface Sig { values: number[]; cagr: number; sharpe: number }

function extract(kind: Theme["kind"], d: any): Sig | null {
  try {
    if (kind === "c78q") {
      const s = (d.backtest?.summary ?? []) as any[];
      const values = s.map((r) => r.cum_strat).filter((v) => typeof v === "number");
      const bt = d.metrics?.backtest ?? {};
      if (values.length < 4) return null;
      return { values, cagr: (bt.net_cagr ?? NaN) * 100, sharpe: bt.sharpe ?? NaN };
    }
    const ec = (d.equity_curve ?? []) as any[];
    const values = ec.map((r) => r.equity).filter((v) => typeof v === "number");
    const m = d.metrics?.in_sample ?? {};
    if (values.length < 4) return null;
    return { values, cagr: m.cagr ?? NaN, sharpe: m.sharpe ?? NaN };
  } catch {
    return null;
  }
}

const W = 372, H = 126, X0 = 14, Y0 = 16, Y1 = 104;

function Signature({ theme, sig }: { theme: Theme; sig: Sig }) {
  const { accent, bright, motif } = theme;
  const xEnd = motif === "foresight" ? 270 : W - 12;
  const v = sig.values.map((z) => Math.max(1e-6, z));
  const L = v.map((z) => Math.log10(z));
  const lo = Math.min(...L), hi = Math.max(...L), rng = hi - lo || 1;
  const n = L.length;
  const pts = L.map((z, i) => ({ x: X0 + (xEnd - X0) * (i / (n - 1)), y: Y1 - (Y1 - Y0) * ((z - lo) / rng) }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `M${X0} ${Y1} ${pts.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")} L${xEnd} ${Y1} Z`;
  const last = pts[n - 1];

  // ── motif geometry (computed from the real curve) ──
  // ridge: highest point (min-y) in each of 4 buckets → ascending apex markers
  const apexes: { x: number; y: number }[] = [];
  if (motif === "ridge") {
    const b = Math.floor(n / 4);
    for (let k = 0; k < 4; k++) {
      const seg = pts.slice(k * b, k === 3 ? n : (k + 1) * b);
      if (seg.length) apexes.push(seg.reduce((a, p) => (p.y < a.y ? p : a), seg[0]));
    }
  }
  // living: leaf nodes sampled along the curve
  const leaves = motif === "living" ? [0.22, 0.42, 0.62, 0.8, 0.94].map((f) => pts[Math.min(n - 1, Math.round(f * (n - 1)))]) : [];
  // foresight: project a cone forward from the last point using the recent slope + dispersion
  let cone: { medEnd: number; upEnd: number; loEnd: number } | null = null;
  if (motif === "foresight") {
    const k = Math.max(2, Math.round(n / 4));
    const slope = (pts[n - 1].y - pts[n - 1 - k].y) / (pts[n - 1].x - pts[n - 1 - k].x || 1);
    const fwd = W - 12 - xEnd;
    const med = Math.max(Y0, Math.min(Y1, last.y + slope * fwd));
    cone = { medEnd: med, upEnd: Math.max(Y0 - 2, med - 26), loEnd: Math.min(Y1, med + 24) };
  }

  const cagr = isNaN(sig.cagr) ? "—" : `${sig.cagr.toFixed(1)}%`;
  const sharpe = isNaN(sig.sharpe) ? "—" : sig.sharpe.toFixed(2);

  return (
    <div className="rounded-lg border bg-[#0A0E16] p-3" style={{ borderColor: `${accent}40` }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-[#E6EAF0]">
            {theme.label} <span className="ml-1 text-[11px] font-normal" style={{ color: accent }}>{theme.greek}</span>
          </div>
          <div className="text-[10px]" style={{ color: `${accent}` }}>{theme.meaning}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-base font-bold" style={{ color: accent }}>{cagr}</div>
          <div className="text-[10px] text-[#7C879B]">Sharpe {sharpe}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" preserveAspectRatio="none" style={{ height: 92 }}>
        <line x1={X0} y1={Y1} x2={W - 12} y2={Y1} stroke="#1A2233" strokeWidth={1} />

        {motif === "inflow" && [0.18, 0.4, 0.62, 0.84].map((f, i) => (
          <path key={i} d={`M${X0} ${Y0 + f * (Y1 - Y0)} Q${X0 + 26} ${pts[0].y} ${X0 + 2} ${pts[0].y}`} fill="none" stroke={accent} strokeOpacity={0.28} strokeWidth={2 + i % 2} strokeLinecap="round" />
        ))}

        <path d={area} fill={accent} fillOpacity={motif === "ridge" ? 0.12 : 0.07} />
        <path d={line} fill="none" stroke={accent} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />

        {motif === "focus" && [22, 13, 6].map((r, i) => (
          <circle key={i} cx={last.x} cy={last.y} r={r} fill="none" stroke={accent} strokeOpacity={0.25 + i * 0.2} strokeWidth={1} />
        ))}
        {motif === "focus" && <circle cx={last.x} cy={last.y} r={2.6} fill={bright} />}

        {motif === "ridge" && apexes.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.6 + i * 0.3} fill={bright} />
        ))}

        {motif === "living" && leaves.map((p, i) => (
          <g key={i}>
            <line x1={p.x} y1={p.y} x2={p.x + (i % 2 ? 9 : -9)} y2={p.y - 9} stroke={accent} strokeOpacity={0.6} strokeWidth={1.1} />
            <circle cx={p.x + (i % 2 ? 10 : -10)} cy={p.y - 10} r={2.4} fill={bright} />
          </g>
        ))}

        {motif === "foresight" && cone && (
          <>
            <line x1={xEnd} y1={Y0 - 2} x2={xEnd} y2={Y1} stroke={accent} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 3" />
            <path d={`M${last.x} ${last.y} L${W - 12} ${cone.upEnd} L${W - 12} ${cone.loEnd} Z`} fill={accent} fillOpacity={0.14} />
            <path d={`M${last.x} ${last.y} L${W - 12} ${cone.medEnd}`} fill="none" stroke={bright} strokeWidth={1.4} strokeDasharray="5 4" />
            <circle cx={W - 12} cy={cone.medEnd} r={3} fill={bright} />
            <text x={W - 14} y={cone.medEnd - 6} textAnchor="end" fontSize={9} fill={accent}>+12mo ↗</text>
          </>
        )}
      </svg>
    </div>
  );
}

export default function StrategySignatures() {
  const [sigs, setSigs] = useState<Record<string, Sig> | null>(null);
  useEffect(() => {
    Promise.all(
      THEMES.map((t) => fetch(`${BASE}/${t.file}`).then((r) => (r.ok ? r.json() : null)).then((d) => [t.key, d ? extract(t.kind, d) : null] as const).catch(() => [t.key, null] as const))
    ).then((pairs) => {
      const out: Record<string, Sig> = {};
      pairs.forEach(([k, s]) => { if (s) out[k] = s; });
      setSigs(out);
    });
  }, []);

  return (
    <Card title="✦ Strategy signatures" sub="Each strategy's real backtest equity curve, drawn in a motif built from the Greek meaning of its name. Log-scaled; CAGR/Sharpe from the backtest.">
      {!sigs ? (
        <Spinner label="Loading signatures…" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {THEMES.filter((t) => sigs[t.key]).map((t) => (
            <Signature key={t.key} theme={t} sig={sigs[t.key]} />
          ))}
        </div>
      )}
    </Card>
  );
}
