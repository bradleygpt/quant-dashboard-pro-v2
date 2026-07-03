import { useEffect, useState } from "react";
import { useStore } from "../store";
import { loadDataJSON } from "../lib/data";
import { Card, Spinner, Unavailable, RatingBadge } from "./ui";
import { INK, SEM } from "../theme";

// Index-addition candidates (A): large profitable non-members likely to be added to the S&P 500 /
// Nasdaq-100, with the estimated PASSIVE-BUY impact (the "index effect" — often a bigger, more
// mechanical move than PEAD). Rules-gated eligibility; committee discretion is NOT modeled.
const BASE = `${import.meta.env.BASE_URL}data`;
const BASKET_71 = new Set(["MU", "EIX", "FISV", "RKLB", "MXL", "AKAM", "INSW", "MTZ", "MOS", "DECK", "TPR", "IREN", "STX", "VIAV", "VSAT"]);

interface Cand { ticker: string; name: string; sector: string; mktcap_b: number; country?: string; exchange?: string;
  index_weight_bps: number; passive_buy_usd_b: number; adv_days: number | null; quant_rating?: string }
interface File { generated_at: string; method: string; assumptions: Record<string, number>; sp500_candidates: Cand[]; ndx_candidates: Cand[] }

let cache: File | null = null;

function Table({ rows, index }: { rows: Cand[]; index: string }) {
  const { goToDetail, byTicker } = useStore();
  return (
    <div className="overflow-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-panel text-left text-[11px] uppercase tracking-wide text-mute">
            <th className="px-3 py-2">Ticker</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Sector</th>
            <th className="px-3 py-2 text-right">Mkt cap</th>
            <th className="px-3 py-2 text-right" title={`Estimated forced passive buying if added to the ${index}: indexed AUM × new index weight`}>Passive buy</th>
            <th className="px-3 py-2 text-right" title="Days of average dollar volume to absorb the passive demand — higher = bigger price impact">Days ADV</th>
            <th className="px-3 py-2">Quant</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const known = byTicker.has(c.ticker);
            return (
              <tr key={c.ticker} className="border-t border-line-faint hover:bg-panel">
                <td className="px-3 py-1.5 font-semibold">
                  {known ? <button onClick={() => goToDetail(c.ticker)} className="text-link hover:underline">{c.ticker}</button> : <span className="text-link/75">{c.ticker}</span>}
                  {BASKET_71.has(c.ticker) && <span title="In your 7/1 strategy book" className="ml-1.5 rounded-sm bg-pos/10 px-1 py-0.5 text-[9px] font-semibold uppercase text-pos-soft ring-1 ring-pos/35">book</span>}
                </td>
                <td className="px-3 py-1.5 text-ink-2">{c.name}</td>
                <td className="px-3 py-1.5 text-ink-3">{c.sector}</td>
                <td className="px-3 py-1.5 text-right text-ink-2">${c.mktcap_b >= 1000 ? (c.mktcap_b / 1000).toFixed(2) + "T" : c.mktcap_b.toFixed(0) + "B"}</td>
                <td className="px-3 py-1.5 text-right font-semibold text-ink-2">${c.passive_buy_usd_b.toFixed(1)}B</td>
                <td className="px-3 py-1.5 text-right" style={{ color: c.adv_days == null ? INK.mute : c.adv_days > 10 ? SEM.neg : c.adv_days > 4 ? SEM.warn : SEM.posSoft }}>{c.adv_days == null ? "—" : c.adv_days.toFixed(1)}</td>
                <td className="px-3 py-1.5">{c.quant_rating ? <RatingBadge rating={c.quant_rating} /> : <span className="text-mute">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function IndexAddPanel() {
  const [data, setData] = useState<File | null>(cache);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (cache) return;
    loadDataJSON<File>("index_add_candidates.json")
      .then((j) => { if (j) { cache = j; setData(j); } else setErr(true); });
  }, []);

  if (err) return <Unavailable what="Index-add candidates" detail="index_add_candidates.json hasn’t been baked yet (run build_index_add_candidates.py)." />;
  if (!data) return <Spinner label="Loading index-add candidates…" />;

  return (
    <div className="space-y-3">
      <Card title="Index-Add candidates" sub={`Likely S&P 500 / Nasdaq-100 additions + estimated passive-buy impact · as-of ${data.generated_at}`}>
        <p className="text-xs leading-relaxed text-ink-3">
          Large, profitable non-members ranked by the <b>“index effect”</b> — when a stock joins an index, every passive fund must buy it
          (≈ indexed AUM × the new index weight), often a bigger, more mechanical move than earnings drift. <b>Days-ADV</b> is how long that
          demand takes to absorb (higher → bigger price pop). Rules-gated eligibility (mkt-cap floor, GAAP-profitable, US-domicile / Nasdaq-listing);
          committee discretion is <i>not</i> modeled, so read these as readiness, not certainty.
        </p>
      </Card>

      <div>
        <div className="mb-1.5 text-sm font-semibold text-link/75">S&P 500 — {data.sp500_candidates.length} candidates <span className="text-[11px] font-normal text-mute">(~${data.assumptions.sp_indexed_aum_t}T indexed)</span></div>
        <Table rows={data.sp500_candidates} index="S&P 500" />
      </div>
      <div>
        <div className="mb-1.5 text-sm font-semibold text-link/75">Nasdaq-100 — {data.ndx_candidates.length} candidates <span className="text-[11px] font-normal text-mute">(~${data.assumptions.ndx_indexed_aum_t}T indexed)</span></div>
        <Table rows={data.ndx_candidates} index="Nasdaq-100" />
      </div>
    </div>
  );
}
