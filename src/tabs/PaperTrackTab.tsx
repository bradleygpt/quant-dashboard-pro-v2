import { useEffect, useState } from "react";
import { Card, Metric, Spinner, Unavailable } from "../components/ui";
import { loadDataJSON } from "../lib/data";

const BASE = `${import.meta.env.BASE_URL}data`;

interface PaperHolding {
  ticker: string; entry_date: string; entry_adj_close: number; adv_usd_m: number;
  blend_score: number; event: number; fund: number; ml: number; weight: number;
}
interface HistoryEntry {
  closed_on: string; from_date: string; book_return_pct: number; spy_return_pct: number; relative_pct: number;
}
export interface PaperTrack {
  strategy: string;
  config: { blend: Record<string, number>; N: number; universe: string; rebalance: string };
  inception_date: string; benchmark: string; spy_entry_adj_close: number; spy_entry_date: string;
  next_rebalance_date: string;
  holdings?: PaperHolding[]; current_holdings?: PaperHolding[];
  history?: HistoryEntry[];
  pending_rebalance?: { sell: string[]; buy: string[]; hold: string[] };
  display?: {
    engine: string; character: string; factor: string; status: string;
    backtest_cagr: number; sharpe: number; max_dd: number; spy_cagr: number;
    liquidity_survival: number; worst_regime: number; realistic_forward: string; window: string;
  };
}

// Live forward paper-track for the Event-balanced strategy. Unlike the backtest StrategyTab,
// this renders the *live* book: current holdings + scores, next rebalance, and (once the monthly
// updater has rolled at least once) the realized period-by-period record vs SPY.
export default function PaperTrackTab() {
  const [d, setD] = useState<PaperTrack | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    loadDataJSON<PaperTrack>("paper_track_event_pead.json")
      .then((j) => { if (j) setD(j); else setErr(true); });
  }, []);

  if (err) return <Unavailable what="Event-Balanced paper-track" detail="paper_track_event_pead.json failed to load." />;
  if (!d) return <Spinner label="Loading live paper-track…" />;

  const holds = d.current_holdings ?? d.holdings ?? [];
  const disp = d.display;
  const hist = d.history ?? [];
  const cumBook = hist.reduce((a, h) => a + h.book_return_pct, 0);
  const cumSpy = hist.reduce((a, h) => a + h.spy_return_pct, 0);
  const blend = Object.entries(d.config.blend);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">
            {disp?.engine ?? "Aristeia"} · {disp?.character ?? "Event-Balanced"}
            <span className="ml-2 rounded-full bg-paper/10 px-2 py-0.5 text-[11px] font-semibold text-paper ring-1 ring-paper/30" title="Paper track: signal-derived research book accruing forward out-of-sample — not broker positions. The broker-confirmed Aristeia book lives on the Strategies summary.">◌ PAPER-TRACK · forward accrual</span>
          </h2>
          <p className="text-xs text-mute">
            Event/PEAD-anchored blend ({blend.map(([k, v]) => `${(v * 100).toFixed(0)}% ${k}`).join(" · ")}), top-{d.config.N} equal-weight,
            {" "}{d.config.universe}. Rebalanced {d.config.rebalance}. Forward out-of-sample — picks use as-of signal at each rebalance, returns accrue purely forward vs SPY.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-pos/35 bg-pos/8 p-3 text-xs text-pos-soft">
        <span className="font-semibold text-pos">Next rebalance: {d.next_rebalance_date}.</span>{" "}
        Picks are generated the night before so they can be researched before deploying on the first trading day of the month.
        {d.pending_rebalance && (d.pending_rebalance.buy.length > 0 || d.pending_rebalance.sell.length > 0) && (
          <span className="ml-1 text-paper">
            Pending — BUY {d.pending_rebalance.buy.join(", ") || "—"} · SELL {d.pending_rebalance.sell.join(", ") || "—"}.
          </span>
        )}
      </div>

      {disp && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label={`Backtest CAGR ${disp.window}`} value={`${disp.backtest_cagr.toFixed(1)}%`} hint={`vs SPY ${disp.spy_cagr.toFixed(1)}%`} />
          <Metric label="Realistic forward" value={disp.realistic_forward} hint="after survivorship + concentration" />
          <Metric label="Sharpe (daily)" value={disp.sharpe.toFixed(2)} hint={`max DD ${disp.max_dd.toFixed(0)}%`} />
          <Metric label="Liquidity survival" value={`${(disp.liquidity_survival * 100).toFixed(0)}%`} hint={`worst 2-yr regime +${disp.worst_regime.toFixed(0)}%`} />
        </div>
      )}

      <Card title="Current book" sub={`Top-${d.config.N} equal-weight, held since ${holds[0]?.entry_date ?? d.inception_date}. ADV shown for position sizing — the universe is broad (no liquidity floor).`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-right text-xs">
            <thead>
              <tr className="text-mute">
                <th className="px-2 py-1 text-left font-medium">Ticker</th>
                <th className="px-2 py-1 font-medium">Weight</th>
                <th className="px-2 py-1 font-medium">Entry</th>
                <th className="px-2 py-1 font-medium">ADV $M</th>
                <th className="px-2 py-1 font-medium">Blend</th>
                <th className="px-2 py-1 font-medium">Event</th>
                <th className="px-2 py-1 font-medium">Fund</th>
                <th className="px-2 py-1 font-medium">ML</th>
              </tr>
            </thead>
            <tbody>
              {holds.map((h) => (
                <tr key={h.ticker} className="text-ink-2">
                  <td className="px-2 py-1 text-left font-mono font-semibold text-ink">{h.ticker}</td>
                  <td className="px-2 py-1">{(h.weight * 100).toFixed(0)}%</td>
                  <td className="px-2 py-1">${h.entry_adj_close.toFixed(2)}</td>
                  <td className="px-2 py-1 text-mute">{h.adv_usd_m.toFixed(0)}</td>
                  <td className="px-2 py-1 font-semibold text-pos">{h.blend_score.toFixed(2)}</td>
                  <td className="px-2 py-1">{h.event.toFixed(2)}</td>
                  <td className="px-2 py-1">{h.fund.toFixed(2)}</td>
                  <td className="px-2 py-1">{h.ml.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-dim">Benchmark anchor: SPY ${d.spy_entry_adj_close.toFixed(2)} ({d.spy_entry_date}).</p>
      </Card>

      <Card title="Realized record vs S&P 500" sub={hist.length ? `${hist.length} completed rebalance period(s), newest first. Sum of period returns.` : "No completed periods yet — the track begins at inception."}>
        {hist.length === 0 ? (
          <p className="text-xs text-mute">
            Track started {d.inception_date}. The first realized period closes at the {d.next_rebalance_date} rebalance,
            at which point this fills in with book vs SPY for the period.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-3">
              <Metric label="Cumulative (book)" value={`${cumBook >= 0 ? "+" : ""}${cumBook.toFixed(1)}%`} hint="sum of period returns" />
              <Metric label="Cumulative (SPY)" value={`${cumSpy >= 0 ? "+" : ""}${cumSpy.toFixed(1)}%`} />
              <Metric label="Relative" value={`${cumBook - cumSpy >= 0 ? "+" : ""}${(cumBook - cumSpy).toFixed(1)}%`} hint="book − SPY" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-right text-xs">
                <thead>
                  <tr className="text-mute">
                    <th className="px-2 py-1 text-left font-medium">Period</th>
                    <th className="px-2 py-1 font-medium">Book</th>
                    <th className="px-2 py-1 font-medium">SPY</th>
                    <th className="px-2 py-1 font-medium">Relative</th>
                  </tr>
                </thead>
                <tbody>
                  {[...hist].reverse().map((h) => (
                    <tr key={h.closed_on} className="text-ink-2">
                      <td className="px-2 py-1 text-left font-mono text-mute">{h.from_date} → {h.closed_on}</td>
                      <td className={`px-2 py-1 ${h.book_return_pct >= 0 ? "text-pos" : "text-neg"}`}>{h.book_return_pct >= 0 ? "+" : ""}{h.book_return_pct.toFixed(1)}%</td>
                      <td className="px-2 py-1 text-mute">{h.spy_return_pct >= 0 ? "+" : ""}{h.spy_return_pct.toFixed(1)}%</td>
                      <td className={`px-2 py-1 ${h.relative_pct >= 0 ? "text-pos" : "text-neg"}`}>{h.relative_pct >= 0 ? "+" : ""}{h.relative_pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <div className="rounded-lg border border-paper/35 bg-warn/5 p-4 text-xs text-paper">
        <div className="text-sm font-semibold text-warn">⚠ How to read this</div>
        <ul className="mt-2 space-y-1.5">
          <li className="flex gap-2"><span className="text-warn">•</span><span>The {disp?.backtest_cagr.toFixed(0)}% figure is a backtest. The honest forward expectation is {disp?.realistic_forward} after survivorship and 3-name concentration — this live track exists to settle the true number.</span></li>
          <li className="flex gap-2"><span className="text-warn">•</span><span>E3/PEAD is the validated core (real post-earnings drift, not the announcement jump). Liquidity-survival {disp ? (disp.liquidity_survival * 100).toFixed(0) : "96"}% — the edge is tradeable, not a microcap artifact.</span></li>
          <li className="flex gap-2"><span className="text-warn">•</span><span>Research record, not a live recommendation. A 3-stock book is concentrated and can have deep drawdowns ({disp?.max_dd.toFixed(0)}% in backtest).</span></li>
        </ul>
      </div>
    </div>
  );
}
