import { useEffect, useState } from "react";
import { Card, Spinner } from "../components/ui";
import StrategyTab from "./StrategyTab";
import PaperTrackTab from "./PaperTrackTab";
import C78QTab from "./C78QTab";
import StrategiesViz from "./StrategiesViz";

const BASE = `${import.meta.env.BASE_URL}data`;

type Kind = "quant" | "paper" | "c78q";
interface StratDef { key: string; slug: string; label: string; factor: string; kind: Kind; backtestSlug?: string; live?: boolean }

// The consolidated portfolio (post-redundancy-audit 2026-06-20): Katalepsis + Aristeia are the two
// genuinely distinct bets; Auxo + Prosodos are the surviving quant factors; Pronoia (ML 12-month
// foresight) is the validated, decorrelated 5th (added 2026-06-20). Axia/Krasis/Horme retired.
const STRATS: StratDef[] = [
  { key: "katalepsis", slug: "c78q", label: "Katalepsis", factor: "ML posterior · c78q", kind: "c78q", live: true },
  { key: "aristeia", slug: "event_balanced", label: "Aristeia", factor: "Event / PEAD", kind: "paper", backtestSlug: "aristeia", live: true },
  { key: "auxo", slug: "auxo", label: "Auxo", factor: "Growth", kind: "quant" },
  { key: "prosodos", slug: "prosodos", label: "Prosodos", factor: "Profitability", kind: "quant" },
  { key: "pronoia", slug: "pronoia", label: "Pronoia", factor: "ML 12-month foresight", kind: "quant" },
];

interface Row {
  def: StratDef; engine: string; cagr: number; sharpe: number; maxdd: number; spy: number;
  tickers: string[]; next: string; status: "live" | "backtest";
}

function SummaryRow(d: any, def: StratDef): Row {
  if (def.kind === "c78q") {
    const bt = d.metrics?.backtest ?? {};
    const tickers = (d.target?.rows ?? []).map((r: any) => r.ticker);
    return {
      def, engine: "Katalepsis", cagr: (bt.net_cagr ?? NaN) * 100, sharpe: bt.sharpe ?? NaN,
      maxdd: (bt.max_drawdown ?? NaN) * 100, spy: (bt.spy_cagr ?? NaN) * 100,
      tickers, next: d.state?.next_rebalance ?? "—", status: "live",
    };
  }
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

interface Basket { full: { cagr: number; sharpe: number; max_dd: number }; deployable: { cagr: number; sharpe: number; max_dd: number }; spy_cagr: number; n: number }

function Summary({ onPick }: { onPick: (key: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [basket, setBasket] = useState<Basket | null>(null);
  const [rationale, setRationale] = useState<Record<string, { rationale: string }> | null>(null);

  useEffect(() => {
    fetch(`${BASE}/basket_summary.json`).then((r) => (r.ok ? r.json() : null)).then(setBasket).catch(() => setBasket(null));
    fetch(`${BASE}/strategy_rationale.json`).then((r) => (r.ok ? r.json() : null)).then((j) => setRationale(j?.strategies ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all(
      STRATS.map((def) => {
        const file = def.kind === "paper" ? "paper_track_event_pead.json" : def.kind === "c78q" ? "c78q.json" : `${def.slug}_strategy.json`;
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
        <h2 className="text-lg font-bold text-white">Strategies — consolidated portfolio</h2>
        <p className="text-xs text-[#7C879B]">
          Five strategies run as one pooled book: <span className="text-[#C7CEDA]">Katalepsis</span> (ML posterior),
          <span className="text-[#C7CEDA]"> Aristeia</span> (event/PEAD) and <span className="text-[#C7CEDA]">Pronoia</span> (ML
          12-month foresight) are the three distinct, decorrelated bets; Auxo and Prosodos are the surviving quant factors.
          Axia/Krasis/Horme were retired as redundant per the combined-book audit. Backtest CAGRs are research records, not forward guarantees. Click a row for the full page.
        </p>
      </div>

      {basket && (
        <div className="rounded-lg border border-[#1C5C2E] bg-[#0B1A0F] p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-[#00C805]">▣ Total basket — all {basket.n} strategies, equal-weight pooled</div>
              <div className="text-[11px] text-[#7C879B]">The consolidated book (2011–2026 backtest). Deployable = excluding &gt;10% SPY drawdowns (PPI takes the book to cash there).</div>
            </div>
            <div className="flex flex-wrap gap-5">
              <div><div className="text-[10px] uppercase tracking-wide text-[#7C879B]">Basket CAGR</div><div className="font-mono text-xl font-bold text-[#00C805]">{basket.full.cagr.toFixed(1)}%</div><div className="text-[10px] text-[#7C879B]">vs SPY {basket.spy_cagr.toFixed(1)}%</div></div>
              <div><div className="text-[10px] uppercase tracking-wide text-[#7C879B]">Sharpe</div><div className="font-mono text-xl font-bold text-white">{basket.full.sharpe.toFixed(2)}</div><div className="text-[10px] text-[#7C879B]">{basket.deployable.sharpe.toFixed(2)} deployable</div></div>
              <div><div className="text-[10px] uppercase tracking-wide text-[#7C879B]">Max DD</div><div className="font-mono text-xl font-bold text-[#FF8A65]">{basket.full.max_dd.toFixed(1)}%</div><div className="text-[10px] text-[#7C879B]">true daily</div></div>
            </div>
          </div>
        </div>
      )}

      {rationale && Object.values(rationale).some((s) => s?.rationale) && (
        <Card title="AI Strategy Read" sub="Why each book holds what it holds — LLM over the holdings' quant characteristics; never invented.">
          <div className="space-y-3">
            {STRATS.filter((d) => rationale[d.label]?.rationale).map((d) => (
              <div key={d.key}>
                <div className="text-sm font-semibold text-[#9CB6E0]">{d.label} <span className="text-[11px] font-normal text-[#7C879B]">· {d.factor}</span></div>
                <p className="mt-0.5 text-sm leading-relaxed text-[#C3CAD7]">{rationale[d.label].rationale}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

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

      <StrategiesViz />
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
            {STRATS.find((s) => s.key === it.key)?.live && it.key !== active ? <span className="mr-1 text-[#00C805]">●</span> : null}
            {it.label}
          </button>
        ))}
      </div>
      {active === "summary" ? (
        <Summary onPick={setActive} />
      ) : cur?.kind === "c78q" ? (
        <C78QTab />
      ) : cur?.kind === "paper" ? (
        <PaperStrategyView def={cur} />
      ) : cur ? (
        <StrategyTab slug={cur.slug} />
      ) : null}
    </div>
  );
}
