// Self-contained mock data for the tri-star landing demo.
// NOTHING here is wired to the live stores yet — art sign-off comes first.
// The system_status object below is hardcoded straight from the handoff and
// mirrors the schema the bake pipeline will eventually emit to
// web/public/data/system_status.json.

export interface SystemStatus {
  bake: { fresh: boolean; at: string };
  engines: {
    binary: { current: boolean; asOf: string };
    return: { current: boolean; asOf: string };
  };
  ppi: { score: number; level: string };
  c78q: { pnl: number; nextRebalance: string };
  market: { state: MarketStateKey };
}

export type MarketStateKey = "rth" | "pre" | "after" | "closed";

export const SYSTEM_STATUS: SystemStatus = {
  bake: { fresh: true, at: "2026-06-10T18:21:00" },
  engines: {
    binary: { current: true, asOf: "2026-06-05" },
    return: { current: true, asOf: "2026-06-05" },
  },
  ppi: { score: 55, level: "ELEVATED" },
  c78q: { pnl: 2.3, nextRebalance: "2026-07-01" },
  market: { state: "rth" },
};

// ----- The three suns = the three core engines --------------------------------
// QUANT (scoring/FV/rating), MLPRED (prediction ensemble), THESIS (LLM thesis,
// in development → nascent/dim, honestly). Pipeline/bake health is NOT a sun —
// it lives in the HUD status strip where plumbing belongs.

export interface SunDef {
  id: "quant" | "mlpred" | "thesis";
  name: string;
  role: string;
  /** one-line engine status shown on hover (suns are ambient, not clickable). */
  status: string;
  /** Black-body-ish color temperature for the corona/core tint. */
  color: string;
  /** Relative gravitational mass for the tri-star sim. */
  mass: number;
  /** 0..1 luminosity — THESIS is nascent, so it reads dimmer. */
  lum: number;
  /** 0 calm .. 1 seething. Degradation, NOT nascency (a young engine is calm). */
  agitation: number;
}

function engineState(s: SystemStatus): Record<SunDef["id"], { lum: number; agitation: number }> {
  const mlOk = s.engines.return.current; // MLPred ≈ the return engine's currency
  return {
    quant: { lum: 1.0, agitation: 0.0 },
    mlpred: { lum: mlOk ? 1.0 : 0.5, agitation: mlOk ? 0.0 : 0.6 },
    thesis: { lum: 0.58, agitation: 0.12 }, // in development: dim, but calm — not broken
  };
}

const ES = engineState(SYSTEM_STATUS);

export const SUNS: SunDef[] = [
  { id: "quant", name: "QUANT", role: "Scoring · FV · rating", status: "online · universe scored", color: "#FFE3A8", mass: 1.04, lum: ES.quant.lum, agitation: ES.quant.agitation },
  { id: "mlpred", name: "MLPRED", role: "Prediction ensemble", status: `targets current · ${SYSTEM_STATUS.engines.return.asOf}`, color: "#CFE0FF", mass: 1.0, lum: ES.mlpred.lum, agitation: ES.mlpred.agitation },
  { id: "thesis", name: "THESIS", role: "LLM thesis engine", status: "in development · nascent", color: "#FF9E5A", mass: 0.92, lum: ES.thesis.lum, agitation: ES.thesis.agitation },
];

// ----- chaos parameter --------------------------------------------------------
// Overall system stress: PPI score / 100, plus a penalty when the pipeline is
// stale or the prediction engine is behind. PPI 55 ELEVATED + all current → ~0.55.

export function computeChaos(s: SystemStatus = SYSTEM_STATUS): number {
  const base = s.ppi.score / 100;
  const unhealthy = (s.bake.fresh ? 0 : 1) + (s.engines.return.current ? 0 : 1);
  return Math.min(1, Math.max(0, base + unhealthy * 0.15));
}

export const ERA = (chaos: number) => (chaos < 0.5 ? "STABLE ERA" : "CHAOTIC ERA");

// ----- The planets = the app's tabs ------------------------------------------
// band: 0 inner (strategies), 1 middle (instruments), 2 outer (context),
// 3 far satellites (folded Pundit / ETF / Help so the outer ring never crowds).
// c78q is the brightest INNER planet — it is downstream of MLPred, not a pillar.

export interface PlanetDef {
  /** maps to a real tab id in the registry, for the mock fly-to nav. */
  tabId: string;
  name: string;
  /** restrained signature accent — only shown on hover. */
  accent: string;
  status: string;
  band: 0 | 1 | 2 | 3;
  /** starting true anomaly (radians). */
  phase: number;
  /** body radius in world units. */
  size: number;
  /** orbital eccentricity (kept gentle). */
  ecc: number;
  /** orbital inclination (radians). */
  incl: number;
  /** angular speed multiplier. */
  speed: number;
  /** render as a thin ring instead of a sphere (AI Bubble Watch). */
  ring?: boolean;
  /** brightest inner planet — a self-lit accent body (c78q). */
  flagship?: boolean;
}

export const PLANETS: PlanetDef[] = [
  // inner band — strategies. c78q is the flagship (self-lit, brightest planet).
  { tabId: "bh", name: "c78q Strategy", accent: "#00C805", status: "P&L +2.3% · rebal 07-01", band: 0, phase: 0.2, size: 0.50, ecc: 0.10, incl: 0.05, speed: 1.00, flagship: true },
  { tabId: "mlpred", name: "ML Predictions", accent: "#5BA8FF", status: "targets current · 06-05", band: 0, phase: 1.9, size: 0.42, ecc: 0.14, incl: -0.08, speed: 0.92 },
  { tabId: "quantport", name: "Quant Portfolio", accent: "#7FB0FF", status: "12 holds · drift 0.4%", band: 0, phase: 3.5, size: 0.50, ecc: 0.08, incl: 0.10, speed: 0.86 },
  { tabId: "portfolio", name: "Your Portfolio", accent: "#FF9800", status: "watchlist · 8 tickers", band: 0, phase: 5.1, size: 0.44, ecc: 0.12, incl: -0.04, speed: 0.80 },
  // middle band — instruments
  { tabId: "detail", name: "Stock Detail", accent: "#5BA8FF", status: "last view · NVDA", band: 1, phase: 0.7, size: 0.40, ecc: 0.09, incl: 0.12, speed: 0.66 },
  { tabId: "screener", name: "Quant Screener", accent: "#9CA7BB", status: "412 names · floor B", band: 1, phase: 2.3, size: 0.52, ecc: 0.07, incl: -0.10, speed: 0.61 },
  { tabId: "doppel", name: "Doppelganger", accent: "#7FB0FF", status: "analogs ready", band: 1, phase: 3.9, size: 0.43, ecc: 0.13, incl: 0.06, speed: 0.57 },
  { tabId: "sectors", name: "Sector Overview", accent: "#5BA8FF", status: "11 sectors · breadth+", band: 1, phase: 5.6, size: 0.47, ecc: 0.10, incl: -0.07, speed: 0.53 },
  // outer band — context
  { tabId: "regime", name: "Market Regime", accent: "#FF9800", status: "ELEVATED · PPI 55", band: 2, phase: 1.1, size: 0.38, ecc: 0.16, incl: 0.14, speed: 0.40 },
  { tabId: "aibubble", name: "AI Bubble Watch", accent: "#FF5722", status: "froth index 0.62", band: 2, phase: 2.9, size: 0.62, ecc: 0.05, incl: -0.18, speed: 0.36, ring: true },
  { tabId: "crypto", name: "Crypto", accent: "#FFA133", status: "BTC regime · risk-on", band: 2, phase: 4.7, size: 0.41, ecc: 0.12, incl: 0.09, speed: 0.33 },
  // far satellites — folded context
  { tabId: "voices", name: "Pundit Views", accent: "#9CA7BB", status: "14 voices tracked", band: 3, phase: 0.4, size: 0.30, ecc: 0.20, incl: 0.22, speed: 0.22 },
  { tabId: "etfs", name: "ETF Center", accent: "#7FB0FF", status: "flows · 06-09", band: 3, phase: 2.5, size: 0.32, ecc: 0.18, incl: -0.24, speed: 0.20 },
  { tabId: "help", name: "Help", accent: "#7C879B", status: "docs · shortcuts", band: 3, phase: 4.4, size: 0.27, ecc: 0.22, incl: 0.18, speed: 0.18 },
];

/** Base orbital semi-major axis (world units) for each band. */
export const BAND_RADIUS: Record<number, number> = { 0: 5.4, 1: 8.2, 2: 11.4, 3: 14.6 };

// ----- market-clock lighting: a true day/night cycle -------------------------
// Trading hours read as DAYTIME (lit sky-blue atmosphere), not bright space.
//   Open  = day   (sky blue, suns as bright white-gold presences in a lit sky)
//   Pre   = dawn gradient   |   Post = dusk gradient
//   Closed = deep space, orbits frozen (the original night void)
// sky{Top,Bottom} drive the gradient sky dome; bg/fog tint the depth haze.

export interface LightingTarget {
  key: MarketStateKey;
  label: string;
  blurb: string;
  sunIntensity: number;
  rim: number;
  starOpacity: number;
  bloom: number;
  ember: number; // 0 = full color temp, 1 = reduced to red embers
  ambient: number;
  exposure: number;
  frozen: boolean;
  /** background depth-haze color (also the fog color). */
  bg: string;
  /** gradient sky dome — zenith and horizon colors. */
  skyTop: string;
  skyBottom: string;
}

export const LIGHTING: Record<MarketStateKey, LightingTarget> = {
  rth: {
    key: "rth", label: "Market Open", blurb: "daylight trading floor · lit sky",
    sunIntensity: 1.0, rim: 0.85, starOpacity: 0.0, bloom: 0.85, ember: 0.0, ambient: 0.55, exposure: 1.06, frozen: false,
    bg: "#8EC0E6", skyTop: "#2E6FB7", skyBottom: "#CFE7F6",
  },
  pre: {
    key: "pre", label: "Pre-Market", blurb: "dawn gradient · cool→warm",
    sunIntensity: 0.82, rim: 0.9, starOpacity: 0.34, bloom: 1.0, ember: 0.08, ambient: 0.3, exposure: 0.98, frozen: false,
    bg: "#3A4068", skyTop: "#152044", skyBottom: "#E0975A",
  },
  after: {
    key: "after", label: "After Hours", blurb: "dusk · stars emerging",
    sunIntensity: 0.5, rim: 0.74, starOpacity: 0.74, bloom: 0.9, ember: 0.3, ambient: 0.16, exposure: 0.9, frozen: false,
    bg: "#171a36", skyTop: "#0B1030", skyBottom: "#7A3F58",
  },
  closed: {
    key: "closed", label: "Closed / Holiday", blurb: "deep void · embers · orbits frozen",
    sunIntensity: 0.22, rim: 0.42, starOpacity: 1.0, bloom: 0.74, ember: 0.7, ambient: 0.06, exposure: 0.82, frozen: true,
    bg: "#04060b", skyTop: "#04060b", skyBottom: "#05080f",
  },
};

export const MARKET_ORDER: MarketStateKey[] = ["rth", "pre", "after", "closed"];

/** Daylight states want dark HUD ink + light scrims; night states keep light ink. */
export const isDaylight = (k: MarketStateKey): boolean => k === "rth";
