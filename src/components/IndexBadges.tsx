import { useEffect, useState } from "react";

// S&P 500 / Nasdaq-100 membership badges. Loads public/data/index_membership.json once
// (module-cached) and renders a small badge per index the ticker belongs to.
const BASE = `${import.meta.env.BASE_URL}data`;
type Membership = { sp500: Set<string>; nasdaq100: Set<string> };
let cache: Membership | null = null;
let inflight: Promise<Membership> | null = null;

function load(): Promise<Membership> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch(`${BASE}/index_membership.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        cache = j ? { sp500: new Set<string>(j.sp500), nasdaq100: new Set<string>(j.nasdaq100) } : { sp500: new Set(), nasdaq100: new Set() };
        return cache;
      })
      .catch(() => { cache = { sp500: new Set(), nasdaq100: new Set() }; return cache; });
  }
  return inflight;
}

export function useIndexMembership(): Membership | null {
  const [m, setM] = useState<Membership | null>(cache);
  useEffect(() => { if (!cache) load().then(setM); }, []);
  return m;
}

export default function IndexBadges({ ticker }: { ticker: string }) {
  const m = useIndexMembership();
  if (!m) return null;
  const sp = m.sp500.has(ticker), nd = m.nasdaq100.has(ticker);
  if (!sp && !nd) return null;
  return (
    <span className="ml-1.5 inline-flex gap-1 align-middle">
      {sp && <span title="S&P 500 member" className="rounded-sm bg-[#11243B] px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[#5BA8FF] ring-1 ring-[#1E3A5F]">S&amp;P</span>}
      {nd && <span title="Nasdaq-100 member" className="rounded-sm bg-[#10261C] px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[#3FB984] ring-1 ring-[#1C5C2E]">NDX</span>}
    </span>
  );
}
