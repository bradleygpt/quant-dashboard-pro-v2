import { useEffect, useState } from "react";
import { Card, Spinner } from "../components/ui";
import StrategyTab from "./StrategyTab";
import PaperTrackTab from "./PaperTrackTab";

const BASE = `${import.meta.env.BASE_URL}data`;

type Kind = "quant" | "paper";
interface StratDef { key: string; slug: string; label: string; factor: string; kind: Kind; backtestSlug?: string }

// All strategies live here. Quant factor strategies render the backtest StrategyTab;
// the Event-balanced strategy renders the live PaperTrackTab.
const STRATS: StratDef[] = [
  { key: "axia", slug: "axia", label: "Axia", factor: "Valuation", kind: "quant" },
  { key: "prosodos", slug: "prosodos", label: "Prosodos", factor: "Profitability", kind: "quant" },
  { key: "krasis", slug: "krasis", label: "Krasis", factor: "Balanced", kind: "quant" },
  { key: "auxo", slug: "auxo", label: "Auxo", factor: "Growth", kind: "quant" },
  { key: "horme", slug: "horme", label: "Horme", factor: "Momentum", kind: "quant" },
  { key: "event_balanced", slug: "event_balanced", label: "Event-Balanced", factor: "Event / PEAD", kind: "paper", backtestSlug: "aristeia" },
];

interface Row {
  def: StratDef; engine: string; cagr: number; sharpe: number; maxdd: number; spy: number;
  tickers: string[]; next: string; status: "live" | "backtest";
}

function SummaryRow(d: any, def: StratDef): Row {
  if (def.kind === "paper") {
    const dz = d.display ?? {};
    const holds = d.current_holdings ?? d.holdings ?? [];
    return {
      def, engine: dz.engine ?? def.label, cagr: dz.backtest_cagr ?? NaN, sharpe: dz.sharpe ?? NaN,
      maxdd: dz.max_dd ?? NaN, spy: dz.spy_cagr ?? NaN,
      tickers: holds.map((h: any) => h.ticker), next: d.next_rebalance_date ?? "—", status: "live",
    };
  }
  const m = d.metrics?.in_sample ?? {};
  const ch = d.current_holdings;
  const tickers: string[] = Array.isArray(ch) && typeof ch[0] === "string"
    ? ch
    : (d.holdings ? [...d.holdings].sort((a: any, b: any) => b.date.localeCompare(a.date))[0]?.tickers ?? [] : []);
  return {
    def, engine: d.engine ?? def.label, cagr: m.cagr ?? NaN, sharpe: m.sharpe ?? NaN, maxdd: m.max_dd ?? NaN,
    spy: d.metrics?.spy_cagr ?? NaN, tickers, next: d.next_rebalance ?? "—", status: "backtest",
  };
}

function Summary({ onPick }: { onPick: (key: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    Promise.all(
      STRATS.map((def) => {
        const file = def.kind === "paper" ? "paper_track_event_pead.json" : `${def.slug}_strategy.json`;
        return fetch(`${BASE}/${file}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => (j ? SummaryRow(j, def) : null))
          .catch(() => null);
      })
    ).then((rs) => setRows(rs.filter(Boolean) as Row[]));
  }, []);

  if (!rows) return <Spinner label="Loading strategies…" />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Strategies — overview</h2>
        <p className="text-xs text-[#7C879B]">
          Five quant factor strategies (backtests over the de-contaminated 2011–2026 EDGAR panel) plus the live
          Event-balanced paper-track. Backtest CAGRs are research records, not forward guarantees. Click a row for the full page.
        </p>
      </div>

      <Card title="" sub="">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-right text-xs">
            <thead>
              <tr className="text-[#7C879B]">
                <th className="px-2 py-1.5 text-left font-medium">Strategy</th>
                <th className="px-2 py-1.5 text-left font-medium">Status</th>
                <th className="px-2 py-1.5 font-medium">Backtest CAGR</th>
                <th className="px-2 py-1.5 font-medium">vs SPY</th>
                <th className="px-2 py-1.5 font-medium">Sharpe</th>
                <th className="px-2 py-1.5 font-medium">Max DD</th>
                <th className="px-2 py-1.5 text-left font-medium">Current tickers</th>
                <th className="px-2 py-1.5 font-medium">Next rebalance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const excess = r.cagr - r.spy;
                return (
                  <tr
                    key={r.def.key}
                    onClick={() => onPick(r.def.key)}
                    className="cursor-pointer border-t border-[#161D29] text-[#C7CEDA] hover:bg-[#141B27]"
                  >
                    <td className="px-2 py-2 text-left">
                      <span className="font-semibold text-[#E6E9EF]">{r.engine}</span>
                      <span className="ml-1.5 text-[#7C879B]">{r.def.factor}</span>
                    </td>
                    <td className="px-2 py-2 text-left">
                      {r.status === "live" ? (
                        <span className="rounded-full bg-[#0E2A14] px-2 py-0.5 text-[10px] font-semibold text-[#00C805] ring-1 ring-[#1C5C2E]">● Live</span>
                      ) : (
                        <span className="rounded-full bg-[#1A2230] px-2 py-0.5 text-[10px] text-[#9CA7BB]">Backtest</span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-semibold text-[#E6E9EF]">{isNaN(r.cagr) ? "—" : `${r.cagr.toFixed(1)}%`}</td>
                    <td className={`px-2 py-2 ${isNaN(excess) ? "text-[#7C879B]" : excess >= 0 ? "text-[#00C805]" : "text-[#FF5722]"}`}>
                      {isNaN(excess) ? "—" : `${excess >= 0 ? "+" : ""}${excess.toFixed(1)}%`}
                    </td>
                    <td className="px-2 py-2 text-[#C7CEDA]">{isNaN(r.sharpe) ? "—" : r.sharpe.toFixed(2)}</td>
                    <td className="px-2 py-2 text-[#FF8A65]">{isNaN(r.maxdd) ? "—" : `${r.maxdd.toFixed(0)}%`}</td>
                    <td className="px-2 py-2 text-left">
                      <div className="flex flex-wrap justify-start gap-1">
                        {r.tickers.slice(0, 6).map((t) => (
                          <span key={t} className="rounded border border-[#1E2632] bg-[#0C0F16] px-1.5 py-0.5 font-mono text-[10px] text-[#E6E9EF]">{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2 font-mono text-[#9CA7BB]">{r.next}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-[#5A6477]">
          Quant strategies rebalance every fixed hold-window; the Event-balanced paper-track rebalances the first trading day of each month
          (picks generated the night before). Click any row to open its full page.
        </p>
      </Card>
    </div>
  );
}

// Aristeia / Event-balanced: historical backtest (mirrors the other strategies) + the
// live forward paper-track, which doesn't begin accruing until its first rebalance (2026-07-01).
function PaperStrategyView({ def }: { def: StratDef }) {
  const [view, setView] = useState<"backtest" | "live">("backtest");
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(["backtest", "live"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1.5 text-xs transition ${
              view === v ? "bg-[#1B2433] font-semibold text-white" : "text-[#9CA7BB] hover:bg-[#161D29]"
            }`}
          >
            {v === "backtest" ? "📈 Backtest history" : "● Live paper-track (from 2026-07-01)"}
          </button>
        ))}
      </div>
      {view === "backtest" ? <StrategyTab slug={def.backtestSlug ?? def.slug} /> : <PaperTrackTab />}
    </div>
  );
}

export default function StrategiesTab() {
  const [active, setActive] = useState<string>("summary");
  const items = [{ key: "summary", label: "📊 Summary" }, ...STRATS.map((s) => ({ key: s.key, label: s.label }))];
  const cur = STRATS.find((s) => s.key === active);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 border-b border-[#1E2632] pb-2">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => setActive(it.key)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              it.key === active ? "bg-[#1B2433] font-semibold text-white" : "text-[#9CA7BB] hover:bg-[#161D29]"
            }`}
          >
            {it.key === "event_balanced" && it.key !== active ? <span className="mr-1 text-[#00C805]">●</span> : null}
            {it.label}
          </button>
        ))}
      </div>
      {active === "summary" ? (
        <Summary onPick={setActive} />
      ) : cur?.kind === "paper" ? (
        <PaperStrategyView def={cur} />
      ) : cur ? (
        <StrategyTab slug={cur.slug} />
      ) : null}
    </div>
  );
}
