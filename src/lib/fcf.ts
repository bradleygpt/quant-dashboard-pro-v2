import { useEffect, useState } from "react";

// Shared loader for the FCF-distortion dataset (built by the EDGAR engine in quant-dashboard-react).
// Module-cached so the screener + stock-detail panel share one fetch.
const BASE = `${import.meta.env.BASE_URL}data`;
export type FcfRow = {
  ticker: string; name?: string; sector?: string; market_cap?: number | null;
  fcf_reported: number | null; fcf_fully_adjusted: number | null; sbc: number | null;
  sbc_pct_ocf: number | null; sbc_pct_mktcap: number | null;
  reported_fcf_yield: number | null; true_fcf_yield: number | null;
  total_distortion_usd?: number | null; cash_tax_below_normal?: boolean; fully_adjusted_complete?: boolean;
};
let cache: Map<string, FcfRow> | null = null;
let inflight: Promise<Map<string, FcfRow> | null> | null = null;
function load(): Promise<Map<string, FcfRow> | null> {
  if (cache) return Promise.resolve(cache);
  if (!inflight)
    inflight = fetch(`${BASE}/fcf_distortion.json`).then((r) => (r.ok ? r.json() : null)).then((d: { rows: FcfRow[] } | null) => {
      cache = d ? new Map(d.rows.map((x) => [x.ticker, x])) : null;
      return cache;
    }).catch(() => null);
  return inflight;
}
export function useFcfMap(): Map<string, FcfRow> | null {
  const [m, setM] = useState<Map<string, FcfRow> | null>(cache);
  useEffect(() => { load().then(setM); }, []);
  return m;
}

// Compact verdict flag for the screener column: short label + colour + severity rank (for sorting).
export function fcfFlag(r?: FcfRow | null): { short: string; color: string; rank: number } {
  if (!r || r.sbc == null) return { short: "—", color: "#5A6477", rank: -1 };
  if (r.fcf_fully_adjusted != null && r.fcf_fully_adjusted < 0 && r.fcf_reported != null && r.fcf_reported > 0)
    return { short: "Neg", color: "#FF4D4D", rank: 5 };
  const p = r.sbc_pct_ocf;
  if (p == null) return { short: "—", color: "#5A6477", rank: -1 };
  if (p < 0) return { short: "OCF<0", color: "#FF8A3D", rank: 4 };
  if (p < 0.10) return { short: "Clean", color: "#00C805", rank: 1 };
  if (p < 0.30) return { short: "Mod", color: "#FBBF24", rank: 2 };
  if (p < 0.70) return { short: "Heavy", color: "#FF8A3D", rank: 3 };
  return { short: "SBC-fed", color: "#FF4D4D", rank: 4 };
}
