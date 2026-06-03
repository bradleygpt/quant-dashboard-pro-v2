import { useMemo, useState } from "react";
import { useStore } from "../store";
import { Card, Metric, RatingBadge, TH, TD } from "../components/ui";
import { SortableTable, RATING_RANK, type Column } from "../components/SortableTable";
import { fmtMoney, fmtPct } from "../lib/format";
import { analyzePortfolio, type Holding, type Position } from "../lib/portfolio";

function useHoldings(): [Holding[], (h: Holding[]) => void] {
  const [h, setH] = useState<Holding[]>(() => {
    try { return JSON.parse(localStorage.getItem("qd_holdings") || "[]"); } catch { return []; }
  });
  const save = (nh: Holding[]) => { setH(nh); localStorage.setItem("qd_holdings", JSON.stringify(nh)); };
  return [h, save];
}

export default function PortfolioTab() {
  const { byTicker, rows, goToDetail } = useStore();
  const [holdings, setHoldings] = useHoldings();
  const [tk, setTk] = useState(""); const [sh, setSh] = useState(""); const [cb, setCb] = useState("");

  const analysis = useMemo(() => analyzePortfolio(holdings, byTicker, rows), [holdings, byTicker, rows]);

  const holdingCols = useMemo<Column<Position>[]>(() => [
    { key: "ticker", header: "Ticker", sortValue: (p) => p.ticker,
      render: (p) => <button onClick={() => goToDetail(p.ticker)} className="font-semibold text-[#5BA8FF] hover:underline">{p.ticker}</button> },
    { key: "sector", header: "Sector", sortValue: (p) => p.sector ?? "", render: (p) => <span className="text-[#9CA7BB]">{p.sector}</span> },
    { key: "shares", header: "Shares", align: "right", sortValue: (p) => p.shares, render: (p) => p.shares },
    { key: "price", header: "Price", align: "right", sortValue: (p) => p.price, render: (p) => fmtMoney(p.price) },
    { key: "value", header: "Value", align: "right", sortValue: (p) => p.market_value, render: (p) => fmtMoney(p.market_value, 0) },
    { key: "weight", header: "Weight", align: "right", sortValue: (p) => p.weight, render: (p) => p.weight == null ? "—" : fmtPct(p.weight * 100) },
    { key: "gain", header: "Gain", align: "right", sortValue: (p) => p.gain_pct,
      render: (p) => <span style={{ color: p.gain_pct == null ? "#7C879B" : p.gain_pct >= 0 ? "#00C805" : "#FF5722" }}>{p.gain_pct == null ? "—" : fmtPct(p.gain_pct, 1, true)}</span> },
    { key: "rating", header: "Rating", sortValue: (p) => RATING_RANK[p.rating] ?? 0, render: (p) => <RatingBadge rating={p.rating} /> },
    { key: "remove", header: "", sortable: false, render: (p) => <button onClick={() => setHoldings(holdings.filter((h) => h.ticker !== p.ticker))} className="text-xs text-[#7C879B] hover:text-red-400">remove</button> },
  ], [goToDetail, holdings, setHoldings]);

  const add = () => {
    const t = tk.trim().toUpperCase(); const s = parseFloat(sh);
    if (!t || !Number.isFinite(s) || s <= 0) return;
    setHoldings([...holdings.filter((h) => h.ticker !== t), { ticker: t, shares: s, cost_basis: cb ? parseFloat(cb) : null }]);
    setTk(""); setSh(""); setCb("");
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white">Your Portfolio</h2>

      <Card title="Add holding" sub="Stored locally in your browser (localStorage). Not uploaded anywhere.">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-[#9CA7BB]">Ticker<input value={tk} onChange={(e) => setTk(e.target.value)} className="mt-1 block w-28 rounded-md border border-[#1E2632] bg-[#0F1420] px-2 py-1.5 text-sm text-white" /></label>
          <label className="text-xs text-[#9CA7BB]">Shares<input value={sh} onChange={(e) => setSh(e.target.value)} className="mt-1 block w-24 rounded-md border border-[#1E2632] bg-[#0F1420] px-2 py-1.5 text-sm text-white" /></label>
          <label className="text-xs text-[#9CA7BB]">Cost basis<input value={cb} onChange={(e) => setCb(e.target.value)} placeholder="opt." className="mt-1 block w-24 rounded-md border border-[#1E2632] bg-[#0F1420] px-2 py-1.5 text-sm text-white" /></label>
          <button onClick={add} className="rounded-md bg-[#3B82F6] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2f6fd6]">Add</button>
          {holdings.length > 0 && <button onClick={() => setHoldings([])} className="rounded-md border border-[#1E2632] px-3 py-1.5 text-sm text-[#9CA7BB] hover:bg-[#161D29]">Clear all</button>}
        </div>
      </Card>

      {!analysis ? (
        <div className="text-sm text-[#7C879B]">Add holdings to see portfolio analytics.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Value" value={fmtMoney(analysis.total_value, 0)} />
            <Metric label="Holdings" value={analysis.num_holdings} hint={`${analysis.num_stocks} stk / ${analysis.num_etfs} etf`} />
            <Metric label="Weighted Score" value={`${analysis.weighted_composite.toFixed(2)}/12`} />
            <Metric label="Rating" value={<RatingBadge rating={analysis.weighted_rating} />} />
            <Metric label="Concentration" value={analysis.concentration_level} hint={`HHI ${analysis.hhi}`} />
            <Metric label="Stock / ETF" value={`${analysis.stock_weight}% / ${analysis.etf_weight}%`} />
          </div>

          <Card title="Holdings">
            <SortableTable columns={holdingCols} rows={analysis.positions} rowKey={(p) => p.ticker} initialSortKey="value" initialSortDir="desc" maxHeight="56vh" />
            {analysis.unmatched_tickers.length > 0 && <div className="mt-2 text-xs text-[#FF9800]">Unmatched (not in universe): {analysis.unmatched_tickers.join(", ")}</div>}
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Factor tilts vs universe">
              <table className="w-full text-sm">
                <thead><tr><TH>Pillar</TH><TH className="text-right">Portfolio</TH><TH className="text-right">Universe</TH><TH>Tilt</TH></tr></thead>
                <tbody>
                  {Object.entries(analysis.factor_tilts).map(([p, f]) => (
                    <tr key={p} className="border-t border-[#161D29]">
                      <TD className="text-[#C3CAD7]">{p}</TD><TD className="text-right">{f.portfolio.toFixed(1)}</TD>
                      <TD className="text-right text-[#9CA7BB]">{f.universe.toFixed(1)}</TD>
                      <TD style={{ color: f.tilt === "Overweight" ? "#00C805" : f.tilt === "Underweight" ? "#FF5722" : "#9CA7BB" }}>{f.tilt}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Sector allocation">
              <table className="w-full text-sm">
                <thead><tr><TH>Sector</TH><TH className="text-right">Weight</TH><TH className="text-right">Holdings</TH><TH className="text-right">Avg Score</TH></tr></thead>
                <tbody>
                  {Object.entries(analysis.sector_weights).map(([sector, s]) => (
                    <tr key={sector} className="border-t border-[#161D29]">
                      <TD className="text-[#C3CAD7]">{sector}</TD><TD className="text-right">{fmtPct(s.weight * 100)}</TD>
                      <TD className="text-right text-[#9CA7BB]">{s.count}</TD><TD className="text-right">{s.avg_score ? s.avg_score.toFixed(2) : "—"}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
