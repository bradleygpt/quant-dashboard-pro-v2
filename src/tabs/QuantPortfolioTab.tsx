import { useMemo, useState } from "react";
import { useStore } from "../store";
import { Card, Metric, RatingBadge } from "../components/ui";
import { SortableTable, RATING_RANK, type Column } from "../components/SortableTable";
import { fmtMoney, fmtPct, fmtCapB } from "../lib/format";
import { buildOptimalPortfolio, type Aggressiveness, type QpPosition } from "../lib/portfolio";

const LEVELS: Aggressiveness[] = ["Conservative", "Balanced", "Aggressive"];

export default function QuantPortfolioTab() {
  const { rows, preset, meta, goToDetail } = useStore();
  const [capital, setCapital] = useState(100000);
  const [level, setLevel] = useState<Aggressiveness>("Balanced");

  const weightScheme = preset === "Custom" ? "equal" : preset;
  const port = useMemo(
    () => buildOptimalPortfolio(rows, capital, level, weightScheme),
    [rows, capital, level, weightScheme],
  );
  const presetInfo = preset !== "Custom" ? meta.presets[preset] : null;
  const deployed = port.reduce((a, p) => a + p.dollars, 0);
  const avgScore = port.length ? port.reduce((a, p) => a + p.composite_score, 0) / port.length : 0;
  const nSectors = new Set(port.map((p) => p.sector)).size;
  const POS_BY_LEVEL: Record<Aggressiveness, number> = { Conservative: 30, Balanced: 20, Aggressive: 12 };

  const columns = useMemo<Column<QpPosition>[]>(() => [
    { key: "ticker", header: "Ticker", sortValue: (p) => p.ticker,
      render: (p) => <button onClick={() => goToDetail(p.ticker)} className="font-semibold text-[#5BA8FF] hover:underline">{p.ticker}</button> },
    { key: "sector", header: "Sector", sortValue: (p) => p.sector ?? "", render: (p) => <span className="text-[#9CA7BB]">{p.sector}</span> },
    { key: "rating", header: "Rating", sortValue: (p) => RATING_RANK[p.rating] ?? 0, render: (p) => <RatingBadge rating={p.rating} /> },
    { key: "score", header: "Score", align: "right", sortValue: (p) => p.composite_score, render: (p) => <span className="font-semibold">{p.composite_score.toFixed(2)}</span> },
    { key: "weight", header: "Weight", align: "right", sortValue: (p) => p.weight_pct, render: (p) => fmtPct(p.weight_pct) },
    { key: "dollars", header: "Dollars", align: "right", sortValue: (p) => p.dollars, render: (p) => fmtMoney(p.dollars, 0) },
    { key: "shares", header: "Shares", align: "right", sortValue: (p) => p.shares, render: (p) => p.shares },
    { key: "price", header: "Price", align: "right", sortValue: (p) => p.price, render: (p) => fmtMoney(p.price) },
    { key: "cap", header: "Mkt Cap", align: "right", sortValue: (p) => p.market_cap_b, render: (p) => <span className="text-[#9CA7BB]">{fmtCapB(p.market_cap_b)}</span> },
  ], [goToDetail]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white">Quant Portfolio Builder</h2>
      <p className="text-xs text-[#7C879B]">
        Two distinct things below: (1) the <strong className="text-[#C3CAD7]">validated strategy backtest</strong> — the historical
        record of the ranking system; and (2) <strong className="text-[#C3CAD7]">your allocation</strong> — a score-weighted portfolio
        built from the current universe at your chosen aggressiveness. They are separate; the backtest CAGR is the strategy's, not this allocation's.
      </p>

      {/* (1) Validated strategy backtest — TOP25 quarterly rebalance, distinct from the builder */}
      {presetInfo && (
        <Card title="Validated Strategy Backtest" sub={`TOP-25 quarterly rebalance · ${presetInfo.backtest_universe}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="CAGR" value={<span className="text-[#00C805]">{fmtPct(presetInfo.backtest_cagr)}</span>} />
            <Metric label="Sharpe" value={presetInfo.backtest_sharpe.toFixed(2)} />
            <Metric label="Max Drawdown" value={<span className="text-[#FF5722]">{fmtPct(presetInfo.backtest_max_dd)}</span>} />
            <Metric label="Portfolio size" value="25" hint="validated construction" />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#7C879B]">
            These stats describe the validated <strong>TOP-25</strong> equal-rebalance strategy under the <strong>{weightScheme}</strong> preset,
            1996–2026, 121 quarterly rebalances. They are NOT a backtest of the specific allocation built below.
          </p>
        </Card>
      )}

      {/* (2) Your allocation builder */}
      <Card title="Build Your Allocation" sub="Score-weighted construction with per-aggressiveness sector caps, position ceilings, and score floors">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-[#9CA7BB]">Capital
            <input type="number" value={capital} onChange={(e) => setCapital(Math.max(0, parseFloat(e.target.value) || 0))}
              className="mt-1 block w-36 rounded-md border border-[#1E2632] bg-[#121723] px-2 py-1.5 text-sm text-white" />
          </label>
          <div className="flex gap-1">
            {LEVELS.map((l) => (
              <button key={l} onClick={() => setLevel(l)}
                className={`rounded-md px-3 py-1.5 text-xs ${level === l ? "bg-[#3B82F6] font-semibold text-white" : "bg-[#1A2130] text-[#9CA7BB] hover:bg-[#222B3C]"}`}>{l} ({POS_BY_LEVEL[l]})</button>
            ))}
          </div>
          <span className="text-[11px] text-[#7C879B]">Position count is aggressiveness-dependent: Conservative 30 · Balanced 20 · Aggressive 12.</span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Positions" value={port.length} hint={`max ${POS_BY_LEVEL[level]} (${level})`} />
        <Metric label="Deployed" value={fmtMoney(deployed, 0)} hint={`of ${fmtMoney(capital, 0)}`} />
        <Metric label="Avg Score" value={avgScore ? avgScore.toFixed(2) : "—"} />
        <Metric label="Sectors" value={nSectors} />
      </div>

      {port.length === 0 ? (
        <div className="text-sm text-[#7C879B]">No positions pass the filters at this level / universe.</div>
      ) : (
        <Card title={`Your allocation — ${level} (${port.length} positions, ${weightScheme} weighting)`}>
          <SortableTable columns={columns} rows={port} rowKey={(p) => p.ticker} initialSortKey="weight" initialSortDir="desc" maxHeight="64vh" />
        </Card>
      )}
    </div>
  );
}
