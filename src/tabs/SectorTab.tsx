import { useMemo, useState } from "react";
import { useStore, type ViewRow } from "../store";
import { Card, RatingBadge, Spinner } from "../components/ui";
import { SortableTable, RATING_RANK, type Column } from "../components/SortableTable";
import { fmtMoney, fmtCapB } from "../lib/format";

interface SectorAgg {
  sector: string; count: number; avgScore: number; medCap: number; buyish: number;
}
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default function SectorTab() {
  const { rows, loadingUniverse, goToDetail } = useStore();
  const [open, setOpen] = useState<string | null>(null);

  const { aggs, bySector } = useMemo(() => {
    const map = new Map<string, ViewRow[]>();
    for (const r of rows) {
      if (r.sector === "ETF" || !r.sector) continue;
      if (!map.has(r.sector)) map.set(r.sector, []);
      map.get(r.sector)!.push(r);
    }
    const aggs: SectorAgg[] = [];
    for (const [sector, rs] of map) {
      const scores = rs.map((r) => r.composite);
      aggs.push({
        sector, count: rs.length, avgScore: scores.reduce((a, b) => a + b, 0) / rs.length,
        medCap: median(rs.map((r) => r.marketCapB ?? 0)),
        buyish: rs.filter((r) => r.rating.startsWith("Strong Buy") || r.rating === "Buy").length,
      });
    }
    return { aggs, bySector: map };
  }, [rows]);

  const aggCols = useMemo<Column<SectorAgg>[]>(() => [
    { key: "sector", header: "Sector", sortValue: (r) => r.sector,
      render: (r) => <button onClick={() => setOpen(open === r.sector ? null : r.sector)} className="font-medium text-white hover:text-[#5BA8FF]">{r.sector} {open === r.sector ? "▲" : "▾"}</button> },
    { key: "count", header: "Stocks", align: "right", sortValue: (r) => r.count, render: (r) => r.count },
    { key: "avg", header: "Avg Score", align: "right", sortValue: (r) => r.avgScore, render: (r) => <span className="font-semibold">{r.avgScore.toFixed(2)}</span> },
    { key: "cap", header: "Median Cap", align: "right", sortValue: (r) => r.medCap, render: (r) => <span className="text-[#9CA7BB]">{fmtCapB(r.medCap)}</span> },
    { key: "buy", header: "Buy-tier", align: "right", sortValue: (r) => r.buyish, render: (r) => <span className="text-[#00C805]">{r.buyish}</span> },
  ], [open]);

  const stockCols = useMemo<Column<ViewRow>[]>(() => [
    { key: "ticker", header: "Ticker", sortValue: (r) => r.ticker,
      render: (r) => <button onClick={() => goToDetail(r.ticker)} className="font-semibold text-[#5BA8FF] hover:underline">{r.ticker}</button> },
    { key: "name", header: "Name", sortValue: (r) => r.name ?? "", render: (r) => <span className="block max-w-[260px] truncate text-[#C3CAD7]">{r.name}</span> },
    { key: "composite", header: "Score", align: "right", sortValue: (r) => r.composite, render: (r) => <span className="font-semibold">{r.composite.toFixed(2)}</span> },
    { key: "rating", header: "Rating", sortValue: (r) => RATING_RANK[r.rating] ?? 0, render: (r) => <RatingBadge rating={r.rating} /> },
    { key: "price", header: "Price", align: "right", sortValue: (r) => r.price, render: (r) => fmtMoney(r.price) },
    { key: "fv", header: "FV", align: "right", sortValue: (r) => r.fv, render: (r) => fmtMoney(r.fv) },
    { key: "qbp", header: "QBP", align: "right", sortValue: (r) => r.qbp, render: (r) => fmtMoney(r.qbp) },
  ], [goToDetail]);

  if (loadingUniverse) return <Spinner />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white">Sector Overview</h2>
      <p className="text-xs text-[#7C879B]">Click a sector to expand its stocks. All columns sortable.</p>
      <SortableTable columns={aggCols} rows={aggs} rowKey={(r) => r.sector} initialSortKey="avg" initialSortDir="desc" />
      {open && (
        <Card title={`${open} — ${bySector.get(open)?.length ?? 0} stocks`}>
          <SortableTable columns={stockCols} rows={bySector.get(open) ?? []} rowKey={(r) => r.ticker} initialSortKey="composite" initialSortDir="desc" maxHeight="60vh" />
        </Card>
      )}
    </div>
  );
}
