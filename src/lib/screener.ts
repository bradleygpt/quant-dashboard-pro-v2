// Faithful port of advanced_screener.apply_advanced_filters (filtering only —
// no recomputation of any scored value). Operates on baked ViewRows.
import type { ViewRow } from "../store";
import type { FilterMetric, ScreenerConfig } from "./types";

export function metricValue(row: ViewRow, key: string): number | null {
  if (key === "marketCapB") return row.marketCapB;
  if (key === "currentPrice") return row.price;
  const v = row.raw[key];
  return v == null ? null : v;
}

export function flattenMetrics(cfg: ScreenerConfig): { cat: string; m: FilterMetric }[] {
  const out: { cat: string; m: FilterMetric }[] = [];
  for (const [cat, metrics] of Object.entries(cfg.filterable_metrics))
    for (const m of metrics) out.push({ cat, m });
  return out;
}

export interface ScreenFilters {
  ratings: string[];          // empty = all
  sectors: string[];          // empty = all
  fvVerdicts: string[];       // empty = all (applied after)
  underQbp: boolean;
  metricRanges: Record<string, [number, number]>; // key -> [min,max] in DISPLAY units
}

export function applyScreen(rows: ViewRow[], f: ScreenFilters, cfg: ScreenerConfig): ViewRow[] {
  const pctKeys = new Set<string>();
  for (const arr of Object.values(cfg.filterable_metrics))
    for (const m of arr) if (m.type === "pct_range") pctKeys.add(m.key);

  let r = rows;
  if (f.ratings.length) { const s = new Set(f.ratings); r = r.filter((x) => s.has(x.rating)); }
  if (f.sectors.length) { const s = new Set(f.sectors); r = r.filter((x) => x.sector != null && s.has(x.sector)); }
  if (f.underQbp) r = r.filter((x) => x.qbp != null && x.price != null && x.price <= x.qbp);

  for (const [key, [lo, hi]] of Object.entries(f.metricRanges)) {
    const isPct = pctKeys.has(key);
    const min = isPct ? lo / 100 : lo;
    const max = isPct ? hi / 100 : hi;
    r = r.filter((x) => {
      const v = metricValue(x, key);
      if (v == null) return true; // matches pandas `... | col.isna()` — nulls pass
      return v >= min && v <= max;
    });
  }
  // fair-value verdict filter applied last (mirrors Streamlit ordering)
  if (f.fvVerdicts.length) { const s = new Set(f.fvVerdicts); r = r.filter((x) => x.fvVerdict != null && s.has(x.fvVerdict)); }
  return r;
}
