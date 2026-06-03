import { useMemo, useState } from "react";
import { useStore, type ViewRow } from "../store";
import { RatingBadge, Spinner } from "../components/ui";
import { SortableTable, RATING_RANK, type Column } from "../components/SortableTable";
import { fmtMoney, fmtCapB } from "../lib/format";

export default function ETFTab() {
  const { rows, loadingUniverse, goToDetail } = useStore();
  const [q, setQ] = useState("");
  const etfs = useMemo(() => {
    let e = rows.filter((r) => r.sector === "ETF");
    if (q.trim()) {
      const s = q.trim().toUpperCase();
      e = e.filter((r) => r.ticker.includes(s) || (r.name ?? "").toUpperCase().includes(s));
    }
    return e;
  }, [rows, q]);

  const columns = useMemo<Column<ViewRow>[]>(() => [
    { key: "ticker", header: "Ticker", sortValue: (r) => r.ticker,
      render: (r) => <button onClick={() => goToDetail(r.ticker)} className="font-semibold text-[#5BA8FF] hover:underline">{r.ticker}</button> },
    { key: "name", header: "Name", sortValue: (r) => r.name ?? "",
      render: (r) => <span className="block max-w-[320px] truncate text-[#C3CAD7]">{r.name}</span> },
    { key: "composite", header: "Score", align: "right", sortValue: (r) => r.composite, render: (r) => <span className="font-semibold">{r.composite.toFixed(2)}</span> },
    { key: "rating", header: "Rating", sortValue: (r) => RATING_RANK[r.rating] ?? 0, render: (r) => <RatingBadge rating={r.rating} /> },
    { key: "price", header: "Price", align: "right", sortValue: (r) => r.price, render: (r) => fmtMoney(r.price) },
    { key: "cap", header: "AUM/Cap", align: "right", sortValue: (r) => r.marketCapB, render: (r) => <span className="text-[#9CA7BB]">{fmtCapB(r.marketCapB)}</span> },
  ], [goToDetail]);

  if (loadingUniverse) return <Spinner />;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-white">ETF Center</h2>
      <p className="text-xs text-[#7C879B]">
        ETFs in the tracked universe, scored with score-band logic (excluded from the Top-25 stock strategy and FV/QBP).
        Portfolio templates & ETF comparison from the source app are deferred in this build pass.
      </p>
      <div className="flex items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ETF" className="w-64 rounded-md border border-[#1E2632] bg-[#121723] px-2 py-1.5 text-sm text-white" />
        <span className="ml-auto text-sm text-[#7C879B]">{etfs.length} ETFs</span>
      </div>
      <SortableTable columns={columns} rows={etfs} rowKey={(r) => r.ticker} initialSortKey="composite" initialSortDir="desc" />
    </div>
  );
}
