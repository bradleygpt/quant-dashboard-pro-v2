// Faithful TS port of doppelganger.py (find_doppelgangers, compute_similarity,
// _normalize_value, build_fingerprint, _era_bucket) + doppelganger_returns.py
// (aggregate_forward_returns). Fully deterministic over the baked universe.
// Verified against the Python source — see web/scripts/validate-doppelganger.ts.
import type { ViewRow } from "../store";

export interface DimConfig { weight: number; log: boolean; cap_low: number; cap_high: number }
export interface Analog {
  company: string; era: string; sector: string;
  narrative?: string; context?: string; outcome?: string; lesson?: string; tags?: string[];
  [k: string]: unknown;
}
export interface ForwardReturn { "1yr": number; "3yr": number; "5yr": number; confidence: string; narrative: string }
export interface DoppelDB {
  fingerprint_dimensions: Record<string, DimConfig>;
  historical_analogs: Record<string, Analog>;
  forward_returns: Record<string, ForwardReturn>;
  stats: { total_analogs: number; sectors: string[]; sector_counts: Record<string, number>; eras_covered: string[]; tags: string[] };
  tags: string[];
}

export interface Match {
  match_key: string; company: string; era: string; era_bucket: string; similarity: number;
  data: Analog; sector: string; context: string; outcome: string; lesson: string; narrative: string;
  tags: string[]; same_sector: boolean;
}

function normalize(value: unknown, cfg: DimConfig): number | null {
  if (value == null || (typeof value === "number" && Number.isNaN(value))) return null;
  let v = Number(value);
  if (!Number.isFinite(v)) return null;
  v = Math.max(cfg.cap_low, Math.min(cfg.cap_high, v));
  if (cfg.log) {
    const logMin = Math.log10(Math.max(0.01, cfg.cap_low));
    const logMax = Math.log10(cfg.cap_high);
    const logV = Math.log10(Math.max(0.01, v));
    return (logV - logMin) / (logMax - logMin);
  }
  return (v - cfg.cap_low) / (cfg.cap_high - cfg.cap_low);
}

function fingerprint(data: Record<string, unknown>, dims: Record<string, DimConfig>): Record<string, number | null> {
  const fp: Record<string, number | null> = {};
  for (const [dim, cfg] of Object.entries(dims)) fp[dim] = normalize(data[dim], cfg);
  return fp;
}

function similarity(fp1: Record<string, number | null>, fp2: Record<string, number | null>, dims: Record<string, DimConfig>): number {
  let totalDist = 0, totalWeight = 0, matched = 0;
  for (const [dim, cfg] of Object.entries(dims)) {
    const v1 = fp1[dim], v2 = fp2[dim];
    if (v1 == null || v2 == null) continue;
    totalDist += (v1 - v2) ** 2 * cfg.weight;
    totalWeight += cfg.weight;
    matched++;
  }
  const nDims = Object.keys(dims).length;
  if (matched < 4 || totalWeight === 0) return 0;
  const normDist = Math.sqrt(totalDist / totalWeight);
  const sim = Math.max(0, 1 - normDist);
  return sim * (matched / nDims);
}

export function eraBucket(eraStr: string): string {
  const m = (eraStr || "").match(/(\d{4})/);
  if (!m) return eraStr || "unknown";
  const y = parseInt(m[1], 10);
  if (y >= 1999 && y <= 2001) return "1999-2001 (dot-com peak)";
  if (y >= 2008 && y <= 2009) return "2008-2009 (financial crisis)";
  if (y >= 2010 && y <= 2012) return "2010-2012 (post-crisis recovery)";
  if (y >= 2013 && y <= 2015) return "2013-2015 (mid-cycle expansion)";
  if (y >= 2016 && y <= 2018) return "2016-2018 (late-cycle growth)";
  if (y >= 2019 && y <= 2020) return "2019-2020 (pre-COVID / COVID)";
  if (y >= 2021 && y <= 2022) return "2021-2022 (post-COVID + correction)";
  if (y >= 2023 && y <= 2024) return "2023-2024 (AI era)";
  return `${y} (other)`;
}

// Build the fingerprint input dict from a ViewRow (matches scored_df.loc[ticker])
function rowFeatures(r: ViewRow): Record<string, unknown> {
  return {
    trailingPE: r.raw.trailingPE,
    priceToSalesTrailing12Months: r.raw.priceToSalesTrailing12Months,
    revenueGrowth: r.raw.revenueGrowth,
    profitMargins: r.raw.profitMargins,
    grossMargins: r.raw.grossMargins,
    momentum_12m: r.raw.momentum_12m,
    returnOnEquity: r.raw.returnOnEquity,
    marketCapB: r.marketCapB,
  };
}

export function findDoppelgangers(
  row: ViewRow, db: DoppelDB, opts: { topN?: number; sectorFilter?: string; tagFilter?: string | null; dedupeEras?: boolean } = {},
): Match[] {
  const { topN = 5, sectorFilter = "same", tagFilter = null, dedupeEras = true } = opts;
  const dims = db.fingerprint_dimensions;
  const currentFp = fingerprint(rowFeatures(row), dims);
  const currentSector = row.sector;

  let matches: Match[] = [];
  for (const [key, analog] of Object.entries(db.historical_analogs)) {
    if (sectorFilter === "same") { if (analog.sector !== currentSector) continue; }
    else if (sectorFilter === "any") { /* no filter */ }
    else if (analog.sector !== sectorFilter) continue;
    if (tagFilter && !(analog.tags ?? []).includes(tagFilter)) continue;

    const analogFp = fingerprint(analog as Record<string, unknown>, dims);
    const sim = similarity(currentFp, analogFp, dims);
    if (sim > 0.3) {
      matches.push({
        match_key: key, company: analog.company, era: analog.era, era_bucket: eraBucket(analog.era ?? ""),
        similarity: Math.round(sim * 1000) / 1000, data: analog, sector: analog.sector ?? "N/A",
        context: analog.context ?? "", outcome: analog.outcome ?? "", lesson: analog.lesson ?? "",
        narrative: analog.narrative ?? "", tags: analog.tags ?? [], same_sector: analog.sector === currentSector,
      });
    }
  }
  // stable sort by similarity desc (matches Python's list.sort stability)
  matches = matches.map((m, i) => [m, i] as const)
    .sort((a, b) => (b[0].similarity - a[0].similarity) || (a[1] - b[1])).map(([m]) => m);
  if (dedupeEras) {
    const seen = new Set<string>(); const dd: Match[] = [];
    for (const m of matches) if (!seen.has(m.era_bucket)) { seen.add(m.era_bucket); dd.push(m); }
    matches = dd;
  }
  return matches.slice(0, topN);
}

export interface AggResult {
  weighted_1yr_pct: number; weighted_3yr_pct: number; weighted_5yr_pct: number;
  median_1yr_pct: number; median_3yr_pct: number; median_5yr_pct: number;
  best_1yr: number; worst_1yr: number; best_5yr: number; worst_5yr: number;
  contributing_count: number; missing_count: number;
}
function med(xs: number[]): number { return xs.length ? Math.round(xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] * 10) / 10 : 0; }

export function aggregateForwardReturns(matches: Match[], fr: Record<string, ForwardReturn>): AggResult | null {
  if (!matches.length) return null;
  let w1 = 0, w3 = 0, w5 = 0, tw = 0, missing = 0;
  const r1: number[] = [], r3: number[] = [], r5: number[] = [];
  for (const m of matches) {
    const f = fr[m.match_key];
    if (!f) { missing++; continue; }
    w1 += f["1yr"] * m.similarity; w3 += f["3yr"] * m.similarity; w5 += f["5yr"] * m.similarity;
    tw += m.similarity; r1.push(f["1yr"]); r3.push(f["3yr"]); r5.push(f["5yr"]);
  }
  if (tw === 0) return null;
  return {
    weighted_1yr_pct: Math.round((w1 / tw) * 10) / 10, weighted_3yr_pct: Math.round((w3 / tw) * 10) / 10,
    weighted_5yr_pct: Math.round((w5 / tw) * 10) / 10,
    median_1yr_pct: med(r1), median_3yr_pct: med(r3), median_5yr_pct: med(r5),
    best_1yr: Math.max(...r1), worst_1yr: Math.min(...r1), best_5yr: Math.max(...r5), worst_5yr: Math.min(...r5),
    contributing_count: r1.length, missing_count: missing,
  };
}
