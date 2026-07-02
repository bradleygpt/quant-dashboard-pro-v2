// ─────────────────────────────────────────────────────────────────────────────
// theme.ts — the single color vocabulary for the dashboard.
//
// WHY A TS MODULE (and not only CSS variables): Recharts and <canvas> consume
// colors as JS string props (SVG presentation attributes don't resolve var()),
// and several call sites compose alpha dynamically. So the canonical constants
// live here. The class-facing subset is MIRRORED as Tailwind v4 @theme tokens
// in src/index.css (utilities like bg-panel / text-mute); checkThemeSync()
// below asserts the two files agree at dev runtime, so the mirror can't drift
// silently.
//
// Palette validated with the dataviz skill validator (dark surface #121723):
//  · ENTITY full-8 in canonical adjacency order: ALL CHECKS PASS
//    (worst adjacent CVD ΔE 13.3 deutan; lightness band + chroma + contrast ok)
//  · ENTITY active-5 all-pairs: PASS with one floor-band pair
//    (auxo↔aristeia ΔE 8.2 deutan) — legal with secondary encoding, which the
//    hub provides: per-series legend labels, live/paper dash, tooltips.
//  · benchmark gray fails chroma floor BY DESIGN (a reference, not a series);
//    it always renders dashed + direct-labeled "SPY".
//  · SEMANTIC: pos↔neg CVD ΔE 26.0 deutan (the retired #FF5722 scored 4.8).
//    warn↔pos ΔE 6.4 protan is below floor — accepted because these are status
//    colors that never appear without their text label (ratings/grades render
//    their names; signed values carry +/−), per the skill's status-color rule.
//  · REGIME 3-state: CVD pass (worst 33.0); neutral is sub-chroma/contrast BY
//    DESIGN (neutral should recede); ribbon ships tooltip + legend as relief.
//  · DIVERGING poles: CVD ΔE 109 protan, contrast pass. (The categorical
//    lightness-band check does not apply to diverging ramps per skill scope.)
// ─────────────────────────────────────────────────────────────────────────────

/** Surface elevation levels (dark theme only — the app is dark-only). */
export const SURFACE = {
  page: "#0B0E14",     // document body
  inset: "#0C0F16",    // recessed inlays inside panels (ticker chips, wells)
  head: "#0F1420",     // table headers, tooltips, form controls
  panel: "#121723",    // cards — the default chart surface
  hoverRow: "#141B27", // table-row hover wash
  hover: "#161D29",    // button/nav hover wash
  raised: "#1A2130",   // chips, inactive pills
  active: "#1B2433",   // selected nav / active toggle
} as const;

/** Hairlines. faint intentionally shares hover's hex — same recession level. */
export const LINE = {
  faint: "#161D29",    // table row separators
  line: "#1E2632",     // default border
  strong: "#2A3242",   // emphasized border / scrollbar
} as const;

/** Text hierarchy. */
export const INK = {
  ink: "#E6E9EF",      // primary
  ink2: "#C3CAD7",     // strong secondary (absorbs the old #C7CEDA)
  ink3: "#9CA7BB",     // secondary
  mute: "#7C879B",     // labels, captions
  dim: "#5A6477",      // footnotes (absorbs the old #5C6678)
  white: "#FFFFFF",
} as const;

/**
 * Semantic status colors — ONE hue per role. posSoft/warnHot/negDeep/posHi are
 * ordinal steps of the same three roles for the graded ramps below; they are
 * not additional hues to pick freely. Status colors never appear without a
 * text label (that label is the CVD relief channel).
 */
export const SEM = {
  pos: "#00C805",      // gains, up, live-ok  (7.9:1 on panel)
  posHi: "#00E85C",    // ordinal "extreme good" step (Strong Buy+)
  posSoft: "#8BC34A",  // ordinal "good" step (Buy, B grades)
  warn: "#FFC107",     // caution (11.0:1)
  warnHot: "#FF9800",  // ordinal "elevated" step
  neg: "#F0565A",      // losses, down, errors (5.3:1; deutan ΔE 26 vs pos)
  negDeep: "#D64545",  // ordinal "extreme bad" step (Strong Sell, EXTREME)
  link: "#5BA8FF",     // interactive text, clickable tickers (7.2:1)
  cta: "#1D4ED8",      // filled buttons/controls — deep step of link so white
                       // label text keeps ≥4.5:1 (link itself is too light)
} as const;

/** Brass — Katalepsis AND the live-money accent (broker-confirmed = brass). */
export const BRASS = {
  brass: "#BA7517",    // series stroke / accents (4.8:1 — ok for bold text)
  bright: "#D19A3A",   // small-text step (7.2:1)
} as const;

/** Paper/research accent — signal-derived books, never broker money. */
export const PAPER = "#D8B878";

/**
 * Entity series — one fixed hue per strategy, forever. Color follows the
 * entity, never rank or filter order. Katalepsis wears brass (live-money).
 * benchmark (SPY/index references) is deliberately neutral: always dashed +
 * direct-labeled, never counted as a categorical slot.
 */
export const ENTITY = {
  katalepsis: BRASS.brass,
  aristeia: "#3D8FEF",
  auxo: "#A855F7",
  prosodos: "#18A67F",
  pronoia: "#C84D8F",
  axia: "#6B7FE8",     // retired 2026-06-20 — hue reserved for historical views
  horme: "#7E9C34",    // retired
  krasis: "#C25A5A",   // retired
  benchmark: "#9AA3B5",
} as const;
export type EntitySlug = keyof typeof ENTITY;

/** Canonical adjacency order for multi-entity charts (validated: min adjacent CVD ΔE 13.3). */
export const ENTITY_ORDER: EntitySlug[] = [
  "katalepsis", "aristeia", "pronoia", "prosodos", "auxo", "horme", "krasis", "axia",
];

/** Fixed hue per entity, with a safe fallback for unknown slugs. */
export function entityColor(slug: string): string {
  return (ENTITY as Record<string, string>)[slug.toLowerCase()] ?? ENTITY.benchmark;
}

/**
 * Live/paper series treatment: paper books render as a TRANSFORM of the
 * entity hue (dash + reduced opacity), never a different hue.
 */
export const PAPER_SERIES = { dash: "6 3", opacity: 0.75 } as const;
export const BENCH_SERIES = { dash: "2 3", width: 1.4 } as const;

/** Market regime states — defined once, used by every RegimeRibbon. */
export const REGIME = {
  risk_on: { color: "#1FA35C", label: "Risk-on" },
  neutral: { color: "#566073", label: "Neutral" },   // recessive by design
  drawdown: { color: "#C74B42", label: "Drawdown" },
} as const;
export type RegimeState = keyof typeof REGIME;

/** Collapse the ML classifier's 5 regimes onto the 3 display states. */
export function mapMlRegime(dominant: string): RegimeState {
  switch (dominant) {
    case "early_bull":
    case "late_bull": return "risk_on";
    case "correction":
    case "panic": return "drawdown";
    default: return "neutral"; // range_bound + anything unknown
  }
}

/** Diverging pair for correlation/polarity: warm + / cool − / neutral gray 0. */
export const DIVERGING = {
  warm: "#D9A441",     // positive co-movement
  cool: "#4A97F5",     // negative co-movement
  mid: "#1B222E",      // |v| ≈ 0 reads as "nothing"
} as const;

/** c78q signal-stream families (price / fundamentals / event) — defined once. */
export const STREAM = {
  price: "#3FB984",
  fundamental: "#5B8BC4",
  event: "#9B7FC9",
} as const;

/** Fixed brand hues for crypto assets (entity rule: color follows the asset). */
export const ASSET = {
  btc: "#F7931A",
  eth: "#00D4AA",
} as const;

// ── Graded ramps (ordinal steps of the semantic roles — the ONLY place a
//    rating/grade/band color may come from) ──────────────────────────────────

export const RATING_COLORS: Record<string, string> = {
  "Strong Buy+": SEM.posHi,
  "Strong Buy": SEM.pos,
  Buy: SEM.posSoft,
  Hold: SEM.warn,
  Sell: SEM.neg,
  "Strong Sell": SEM.negDeep,
};

export const GRADE_COLORS: Record<string, string> = {
  "A+": SEM.pos, A: SEM.pos, "A-": SEM.posSoft,
  "B+": SEM.posSoft, B: SEM.posSoft, "B-": SEM.posSoft,
  "C+": SEM.warn, C: SEM.warn, "C-": SEM.warnHot,
  "D+": SEM.neg, D: SEM.neg, F: SEM.negDeep,
};

/** 5-band risk scales (PPI bands, fear/greed) — good → catastrophic. */
export const RISK_RAMP = [SEM.pos, SEM.posSoft, SEM.warnHot, SEM.neg, SEM.negDeep] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** rgba() of a #rrggbb hex at the given alpha (0–1). */
export function alpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Dev-only mirror guard ────────────────────────────────────────────────────
// The Tailwind @theme block in index.css must stay in lockstep with the
// class-facing tokens above. In dev, verify the computed CSS vars match.
const CSS_MIRROR: Record<string, string> = {
  "--color-page": SURFACE.page, "--color-inset": SURFACE.inset, "--color-head": SURFACE.head,
  "--color-panel": SURFACE.panel, "--color-hover-row": SURFACE.hoverRow, "--color-hover": SURFACE.hover,
  "--color-raised": SURFACE.raised, "--color-active": SURFACE.active,
  "--color-line-faint": LINE.faint, "--color-line": LINE.line, "--color-line-2": LINE.strong,
  "--color-ink": INK.ink, "--color-ink-2": INK.ink2, "--color-ink-3": INK.ink3,
  "--color-mute": INK.mute, "--color-dim": INK.dim,
  "--color-pos": SEM.pos, "--color-pos-soft": SEM.posSoft, "--color-neg": SEM.neg,
  "--color-warn": SEM.warn, "--color-warn-hot": SEM.warnHot, "--color-link": SEM.link,
  "--color-brass": BRASS.brass, "--color-brass-hi": BRASS.bright, "--color-paper": PAPER,
  "--color-cta": SEM.cta, "--color-btc": ASSET.btc,
};

if (import.meta.env.DEV && typeof window !== "undefined") {
  requestAnimationFrame(() => {
    const cs = getComputedStyle(document.documentElement);
    for (const [k, v] of Object.entries(CSS_MIRROR)) {
      const got = cs.getPropertyValue(k).trim().toUpperCase();
      if (got && got !== v.toUpperCase()) {
        console.error(`[theme] CSS mirror drift: ${k} is ${got} in index.css but ${v} in theme.ts`);
      }
    }
  });
}
