import { useMemo } from "react";
import { useStore, type ViewRow } from "../store";
import { Card, Metric, RatingBadge, Spinner } from "../components/ui";
import { SortableTable, RATING_RANK, type Column } from "../components/SortableTable";
import { fmtMoney } from "../lib/format";

export default function HomeTab() {
  const { rows, loadingUniverse, preset, meta, watchlist, goToDetail } = useStore();

  const presetKey = preset === "Custom" ? meta.default_preset : preset;
  const threshold = meta.absolute_thresholds[presetKey];
  const thStats = meta.absolute_threshold_stats[presetKey];

  const { topOps, breadthCount, watchRows } = useMemo(() => {
    const stocks = rows.filter((r) => r.sector !== "ETF");
    const topOps = stocks.filter((r) => r.rating === "Strong Buy+" || r.rating === "Strong Buy");
    const breadthCount = stocks.filter((r) => r.composite >= threshold).length;
    const watchRows = watchlist.map((t) => rows.find((r) => r.ticker === t)).filter(Boolean) as ViewRow[];
    return { topOps, breadthCount, watchRows };
  }, [rows, threshold, watchlist]);

  const columns = useMemo<Column<ViewRow>[]>(() => [
    { key: "ticker", header: "Ticker", sortValue: (r) => r.ticker,
      render: (r) => <button onClick={() => goToDetail(r.ticker)} className="font-semibold text-[#5BA8FF] hover:underline">{r.ticker}</button> },
    { key: "name", header: "Name", sortValue: (r) => r.name ?? "", render: (r) => <span className="block max-w-[240px] truncate text-[#C3CAD7]">{r.name}</span> },
    { key: "sector", header: "Sector", sortValue: (r) => r.sector ?? "", render: (r) => <span className="text-[#9CA7BB]">{r.sector}</span> },
    { key: "composite", header: "Score", align: "right", sortValue: (r) => r.composite, render: (r) => <span className="font-semibold">{r.composite.toFixed(2)}</span> },
    { key: "rating", header: "Rating", sortValue: (r) => RATING_RANK[r.rating] ?? 0, render: (r) => <RatingBadge rating={r.rating} /> },
    { key: "price", header: "Price", align: "right", sortValue: (r) => r.price, render: (r) => fmtMoney(r.price) },
    { key: "fv", header: "FV", align: "right", sortValue: (r) => r.fv, render: (r) => fmtMoney(r.fv) },
    { key: "qbp", header: "QBP", align: "right", sortValue: (r) => r.qbp, render: (r) => fmtMoney(r.qbp) },
  ], [goToDetail]);

  if (loadingUniverse) return <Spinner />;

  const median = thStats?.median_count ?? null;
  const breadthSignal = median ? (breadthCount > median * 1.15 ? "Broadening" : breadthCount < median * 0.85 ? "Thinning" : "Normal") : "—";
  const breadthColor = breadthSignal === "Broadening" ? "#00C805" : breadthSignal === "Thinning" ? "#FF9800" : "#9CA7BB";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Dashboard Overview</h2>
        <p className="text-xs text-[#7C879B]">Your universe and market at a glance.</p>
      </div>

      <Card title="Market Health" sub="Live indicators (Fear & Greed, VIX, Buffett, breadth-vs-200SMA) are deferred in this build pass — they require runtime network data.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Breadth (quality)" value={breadthCount} hint={`stocks ≥ ${threshold.toFixed(2)}`} />
          <Metric label="Breadth signal" value={<span style={{ color: breadthColor }}>{breadthSignal}</span>} hint={median ? `median ${median}` : undefined} />
          <Metric label="Universe stocks" value={rows.filter((r) => r.sector !== "ETF").length} />
          <Metric label="Active preset" value={meta.presets[presetKey].label.split(" ")[0]} />
        </div>
      </Card>

      <Card title="Top Rated Opportunities" sub={`Strong Buy+ / Strong Buy from the current preset · ${topOps.length} names · sortable`}>
        {topOps.length === 0 ? <div className="text-sm text-[#7C879B]">None at the current preset/floor.</div> : (
          <SortableTable columns={columns} rows={topOps} rowKey={(r) => r.ticker} initialSortKey="composite" initialSortDir="desc" maxHeight="50vh" />
        )}
      </Card>

      <Card title="Watchlist" sub="Saved locally in your browser">
        {watchRows.length === 0 ? <div className="text-sm text-[#7C879B]">No watched tickers. Add them from Stock Detail.</div> : (
          <SortableTable columns={columns} rows={watchRows} rowKey={(r) => r.ticker} initialSortKey="composite" initialSortDir="desc" maxHeight="50vh" />
        )}
      </Card>
    </div>
  );
}
