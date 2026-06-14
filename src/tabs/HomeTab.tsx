import { useEffect, useMemo, useState } from "react";
import { useStore, type ViewRow } from "../store";
import { Card, Metric, RatingBadge, Spinner, Unavailable, Pill } from "../components/ui";
import { SortableTable, RATING_RANK, type Column } from "../components/SortableTable";
import { fmtMoney, fmtPct } from "../lib/format";
import { useLiveData } from "../lib/live";
import { computeBreadth, computeFearGreed } from "../lib/regime";
import { computePpi } from "../lib/ppiIndex";
import { getDeltas, type SnapshotsFile } from "../lib/snapshots";
import { analyzePortfolio, type Holding } from "../lib/portfolio";

const BASE = `${import.meta.env.BASE_URL}data`;

interface Market { ok?: boolean; spy?: any; vix?: any; buffett?: any; indices?: any[] }
interface Cal { ok?: boolean; reason?: string; earnings?: { symbol: string; date: string; hour?: string }[]; ipos?: { symbol: string; name?: string; date: string; exchange?: string }[] }

function Delta({ wk, mo }: { wk: number | null; mo: number | null }) {
  const c = (v: number | null) => (v == null ? "#7C879B" : v >= 0 ? "#00C805" : "#FF5722");
  return (
    <div className="text-[10px] text-[#7C879B]">
      1W <span style={{ color: c(wk) }}>{wk == null ? "—" : fmtPct(wk, 1, true)}</span>
      {"  ·  "}1M <span style={{ color: c(mo) }}>{mo == null ? "—" : fmtPct(mo, 1, true)}</span>
    </div>
  );
}

export default function HomeTab() {
  const { rows, loadingUniverse, preset, meta, setActiveTab, goToDetail } = useStore();
  const mkt = useLiveData<Market>("/api/market", 25000); // ~11s chain (FRED CSV slow) — avoid racing the 12s default abort
  const cal = useLiveData<Cal>("/api/calendar");
  const [snap, setSnap] = useState<SnapshotsFile | null>(null);
  useEffect(() => { fetch(`${BASE}/snapshots.json`).then((r) => r.ok ? r.json() : null).then(setSnap).catch(() => {}); }, []);
  const [holdings] = useState<Holding[]>(() => { try { return JSON.parse(localStorage.getItem("qd_holdings") || "[]"); } catch { return []; } });

  const presetKey = preset === "Custom" ? meta.default_preset : preset;
  // research-prior presets have no validated absolute threshold — fall back to the default.
  const threshold = meta.absolute_thresholds[presetKey] ?? meta.absolute_thresholds[meta.default_preset];

  const stocks = useMemo(() => rows.filter((r) => r.sector !== "ETF"), [rows]);
  const breadth = useMemo(() => (rows.length ? computeBreadth(rows) : null), [rows]);
  const sp = mkt.data?.indices?.find((i: any) => i.name === "S&P 500");
  const fearGreed = useMemo(() => (breadth && mkt.status === "ok" ? computeFearGreed(mkt.data?.vix ?? null, breadth, sp?.distance_from_ath_pct ?? null, mkt.data?.buffett ?? null) : null), [breadth, mkt, sp]);
  const ppiFeed = useLiveData<{ ok?: boolean; spy?: { close: number[] }; vix?: { close: number[] }; vvix?: { close: number[] } }>("/api/ppi", 20000);
  const ppi = useMemo(() => (ppiFeed.status === "ok" && ppiFeed.data?.spy && breadth ? computePpi(ppiFeed.data.spy.close, ppiFeed.data.vix?.close, ppiFeed.data.vvix?.close, breadth.pct_above_50sma) : null), [ppiFeed, breadth]);

  const ratingCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of stocks) c[r.rating] = (c[r.rating] ?? 0) + 1;
    return c;
  }, [stocks]);
  const breadthCount = useMemo(() => stocks.filter((r) => r.composite >= threshold).length, [stocks, threshold]);

  const universeTickers = useMemo(() => new Set(rows.map((r) => r.ticker)), [rows]);
  const earningsThisWeek = useMemo(() => {
    if (!cal.data?.earnings) return [];
    const now = new Date(), cut = new Date(now.getTime() + 7 * 86400000);
    return cal.data.earnings.filter((e) => universeTickers.has(e.symbol) && e.date && new Date(e.date) >= new Date(now.toISOString().slice(0, 10)) && new Date(e.date) <= cut);
  }, [cal.data, universeTickers]);
  const ipos14 = useMemo(() => {
    if (!cal.data?.ipos) return [];
    const now = new Date(), cut = new Date(now.getTime() + 14 * 86400000);
    return cal.data.ipos.filter((i) => i.date && new Date(i.date) >= new Date(now.toISOString().slice(0, 10)) && new Date(i.date) <= cut);
  }, [cal.data]);

  const analysis = useMemo(() => analyzePortfolio(holdings, new Map(rows.map((r) => [r.ticker, r])), rows), [holdings, rows]);

  const topOps = useMemo(() => stocks.filter((r) => r.rating === "Strong Buy+" || r.rating === "Strong Buy").sort((a, b) => b.composite - a.composite).slice(0, 6), [stocks]);

  const screenerCols = useMemo<Column<ViewRow>[]>(() => [
    { key: "ticker", header: "Ticker", sortValue: (r) => r.ticker, render: (r) => <button onClick={() => goToDetail(r.ticker)} className="font-semibold text-[#5BA8FF] hover:underline">{r.ticker}</button> },
    { key: "name", header: "Name", sortValue: (r) => r.name ?? "", render: (r) => <span className="block max-w-[200px] truncate text-[#C3CAD7]">{r.name}</span> },
    { key: "sector", header: "Sector", sortValue: (r) => r.sector ?? "", render: (r) => <span className="text-[#9CA7BB]">{r.sector}</span> },
    { key: "composite", header: "Score", align: "right", sortValue: (r) => r.composite, render: (r) => <span className="font-semibold">{r.composite.toFixed(2)}</span> },
    { key: "rating", header: "Rating", sortValue: (r) => RATING_RANK[r.rating] ?? 0, render: (r) => <RatingBadge rating={r.rating} /> },
    { key: "price", header: "Price", align: "right", sortValue: (r) => r.price, render: (r) => fmtMoney(r.price) },
    { key: "fv", header: "FV", align: "right", sortValue: (r) => r.fv, render: (r) => fmtMoney(r.fv) },
  ], [goToDetail]);

  if (loadingUniverse) return <Spinner />;

  const fgD = getDeltas(snap, "fear_greed", fearGreed?.score ?? null);
  const vixD = getDeltas(snap, "vix", mkt.data?.vix?.current ?? null);
  const bufD = getDeltas(snap, "buffett_indicator", mkt.data?.buffett?.ratio ?? null);

  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-bold text-white">Dashboard Overview</h2><p className="text-xs text-[#7C879B]">Your universe and market at a glance.</p></div>

      {/* 1. Pullback Pressure Index (c78q — faithful port of pullback_pressure_index.py) */}
      <Card title="Pullback Pressure Index (PPI)" sub="c78q market-timing gauge — 7 weighted components (live SPY/VIX/VVIX + baked-universe breadth). Full breakdown on the c78q tab.">
        {ppiFeed.status === "loading" ? <Spinner label="Loading market timing…" /> :
         !ppi ? <Unavailable what="PPI inputs" detail="Needs live SPY/VIX/VVIX from /api/ppi (deployed app only)." /> : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <div className="text-3xl font-bold" style={{ color: ppi.color }}>{ppi.score.toFixed(1)}<span className="text-base text-[#7C879B]">/100</span></div>
              <div className="text-sm font-semibold" style={{ color: ppi.color }}>{ppi.level}</div>
            </div>
            <div className="rounded-md border border-[#1E2632] bg-[#121723] p-3">
              <div className="text-xs uppercase text-[#7C879B]">Suggested deployment</div>
              <div className="text-2xl font-bold text-white">{ppi.band_deploy_pct}%</div>
              <div className="mt-1 text-xs leading-relaxed text-[#9CA7BB]">{ppi.action}</div>
            </div>
            <div className="lg:col-span-1">
              <div className="mb-1 text-xs font-semibold uppercase text-[#7C879B]">Components</div>
              <div className="space-y-1 text-xs">
                {ppi.components.map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-2">
                    <span className="text-[#C3CAD7]">{c.name}</span>
                    <span className="w-10 text-right" style={{ color: c.score < 30 ? "#00C805" : c.score < 50 ? "#FFC107" : c.score < 70 ? "#FF9800" : "#FF5722" }}>{c.score}</span>
                    <span className="w-40 truncate text-right text-[#7C879B]">{c.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* 2. This Week's Calendar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Earnings This Week" sub="Tracked universe · next 7 days">
          {cal.status === "loading" ? <Spinner /> :
           cal.data?.reason === "no_key" ? <div className="text-xs text-[#9CA7BB]">Add <code className="text-[#5BA8FF]">FINNHUB_API_KEY</code> in Vercel to enable the earnings calendar.</div> :
           cal.status === "unavailable" ? <Unavailable what="Earnings calendar" /> :
           earningsThisWeek.length === 0 ? <div className="text-sm text-[#7C879B]">No tracked-universe earnings in the next 7 days.</div> : (
            <div>
              <div className="text-sm text-[#C3CAD7]">{earningsThisWeek.length} companies reporting</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {[...new Set(earningsThisWeek.map((e) => e.date))].sort().map((d) => (
                  <span key={d} className="rounded bg-[#1A2130] px-2 py-0.5 text-xs text-[#9CA7BB]">{d.slice(5)}: {earningsThisWeek.filter((e) => e.date === d).length}</span>
                ))}
              </div>
              <details className="mt-2"><summary className="cursor-pointer text-xs text-[#5BA8FF]">View all {earningsThisWeek.length} earnings</summary>
                <div className="mt-1 max-h-40 overflow-auto text-xs">{earningsThisWeek.sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => <div key={i} className="flex justify-between border-t border-[#161D29] py-0.5"><span className="font-medium text-[#5BA8FF]">{e.symbol}</span><span className="text-[#7C879B]">{e.date} {e.hour ?? ""}</span></div>)}</div>
              </details>
            </div>
          )}
        </Card>
        <Card title="Upcoming IPOs" sub="Next 14 days">
          {cal.status === "loading" ? <Spinner /> :
           cal.data?.reason === "no_key" ? <div className="text-xs text-[#9CA7BB]">Requires <code className="text-[#5BA8FF]">FINNHUB_API_KEY</code>.</div> :
           ipos14.length === 0 ? <div className="text-sm text-[#7C879B]">No IPOs scheduled in the next 14 days.</div> : (
            <div>
              <div className="text-sm text-[#C3CAD7]">{ipos14.length} upcoming</div>
              <details className="mt-1" open><summary className="cursor-pointer text-xs text-[#5BA8FF]">View all {ipos14.length}</summary>
                <div className="mt-1 max-h-40 overflow-auto text-xs">{ipos14.map((i, k) => <div key={k} className="flex justify-between border-t border-[#161D29] py-0.5"><span><span className="font-medium text-[#5BA8FF]">{i.symbol}</span> <span className="text-[#9CA7BB]">{i.name}</span></span><span className="text-[#7C879B]">{i.date}</span></div>)}</div>
              </details>
            </div>
          )}
        </Card>
      </div>

      {/* 3. Market Health */}
      <Card title="Market Health">
        {mkt.status !== "ok" ? <Unavailable what="Live market health" detail="Live gauges come from /api/market on the deployed app." /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div><Metric label="Fear & Greed" value={fearGreed ? <span style={{ color: fearGreed.color }}>{fearGreed.score.toFixed(0)}</span> : "—"} hint={fearGreed?.classification} /><Delta wk={fgD.wk} mo={fgD.mo} /></div>
            <div><Metric label="S&P vs ATH" value={sp ? fmtPct(sp.distance_from_ath_pct ?? 0, 1, true) : "—"} /></div>
            <div><Metric label="VIX" value={mkt.data?.vix?.current != null ? mkt.data.vix.current.toFixed(1) : "—"} hint={mkt.data?.vix?.level} /><Delta wk={vixD.wk} mo={vixD.mo} /></div>
            <div><Metric label="Above 200-SMA" value={breadth ? `${breadth.pct_above_200sma.toFixed(0)}%` : "—"} /></div>
            <div><Metric label="Buffett Ind." value={mkt.data?.buffett?.ratio != null ? `${Math.round(mkt.data.buffett.ratio)}%` : "—"} hint={mkt.data?.buffett?.level} /><Delta wk={bufD.wk} mo={bufD.mo} /></div>
          </div>
        )}
      </Card>

      {/* 4. Portfolio snapshot */}
      {analysis && (
        <Card title="Your Portfolio" sub="From saved holdings (local)">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="Value" value={fmtMoney(analysis.total_value, 0)} />
            <Metric label="Holdings" value={analysis.num_holdings} />
            <Metric label="Rating" value={<RatingBadge rating={analysis.weighted_rating} />} />
            <Metric label="Score" value={`${analysis.weighted_composite.toFixed(1)}/12`} />
            <Metric label="Concentration" value={analysis.concentration_level} />
          </div>
          <button onClick={() => setActiveTab("portfolio")} className="mt-2 text-xs text-[#5BA8FF] hover:underline">Open Your Portfolio →</button>
        </Card>
      )}

      {/* 5. Top Rated Opportunities (highlight strip) */}
      <Card title="Top Rated Opportunities" sub="Highlights — open the Quant Screener for the full universe">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {topOps.map((r) => (
            <button key={r.ticker} onClick={() => goToDetail(r.ticker)} className="rounded-md border border-[#1E2632] bg-[#121723] p-2 text-left hover:border-[#2A3550]">
              <div className="font-semibold text-[#5BA8FF]">{r.ticker}</div>
              <div className="truncate text-[10px] text-[#7C879B]">{r.name}</div>
              <div className="mt-1 text-sm font-semibold">{r.composite.toFixed(1)}</div>
              <RatingBadge rating={r.rating} />
            </button>
          ))}
        </div>
        <button onClick={() => setActiveTab("screener")} className="mt-2 text-xs text-[#5BA8FF] hover:underline">Open full Quant Screener →</button>
      </Card>

      {/* 6. Mini Screener */}
      <Card title="Stock Screener" sub={`Universe rating distribution · ${breadthCount} stocks above quality threshold (${threshold.toFixed(2)})`}>
        <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <Metric label="Universe" value={stocks.length.toLocaleString()} />
          <Metric label="Strong Buy+" value={ratingCounts["Strong Buy+"] ?? 0} />
          <Metric label="Strong Buy" value={ratingCounts["Strong Buy"] ?? 0} />
          <Metric label="Buy" value={ratingCounts["Buy"] ?? 0} />
          <Metric label="Hold" value={ratingCounts["Hold"] ?? 0} />
          <Metric label="Sell" value={ratingCounts["Sell"] ?? 0} />
          <Metric label="Strong Sell" value={ratingCounts["Strong Sell"] ?? 0} />
        </div>
        <SortableTable columns={screenerCols} rows={stocks} rowKey={(r) => r.ticker} initialSortKey="composite" initialSortDir="desc" maxHeight="44vh" />
      </Card>
    </div>
  );
}
