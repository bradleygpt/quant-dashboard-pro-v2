import { useEffect, useState } from "react";
import { Card, Spinner } from "../components/ui";
import { loadDataJSON } from "../lib/data";
import StrategyTab from "./StrategyTab";
import PaperTrackTab from "./PaperTrackTab";
import C78QTab from "./C78QTab";
import StrategiesViz from "./StrategiesViz";
import StrategySignatures from "./StrategySignatures";
import { useRebalanceSchedule, type SleeveSchedule, type ScheduleMap } from "../lib/schedule";

const BASE = `${import.meta.env.BASE_URL}data`;

type Kind = "quant" | "paper" | "c78q";
type BookType = "live" | "paper";
interface StratDef { key: string; slug: string; label: string; factor: string; kind: Kind; backtestSlug?: string }

// The consolidated portfolio (post-redundancy-audit 2026-06-20): Katalepsis + Aristeia are the two
// genuinely distinct bets; Auxo + Prosodos are the surviving quant factors; Pronoia (ML 12-month
// foresight) is the validated, decorrelated 5th (added 2026-06-20). Axia/Krasis/Horme retired.
// LIVE vs PAPER is NOT declared here — it comes from the data layer (system_status.strategies /
// each strategy JSON's book_type): live = broker-confirmed positions, paper = signal-derived
// research book. A paper book must never render as live (2026-07-01 truth-in-labeling directive).
const STRATS: StratDef[] = [
  { key: "katalepsis", slug: "c78q", label: "Katalepsis", factor: "ML posterior · c78q", kind: "c78q" },
  { key: "aristeia", slug: "event_balanced", label: "Aristeia", factor: "Event / PEAD", kind: "paper", backtestSlug: "aristeia" },
  { key: "auxo", slug: "auxo", label: "Auxo", factor: "Growth", kind: "quant" },
  { key: "prosodos", slug: "prosodos", label: "Prosodos", factor: "Profitability", kind: "quant" },
  { key: "pronoia", slug: "pronoia", label: "Pronoia", factor: "ML 12-month foresight", kind: "quant" },
];

export interface StratStatus {
  book_type?: BookType; status?: string; as_of?: string; retired?: boolean;
  // Schedule, computed by ops/rebalance_schedule.py. BOTH dimensions travel with the
  // date: which MODEL produced it, and whether THAT rebalance is paper or live.
  next_rebalance?: string; rebalance_model?: string; rebalance_model_label?: string;
  rebalance_book_type?: BookType; go_live?: string; go_live_pending?: boolean;
}
export type StratStatusMap = Record<string, StratStatus>;

export function useStrategyStatus(): StratStatusMap {
  const [map, setMap] = useState<StratStatusMap>({});
  useEffect(() => {
    loadDataJSON<any>("system_status.json")
      .then((j) => setMap(j?.strategies ?? {}));
  }, []);
  return map;
}

export function BookTypePill({ bookType, asOf }: { bookType: BookType; asOf?: string }) {
  return bookType === "live" ? (
    <span
      title={`LIVE — broker-confirmed positions${asOf ? ` (as of ${asOf})` : ""}`}
      className="rounded-full bg-brass/15 px-2 py-0.5 text-[10px] font-semibold text-brass-hi ring-1 ring-brass/40"
    >
      ● LIVE · broker
    </span>
  ) : (
    <span
      title={`PAPER — signal-derived research book, never held at a broker${asOf ? ` (as of ${asOf})` : ""}`}
      className="rounded-full bg-paper/10 px-2 py-0.5 text-[10px] font-semibold text-paper ring-1 ring-paper/30"
    >
      ◌ PAPER · research
    </span>
  );
}

interface Row {
  def: StratDef; engine: string; cagr: number; sharpe: number; maxdd: number; spy: number;
  tickers: string[]; next: string; bookType: BookType; asOf?: string;
  nextModel?: string; nextBookType?: BookType; goLive?: string; goLivePending?: boolean;
}

// The schedule is authoritative from system_status (bake folds in rebalance_schedule.json).
// Artifact fields are a fallback only -- mixing them is what put two scheduling models in
// one display slot and rendered a live book as 8 days overdue.
function schedOf(sc: SleeveSchedule | undefined, st: StratStatus | undefined, fallback?: string) {
  return {
    next: sc?.next_rebalance ?? st?.next_rebalance ?? fallback ?? "—",
    nextModel: sc?.model_label ?? st?.rebalance_model_label,
    nextBookType: sc?.rebalance_book_type ?? st?.rebalance_book_type,
    goLive: sc?.go_live ?? st?.go_live,
    goLivePending: sc?.go_live_pending ?? st?.go_live_pending,
  };
}

// book_type resolution order: system_status.strategies map -> the JSON's own field -> "paper".
// Defaulting to paper is deliberate: absent metadata must never masquerade as live money.
function resolveBookType(statusEntry: StratStatus | undefined, jsonBookType: unknown): BookType {
  if (statusEntry?.book_type === "live" || statusEntry?.book_type === "paper") return statusEntry.book_type;
  if (jsonBookType === "live" || jsonBookType === "paper") return jsonBookType;
  return "paper";
}

function SummaryRow(d: any, def: StratDef, statusEntry: StratStatus | undefined,
                    sched: SleeveSchedule | undefined, stratJson?: any): Row {
  if (def.kind === "c78q") {
    const bt = d.metrics?.backtest ?? {};
    const tickers = (d.target?.rows ?? []).map((r: any) => r.ticker);
    return {
      def, engine: "Katalepsis", cagr: (bt.net_cagr ?? NaN) * 100, sharpe: bt.sharpe ?? NaN,
      maxdd: (bt.max_drawdown ?? NaN) * 100, spy: (bt.spy_cagr ?? NaN) * 100,
      tickers, ...schedOf(sched, statusEntry, d.state?.next_rebalance),
      bookType: resolveBookType(statusEntry, d.target?.book_type),
      asOf: statusEntry?.as_of ?? d.target?.as_of,
    };
  }
  if (def.kind === "paper") {
    // Metrics come from the paper-track display block; the HELD book + book_type come from the
    // ledger-driven strategy JSON (current_holdings) so a live broker book renders as the book.
    const dz = d?.display ?? {};
    const ch = stratJson?.current_holdings ?? {};
    const bookType = resolveBookType(statusEntry, ch.book_type);
    const liveTickers: string[] = Array.isArray(ch.tickers) ? ch.tickers : [];
    const paperHolds = (d?.current_holdings ?? d?.holdings ?? []).map((h: any) => h.ticker);
    return {
      def, engine: dz.engine ?? def.label, cagr: dz.backtest_cagr ?? NaN, sharpe: dz.sharpe ?? NaN,
      maxdd: dz.max_dd ?? NaN, spy: dz.spy_cagr ?? NaN,
      tickers: bookType === "live" && liveTickers.length ? liveTickers : paperHolds,
      ...schedOf(sched, statusEntry, d?.next_rebalance_date ?? stratJson?.next_rebalance),
      bookType, asOf: statusEntry?.as_of ?? ch.as_of,
    };
  }
  const m = d.metrics?.in_sample ?? {};
  const ch = d.current_holdings;
  const tickers: string[] = Array.isArray(ch?.tickers)
    ? ch.tickers
    : Array.isArray(ch) && typeof ch[0] === "string"
      ? ch
      : (d.holdings ? [...d.holdings].sort((a: any, b: any) => b.date.localeCompare(a.date))[0]?.tickers ?? [] : []);
  return {
    def, engine: d.engine ?? def.label, cagr: m.cagr ?? NaN, sharpe: m.sharpe ?? NaN, maxdd: m.max_dd ?? NaN,
    spy: d.metrics?.spy_cagr ?? NaN, tickers, ...schedOf(sched, statusEntry, d.next_rebalance),
    bookType: resolveBookType(statusEntry, ch?.book_type),
    asOf: statusEntry?.as_of ?? ch?.as_of,
  };
}

interface Basket { full: { cagr: number; sharpe: number; max_dd: number }; deployable: { cagr: number; sharpe: number; max_dd: number }; spy_cagr: number; n: number }

function Summary({ onPick, statusMap }: { onPick: (key: string) => void; statusMap: StratStatusMap }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [basket, setBasket] = useState<Basket | null>(null);
  const [rationale, setRationale] = useState<Record<string, { rationale: string }> | null>(null);

  useEffect(() => {
    loadDataJSON<Basket>("basket_summary.json").then(setBasket);
    loadDataJSON<any>("strategy_rationale.json").then((j) => setRationale(j?.strategies ?? null));
  }, []);

  const schedMap: ScheduleMap = useRebalanceSchedule();

  useEffect(() => {
    Promise.all(
      STRATS.map(async (def) => {
        const file = def.kind === "paper" ? "paper_track_event_pead.json" : def.kind === "c78q" ? "c78q.json" : `${def.slug}_strategy.json`;
        try {
          const d = await loadDataJSON<any>(file);
          let stratJson: any = null;
          if (def.kind === "paper" && def.backtestSlug) {
            stratJson = await loadDataJSON<any>(`${def.backtestSlug}_strategy.json`);
          }
          if (!d && !stratJson) return null;
          return SummaryRow(d ?? {}, def, statusMap[def.key], schedMap[def.key], stratJson);
        } catch {
          return null;
        }
      })
    ).then((rs) => setRows(rs.filter(Boolean) as Row[]));
  }, [statusMap, schedMap]);

  const scouts = Object.entries(statusMap)
    .filter(([, v]) => (v.status ?? "").includes("research-scout"))
    .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));

  if (!rows) return <Spinner label="Loading strategies…" />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Strategies — consolidated portfolio</h2>
        <p className="text-xs text-mute">
          Five strategies run as one pooled book: <span className="text-ink-2">Katalepsis</span> (ML posterior),
          <span className="text-ink-2"> Aristeia</span> (event/PEAD) and <span className="text-ink-2">Pronoia</span> (ML
          12-month foresight) are the three distinct, decorrelated bets; Auxo and Prosodos are the surviving quant factors.
          Axia/Krasis/Horme were retired as redundant per the combined-book audit. Backtest CAGRs are research records, not forward guarantees. Click a row for the full page.
        </p>
      </div>

      {basket && (
        <div className="rounded-lg border border-pos/35 bg-pos/8 p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-pos">▣ Total basket — all {basket.n} strategies, equal-weight pooled</div>
              <div className="text-[11px] text-mute">The consolidated book (2011–2026 backtest). Deployable = excluding &gt;10% SPY drawdowns (PPI takes the book to cash there).</div>
            </div>
            <div className="flex flex-wrap gap-5">
              <div><div className="text-[10px] uppercase tracking-wide text-mute">Basket CAGR</div><div className="font-mono text-xl font-bold text-pos">{basket.full.cagr.toFixed(1)}%</div><div className="text-[10px] text-mute">vs SPY {basket.spy_cagr.toFixed(1)}%</div></div>
              <div><div className="text-[10px] uppercase tracking-wide text-mute">Sharpe</div><div className="font-mono text-xl font-bold text-white">{basket.full.sharpe.toFixed(2)}</div><div className="text-[10px] text-mute">{basket.deployable.sharpe.toFixed(2)} deployable</div></div>
              <div><div className="text-[10px] uppercase tracking-wide text-mute">Max DD</div><div className="font-mono text-xl font-bold text-neg">{basket.full.max_dd.toFixed(1)}%</div><div className="text-[10px] text-mute">true daily</div></div>
            </div>
          </div>
        </div>
      )}

      <StrategySignatures />

      {rationale && Object.values(rationale).some((s) => s?.rationale) && (
        <Card title="AI Strategy Read" sub="Why each book holds what it holds — LLM over the holdings' quant characteristics; never invented.">
          <div className="space-y-3">
            {STRATS.filter((d) => rationale[d.label]?.rationale).map((d) => (
              <div key={d.key}>
                <div className="text-sm font-semibold text-link/75">{d.label} <span className="text-[11px] font-normal text-mute">· {d.factor}</span></div>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{rationale[d.label].rationale}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="" sub="">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-right text-xs">
            <thead>
              <tr className="text-mute">
                <th className="px-2 py-1.5 text-left font-medium">Strategy</th>
                <th className="px-2 py-1.5 text-left font-medium">Book</th>
                <th className="px-2 py-1.5 font-medium">Backtest CAGR</th>
                <th className="px-2 py-1.5 font-medium">vs SPY</th>
                <th className="px-2 py-1.5 font-medium">Sharpe</th>
                <th className="px-2 py-1.5 font-medium">Max DD</th>
                <th className="px-2 py-1.5 text-left font-medium">Current book</th>
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
                    className="cursor-pointer border-t border-line-faint text-ink-2 hover:bg-hover-row"
                  >
                    <td className="px-2 py-2 text-left">
                      <span className="font-semibold text-ink">{r.engine}</span>
                      <span className="ml-1.5 text-mute">{r.def.factor}</span>
                    </td>
                    <td className="px-2 py-2 text-left">
                      <BookTypePill bookType={r.bookType} asOf={r.asOf} />
                    </td>
                    <td className="px-2 py-2 font-semibold text-ink">{isNaN(r.cagr) ? "—" : `${r.cagr.toFixed(1)}%`}</td>
                    <td className={`px-2 py-2 ${isNaN(excess) ? "text-mute" : excess >= 0 ? "text-pos" : "text-neg"}`}>
                      {isNaN(excess) ? "—" : `${excess >= 0 ? "+" : ""}${excess.toFixed(1)}%`}
                    </td>
                    <td className="px-2 py-2 text-ink-2">{isNaN(r.sharpe) ? "—" : r.sharpe.toFixed(2)}</td>
                    <td className="px-2 py-2 text-neg">{isNaN(r.maxdd) ? "—" : `${r.maxdd.toFixed(0)}%`}</td>
                    <td className="px-2 py-2 text-left">
                      <div className="flex flex-wrap justify-start gap-1">
                        {r.tickers.slice(0, 8).map((t) => (
                          <span key={t} className="rounded border border-line bg-inset px-1.5 py-0.5 font-mono text-[10px] text-ink">{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-ink-3">
                      <div className="font-mono">{r.next}</div>
                      {(r.nextModel || r.nextBookType) && (
                        <div className="mt-0.5 text-[10px] leading-tight text-mute">
                          {r.nextModel}
                          {r.nextBookType && (
                            <span className={r.nextBookType === "live" ? "text-pos" : ""}>
                              {" · "}{r.nextBookType === "live" ? "live" : "paper"}
                            </span>
                          )}
                        </div>
                      )}
                      {r.goLivePending && r.goLive && (
                        <div className="text-[10px] leading-tight text-mute">go live {r.goLive}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-dim">
          <span className="text-brass-hi">● LIVE</span> = broker-confirmed positions;{" "}
          <span className="text-paper">◌ PAPER</span> = signal-derived research book, never held at a broker.
          Quant strategies rebalance every fixed hold-window; live sleeves rebalance the first trading day of each month. Click any row to open its full page.
          {scouts.length > 0 && (
            <> {" "}Research scouts (paper, holdings-redundant — excluded from the book): {scouts.join(" · ")}.</>
          )}
        </p>
      </Card>

      <StrategiesViz statusMap={statusMap} />
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
              view === v ? "bg-active font-semibold text-white" : "text-ink-3 hover:bg-hover"
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
  const statusMap = useStrategyStatus();
  const items = [{ key: "summary", label: "📊 Summary" }, ...STRATS.map((s) => ({ key: s.key, label: s.label }))];
  const cur = STRATS.find((s) => s.key === active);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 border-b border-line pb-2">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => setActive(it.key)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              it.key === active ? "bg-active font-semibold text-white" : "text-ink-3 hover:bg-hover"
            }`}
          >
            {statusMap[it.key]?.book_type === "live" && it.key !== active ? <span className="mr-1 text-brass-hi">●</span> : null}
            {it.label}
          </button>
        ))}
      </div>
      {active === "summary" ? (
        <Summary onPick={setActive} statusMap={statusMap} />
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
