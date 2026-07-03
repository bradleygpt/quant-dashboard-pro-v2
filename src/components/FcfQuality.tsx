import { useEffect, useState } from "react";
import { Card } from "./ui";
import { INK, SEM } from "../theme";
import { loadDataJSON } from "../lib/data";

// FCF-quality (distortion) per-name panel. Reads fcf_distortion.json (built by the EDGAR-backed
// engine in quant-dashboard-react), module-cached, and shows whether a name's reported FCF is real
// once SBC is expensed. v1 = SBC-expensed (the defensible adjustment); cash-tax is a flag only.
const BASE = `${import.meta.env.BASE_URL}data`;
type Row = {
  ticker: string; name?: string; sector?: string; market_cap?: number | null;
  fcf_reported: number | null; fcf_fully_adjusted: number | null; sbc: number | null;
  sbc_pct_ocf: number | null; sbc_pct_mktcap: number | null;
  reported_fcf_yield: number | null; true_fcf_yield: number | null;
  total_distortion_usd: number | null; cash_tax_below_normal?: boolean; fully_adjusted_complete?: boolean;
};
type Data = { generated_at: string; version: string; rows: Row[] };
let cache: Map<string, Row> | null = null;
let inflight: Promise<Map<string, Row> | null> | null = null;
function load(): Promise<Map<string, Row> | null> {
  if (cache) return Promise.resolve(cache);
  if (!inflight)
    inflight = loadDataJSON<Data>("fcf_distortion.json").then((d) => {
      cache = d ? new Map(d.rows.map((x) => [x.ticker, x])) : null;
      return cache;
    }).catch(() => null);
  return inflight;
}

const b = (x: number | null | undefined) => (x == null ? "—" : `${x < 0 ? "-" : ""}$${Math.abs(x / 1e9).toFixed(2)}B`);
const pct = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);

function verdict(r: Row): { label: string; color: string } {
  if (r.fcf_fully_adjusted != null && r.fcf_fully_adjusted < 0 && r.fcf_reported != null && r.fcf_reported > 0)
    return { label: "Reported FCF turns NEGATIVE once SBC is expensed", color: SEM.neg };
  const p = r.sbc_pct_ocf;
  if (p == null) return { label: "Insufficient SBC / cash-flow data", color: INK.mute };
  if (p < 0) return { label: "Operating cash flow is negative", color: SEM.neg };
  if (p < 0.10) return { label: "Clean — SBC is a small slice of cash flow", color: SEM.pos };
  if (p < 0.30) return { label: "Moderate — SBC flatters FCF", color: SEM.warn };
  if (p < 0.70) return { label: "Heavy — SBC inflates FCF materially", color: SEM.warnHot };
  return { label: "Reported FCF is mostly the SBC add-back", color: SEM.neg };
}

export default function FcfQuality({ ticker }: { ticker: string | null }) {
  const [m, setM] = useState<Map<string, Row> | null>(cache);
  const [loaded, setLoaded] = useState(!!cache);
  useEffect(() => { load().then((x) => { setM(x); setLoaded(true); }); }, []);
  if (!ticker) return null;
  const r = m?.get(ticker);
  if (loaded && !m) return null; // file not built yet — hide silently
  if (!loaded) return <Card title="FCF Quality" sub=""><div className="py-4 text-sm text-mute">Loading…</div></Card>;
  if (!r || r.sbc == null)
    return (
      <Card title="🧪 FCF Quality" sub="Is the free cash flow real once stock comp is expensed?">
        <div className="py-3 text-sm text-mute">No SBC / cash-flow data for {ticker} (foreign filer or outside EDGAR coverage).</div>
      </Card>
    );
  const v = verdict(r);
  const negOcf = r.sbc_pct_ocf != null && r.sbc_pct_ocf < 0;
  return (
    <Card title="🧪 FCF Quality" sub="Reported free cash flow adds back stock-based comp as if it were free. This expenses it.">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-xl font-bold" style={{ color: v.color }}>{v.label}</span>
      </div>
      {/* the bridge: reported -> -SBC -> true */}
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-head py-2"><div className="text-[10px] uppercase tracking-wide text-mute">Reported FCF</div><div className="font-mono text-base font-semibold text-ink-2">{b(r.fcf_reported)}</div></div>
        <div className="rounded-md bg-neg/10 py-2"><div className="text-[10px] uppercase tracking-wide text-mute">− Stock comp</div><div className="font-mono text-base font-semibold text-[#FF8A3D]">{b(r.sbc)}</div></div>
        <div className="rounded-md bg-head py-2 ring-1 ring-line"><div className="text-[10px] uppercase tracking-wide text-mute">True FCF</div><div className="font-mono text-base font-bold" style={{ color: v.color }}>{b(r.fcf_fully_adjusted)}</div></div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Stat label="SBC / operating cash flow" value={negOcf ? "n/a (OCF<0)" : pct(r.sbc_pct_ocf)} />
        <Stat label="SBC / market cap" value={pct(r.sbc_pct_mktcap)} />
        <Stat label="Reported FCF yield" value={pct(r.reported_fcf_yield)} />
        <Stat label="True FCF yield" value={pct(r.true_fcf_yield)} valueColor={v.color} />
      </div>
      <div className="mt-2 text-[10px] leading-relaxed text-dim">
        v1 expenses SBC only (the defensible adjustment) on EDGAR point-in-time TTM filings.
        {r.cash_tax_below_normal ? " Cash tax is running below a 21% normal (flagged, not subtracted)." : ""}
        {negOcf ? " Operating cash flow is negative, so SBC/OCF isn't meaningful here." : ""}
      </div>
    </Card>
  );
}

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between border-t border-line-faint py-1">
      <span className="text-mute">{label}</span>
      <span className="font-mono font-medium" style={{ color: valueColor ?? INK.ink2 }}>{value}</span>
    </div>
  );
}
