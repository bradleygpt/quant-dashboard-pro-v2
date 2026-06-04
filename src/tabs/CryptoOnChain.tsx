import { useMemo } from "react";
import { Card, Metric, Unavailable } from "../components/ui";
import { estimateNextHalvingFromBlock } from "../lib/cycle";

interface OnChain { ok?: boolean; block_height?: number; fees?: { fastest?: number; half_hour?: number }; hashrate_ehs?: number; difficulty?: number }
const fmtMonthYear = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short" });

export default function CryptoOnChain({ oc }: { oc?: OnChain }) {
  const today = new Date().toISOString().slice(0, 10);
  const est = useMemo(() => estimateNextHalvingFromBlock(oc?.block_height, today), [oc?.block_height, today]);

  if (!oc?.ok) return <Unavailable what="On-chain data" detail="Block height, mempool fees and hash rate are fetched from keyless free APIs (mempool.space) server-side. In a static preview this shows unavailable — by design." />;

  return (
    <div className="space-y-4">
      <Card title="On-Chain Metrics" sub="Best-effort on-chain data from free keyless APIs (mempool.space). For MVRV/NUPL/exchange flows, professional tools (Glassnode, CryptoQuant) offer paid tiers.">
        {oc.block_height != null && (
          <>
            <div className="text-xs font-semibold uppercase text-[#7C879B]">Bitcoin Network State</div>
            <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Metric label="Current block height" value={oc.block_height.toLocaleString()} />
              {est && <Metric label="Blocks until next halving" value={est.blocks_remaining.toLocaleString()} hint={`~${est.days_remaining} days`} />}
              {est && <Metric label="Estimated next halving" value={fmtMonthYear(est.estimated_date)} />}
            </div>
          </>
        )}
        {(oc.hashrate_ehs != null || oc.fees) && (
          <>
            <div className="mt-3 text-xs font-semibold uppercase text-[#7C879B]">Bitcoin Mining &amp; Mempool</div>
            <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {oc.hashrate_ehs != null && <Metric label="Network hash rate" value={`${oc.hashrate_ehs.toFixed(2)} EH/s`} />}
              {oc.fees?.fastest != null && <Metric label="Fast fee" value={`${oc.fees.fastest} sat/vB`} />}
              {oc.fees?.half_hour != null && <Metric label="30-min fee" value={`${oc.fees.half_hour} sat/vB`} />}
            </div>
          </>
        )}
      </Card>

      <Card title="What These Metrics Mean">
        <div className="space-y-2 text-xs text-[#9CA7BB]">
          <div><span className="font-semibold text-[#C3CAD7]">Hash rate (EH/s):</span> higher = more security and miner commitment; trending up = healthy network growth; sharp drops = miner capitulation (often a bear signal).</div>
          <div><span className="font-semibold text-[#C3CAD7]">Mempool fees (sat/vB):</span> higher = more demand for block space; sustained high fees = active usage and value accrual to miners; very low fees may suggest bear-market low activity.</div>
          <div><span className="font-semibold text-[#C3CAD7]">Block height:</span> increases by 1 every ~10 minutes; used to precisely calculate the next halving (block 1,050,000 = next halving).</div>
        </div>
        <div className="mt-3 text-[10px] text-[#5C6678]">💡 For deeper on-chain analytics — wallet cohort analysis, exchange flows, holder behavior — consider professional tools (Glassnode, CryptoQuant, IntoTheBlock) which offer limited free tiers.</div>
      </Card>
    </div>
  );
}
