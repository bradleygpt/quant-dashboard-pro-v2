import { useEffect, useMemo, useState } from "react";
import { useStore, type ViewRow } from "../store";
import { Card, Metric, Pill, RatingBadge, Spinner, Unavailable } from "../components/ui";
import { SortableTable, RATING_RANK, type Column } from "../components/SortableTable";
import { fmtMoney, fmtCapB, fmtPct } from "../lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import FindYourETF from "../components/FindYourETF";
import IndexAddPanel from "../components/IndexAddPanel";

const BASE = `${import.meta.env.BASE_URL}data`;
const ETF_COLORS = ["#00D4AA", "#00A3FF", "#A855F7", "#FBBF24", "#F97316"];

interface Alloc { category: string; etf: string; alt: string; weight: number; purpose: string }
interface Template { description: string; risk_score: number; expected_annual_return: string; max_drawdown_estimate: string; allocations: Alloc[] }
interface MapRow { sector?: string; theme?: string; ticker: string; alternative: string | null; use_case: string }
interface EtfData { shortName?: string; industry?: string; expenseRatio?: number | null; totalAssets?: number | null; ytdReturn?: number | null; threeYearReturn?: number | null; fiveYearReturn?: number | null; currentPrice?: number | null; beta3Year?: number | null; yield?: number | null; momentum_1m?: number | null; momentum_3m?: number | null; momentum_6m?: number | null; momentum_12m?: number | null }
interface EtfFile { templates: Record<string, Template>; sector_map: MapRow[]; theme_map: MapRow[]; etfs: Record<string, EtfData> }

type Section = "find" | "indexadd" | "builder" | "compare" | "maps" | "universe";

export default function ETFTab() {
  const { rows, loadingUniverse, goToDetail } = useStore();
  const [data, setData] = useState<EtfFile | null>(null);
  const [err, setErr] = useState(false);
  const [section, setSection] = useState<Section>("builder");

  useEffect(() => { fetch(`${BASE}/etf.json`).then((r) => r.ok ? r.json() : Promise.reject()).then(setData).catch(() => setErr(true)); }, []);

  const etfRows = useMemo(() => rows.filter((r) => r.sector === "ETF"), [rows]);

  if (loadingUniverse) return <Spinner />;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-white">ETF Center</h2>
        <p className="text-xs text-[#7C879B]">Model portfolios, ETF comparison, sector/theme tilts, and the scored ETF universe.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Pill active={section === "find"} onClick={() => setSection("find")}>🧭 Find your ETF</Pill>
        <Pill active={section === "indexadd"} onClick={() => setSection("indexadd")}>📈 Index-Add</Pill>
        <Pill active={section === "builder"} onClick={() => setSection("builder")}>📊 Portfolio Builder</Pill>
        <Pill active={section === "compare"} onClick={() => setSection("compare")}>🔍 ETF Comparison</Pill>
        <Pill active={section === "maps"} onClick={() => setSection("maps")}>🗺️ Sector & Theme Map</Pill>
        <Pill active={section === "universe"} onClick={() => setSection("universe")}>📋 ETF Universe</Pill>
      </div>

      {err && !["universe", "find"].includes(section) && <Unavailable what="ETF reference data" />}
      {!data && !err && !["universe", "find"].includes(section) && <Spinner />}

      {section === "find" && <FindYourETF />}
      {section === "indexadd" && <IndexAddPanel />}
      {section === "builder" && data && <PortfolioBuilder data={data} />}
      {section === "compare" && data && <Comparison data={data} />}
      {section === "maps" && data && <Maps data={data} />}
      {section === "universe" && <UniverseTable rows={etfRows} goToDetail={goToDetail} />}
    </div>
  );
}

function PortfolioBuilder({ data }: { data: EtfFile }) {
  const names = Object.keys(data.templates);
  const [name, setName] = useState(names[0]);
  const [capital, setCapital] = useState(100000);
  const t = data.templates[name];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1">{names.map((n) => <Pill key={n} active={n === name} onClick={() => setName(n)}>{n}</Pill>)}</div>
        <label className="text-xs text-[#9CA7BB]">Capital
          <input type="number" value={capital} onChange={(e) => setCapital(Math.max(0, parseFloat(e.target.value) || 0))} className="mt-1 block w-36 rounded-md border border-[#1E2632] bg-[#121723] px-2 py-1.5 text-sm text-white" />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Risk Score" value={`${t.risk_score}/10`} />
        <Metric label="Expected Return" value={t.expected_annual_return} />
        <Metric label="Max Drawdown" value={t.max_drawdown_estimate} />
      </div>
      <Card title={name} sub={t.description}>
        <table className="w-full text-sm">
          <thead><tr><th className="py-1 text-left text-xs uppercase text-[#7C879B]">Category</th><th className="py-1 text-left text-xs uppercase text-[#7C879B]">ETF</th><th className="py-1 text-left text-xs uppercase text-[#7C879B]">Alt</th><th className="py-1 text-right text-xs uppercase text-[#7C879B]">Weight</th><th className="py-1 text-right text-xs uppercase text-[#7C879B]">Amount</th><th className="py-1 text-left text-xs uppercase text-[#7C879B]">Purpose</th></tr></thead>
          <tbody>
            {t.allocations.map((a, i) => (
              <tr key={i} className="border-t border-[#161D29]">
                <td className="py-1.5 text-[#C3CAD7]">{a.category}</td>
                <td className="py-1.5 font-semibold text-[#5BA8FF]">{a.etf}</td>
                <td className="py-1.5 text-[#9CA7BB]">{a.alt}</td>
                <td className="py-1.5 text-right">{a.weight}%</td>
                <td className="py-1.5 text-right">{fmtMoney(capital * (a.weight / 100), 0)}</td>
                <td className="py-1.5 text-xs text-[#9CA7BB]">{a.purpose}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-[#2A3242]"><td className="py-1.5 font-semibold text-[#C3CAD7]" colSpan={3}>Total</td><td className="py-1.5 text-right font-semibold">{t.allocations.reduce((a, x) => a + x.weight, 0)}%</td><td className="py-1.5 text-right font-semibold">{fmtMoney(capital, 0)}</td><td /></tr></tfoot>
        </table>
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-[#7C879B]">How to use this allocation</summary>
          <div className="mt-2 space-y-2 text-[#9CA7BB]">
            <div>
              <div className="font-semibold text-[#C3CAD7]">Implementation steps:</div>
              <ol className="list-decimal space-y-0.5 pl-4">
                <li>Open a brokerage account if you don't have one (Fidelity, Schwab, Vanguard recommended for low fees).</li>
                <li>For each row above, place a buy order for the listed ETF using the dollar amount shown.</li>
                <li>Rebalance quarterly or when any position drifts more than 5% from target.</li>
                <li>The "Alt" column shows substitute ETFs from different providers if your broker doesn't offer the primary.</li>
              </ol>
            </div>
            <div>
              <div className="font-semibold text-[#C3CAD7]">Notes:</div>
              <ul className="list-disc space-y-0.5 pl-4">
                <li>Expected returns are based on historical averages and are not guaranteed.</li>
                <li>Max drawdown estimates reflect what historically happens in market crashes.</li>
                <li>Tax-efficient placement: hold bonds/REITs in retirement accounts and equities in taxable accounts when possible.</li>
                <li>This is informational only, not financial advice.</li>
              </ul>
            </div>
          </div>
        </details>
      </Card>
    </div>
  );
}

function Comparison({ data }: { data: EtfFile }) {
  const universe = Object.keys(data.etfs).sort();
  const [sel, setSel] = useState<string[]>(universe.slice(0, 3));
  const toggle = (t: string) => setSel(sel.includes(t) ? sel.filter((x) => x !== t) : sel.length < 5 ? [...sel, t] : sel);
  const pct = (v?: number | null) => v == null ? "—" : fmtPct(v * 100, 1, true);
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 text-[10px] uppercase text-[#7C879B]">Select 2–5 ETFs</div>
        <div className="flex max-h-28 flex-wrap gap-1 overflow-auto">
          {universe.map((t) => <Pill key={t} active={sel.includes(t)} onClick={() => toggle(t)}>{t}</Pill>)}
        </div>
      </div>
      <div className="overflow-auto rounded-lg border border-[#1E2632]">
        <table className="w-full text-sm">
          <thead><tr>{["Ticker", "Name", "Expense", "AUM", "Yield", "1M", "3M", "6M", "12M", "YTD", "3Y", "Price"].map((h) => <th key={h} className="bg-[#0F1420] px-3 py-2 text-left text-xs uppercase text-[#7C879B]">{h}</th>)}</tr></thead>
          <tbody>
            {sel.map((t) => { const d = data.etfs[t] || {}; return (
              <tr key={t} className="border-t border-[#161D29]">
                <td className="px-3 py-1.5 font-semibold text-[#5BA8FF]">{t}</td>
                <td className="max-w-[200px] truncate px-3 py-1.5 text-[#C3CAD7]">{d.shortName}</td>
                <td className="px-3 py-1.5">{d.expenseRatio == null ? "—" : `${(d.expenseRatio * 100).toFixed(2)}%`}</td>
                <td className="px-3 py-1.5">{d.totalAssets ? `$${(d.totalAssets / 1e9).toFixed(1)}B` : "—"}</td>
                <td className="px-3 py-1.5">{d.yield == null ? "N/A" : `${(d.yield * 100).toFixed(1)}%`}</td>
                <td className="px-3 py-1.5">{pct(d.momentum_1m)}</td><td className="px-3 py-1.5">{pct(d.momentum_3m)}</td>
                <td className="px-3 py-1.5">{pct(d.momentum_6m)}</td><td className="px-3 py-1.5">{pct(d.momentum_12m)}</td>
                <td className="px-3 py-1.5">{pct(d.ytdReturn)}</td><td className="px-3 py-1.5">{pct(d.threeYearReturn)}</td>
                <td className="px-3 py-1.5">{fmtMoney(d.currentPrice)}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      {/* Returns comparison bar chart */}
      {sel.length >= 2 && (() => {
        const periods: [string, keyof EtfData][] = [["1M", "momentum_1m"], ["3M", "momentum_3m"], ["6M", "momentum_6m"], ["12M", "momentum_12m"], ["YTD", "ytdReturn"]];
        const chart = periods.map(([label, key]) => {
          const row: Record<string, number | string> = { period: label };
          for (const t of sel) { const v = data.etfs[t]?.[key] as number | null | undefined; if (v != null) row[t] = v * 100; }
          return row;
        });
        return (
          <Card title="Returns Comparison" sub="Trailing returns by period across the selected ETFs.">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#1A2130" vertical={false} />
                <XAxis dataKey="period" tick={{ fill: "#7C879B", fontSize: 11 }} />
                <YAxis tick={{ fill: "#7C879B", fontSize: 11 }} width={44} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} formatter={(v: number, n) => [`${v.toFixed(1)}%`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {sel.map((t, i) => <Bar key={t} dataKey={t} fill={ETF_COLORS[i % ETF_COLORS.length]} />)}
              </BarChart>
            </ResponsiveContainer>
          </Card>
        );
      })()}
      <details className="text-xs">
        <summary className="cursor-pointer text-[#7C879B]">Comparison guide</summary>
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[#9CA7BB]">
          <li><strong className="text-[#C3CAD7]">Lower expense ratio</strong> is better (saves money long-term).</li>
          <li><strong className="text-[#C3CAD7]">Higher AUM</strong> means more liquidity, tighter bid/ask spreads.</li>
          <li><strong className="text-[#C3CAD7]">Yield</strong> matters for income-focused investors.</li>
          <li><strong className="text-[#C3CAD7]">Returns</strong> show recent performance, but past performance doesn't predict future.</li>
          <li><strong className="text-[#C3CAD7]">Beta</strong> measures volatility vs the market (1.0 = market, &gt;1 more volatile).</li>
        </ul>
      </details>
      <p className="text-[10px] text-[#5C6678]">Yield & 3Y beta are not in the source ETF cache (shown N/A), matching the Streamlit app.</p>
    </div>
  );
}

function Maps({ data }: { data: EtfFile }) {
  const tbl = (title: string, key: "sector" | "theme", map: MapRow[]) => (
    <Card title={title}>
      <table className="w-full text-sm">
        <thead><tr><th className="py-1 text-left text-xs uppercase text-[#7C879B]">{key}</th><th className="py-1 text-left text-xs uppercase text-[#7C879B]">ETF</th><th className="py-1 text-left text-xs uppercase text-[#7C879B]">Alt</th><th className="py-1 text-left text-xs uppercase text-[#7C879B]">Use case</th></tr></thead>
        <tbody>
          {map.map((m, i) => (
            <tr key={i} className="border-t border-[#161D29]">
              <td className="py-1.5 font-medium text-white">{m[key]}</td>
              <td className="py-1.5 font-semibold text-[#5BA8FF]">{m.ticker}</td>
              <td className="py-1.5 text-[#9CA7BB]">{m.alternative ?? "—"}</td>
              <td className="py-1.5 text-xs text-[#9CA7BB]">{m.use_case}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
  return <div className="space-y-4">{tbl("Sector ETFs", "sector", data.sector_map)}{tbl("Thematic ETFs", "theme", data.theme_map)}</div>;
}

function relativeRating(pct: number): string {
  if (pct >= 0.85) return "Strong Buy";
  if (pct >= 0.60) return "Buy";
  if (pct >= 0.25) return "Hold";
  if (pct >= 0.10) return "Sell";
  return "Strong Sell";
}

// Look-through scoring: each ETF as a weight-weighted basket of its holdings' stock scores
// (etf_lookthrough.json, built free from yfinance top-holdings). Module-cached.
type LT = { lt_score: number | null; coverage: number; n_matched: number; equity: boolean; note: string; name?: string | null; price?: number | null; aum?: number | null; in_universe?: boolean; top?: { t: string; w: number; s: number }[] };
type LTData = { etfs: Record<string, LT>; n_scored: number; n_etfs: number; source: string };
let ltCache: LTData | null = null, ltInflight: Promise<LTData | null> | null = null;
function useLookthrough(): LTData | null {
  const [d, setD] = useState<LTData | null>(ltCache);
  useEffect(() => {
    if (ltCache) return;
    if (!ltInflight) ltInflight = fetch(`${import.meta.env.BASE_URL}data/etf_lookthrough.json`).then((r) => (r.ok ? r.json() : null)).then((j) => { ltCache = j; return j; }).catch(() => null);
    ltInflight.then(setD);
  }, []);
  return d;
}

type EtfRow = { ticker: string; name: string; price: number | null; aumB: number | null; composite: number | null; lt_score: number | null; coverage: number; inUniverse: boolean; rating?: string };

function UniverseTable({ rows, goToDetail }: { rows: ViewRow[]; goToDetail: (t: string) => void }) {
  const lt = useLookthrough();
  const uniMap = useMemo(() => new Map(rows.map((r) => [r.ticker, r])), [rows]);
  // The look-through dataset is the authoritative ETF list (expanded beyond the baked universe);
  // merge in universe data (stock-model score, detail link) where the ETF is also baked.
  const display = useMemo<EtfRow[]>(() => {
    const tickers = lt ? Object.keys(lt.etfs) : rows.map((r) => r.ticker);
    return tickers.map((tk) => {
      const e = lt?.etfs?.[tk]; const u = uniMap.get(tk);
      return {
        ticker: tk, name: u?.name ?? e?.name ?? tk,
        price: u?.price ?? e?.price ?? null,
        aumB: u ? u.marketCapB : e?.aum != null ? e.aum / 1e9 : null,
        composite: u ? u.composite : null,
        lt_score: e?.lt_score ?? null, coverage: e?.coverage ?? 0,
        inUniverse: !!u, rating: u?.rating,
      };
    });
  }, [lt, rows, uniMap]);

  // Rate by look-through score where covered; else by stock-model composite (baked ETFs only).
  const relRating = useMemo(() => {
    const m = new Map<string, string>();
    const rank = (pool: EtfRow[], key: (r: EtfRow) => number) => {
      const asc = pool.map(key).sort((a, b) => a - b); const n = asc.length;
      pool.forEach((r) => { const below = asc.filter((s) => s < key(r)).length; m.set(r.ticker, relativeRating(n <= 1 ? 0.5 : below / (n - 1))); });
    };
    rank(display.filter((r) => r.lt_score != null), (r) => r.lt_score!);
    rank(display.filter((r) => r.lt_score == null && r.composite != null), (r) => r.composite!);
    return m;
  }, [display]);

  const cols = useMemo<Column<EtfRow>[]>(() => [
    { key: "ticker", header: "Ticker", sortValue: (r) => r.ticker, render: (r) => r.inUniverse
        ? <button onClick={() => goToDetail(r.ticker)} className="font-semibold text-[#5BA8FF] hover:underline">{r.ticker}</button>
        : <span className="font-semibold text-[#8FA8D0]" title="expanded coverage — no stock-detail page">{r.ticker}</span> },
    { key: "name", header: "Name", sortValue: (r) => r.name, render: (r) => <span className="block max-w-[280px] truncate text-[#C3CAD7]">{r.name}</span> },
    { key: "lt", header: "Look-through", align: "right", sortValue: (r) => r.lt_score ?? -1, render: (r) => r.lt_score == null
        ? <span className="text-[#5A6477]" title="low coverage (bond / broad-intl)">—</span>
        : <span title={`${Math.round(r.coverage * 100)}% of weight mapped to scored stocks`}><span className="font-semibold text-[#5BA8FF]">{r.lt_score.toFixed(2)}</span><span className="ml-1 text-[10px] text-[#7C879B]">{Math.round(r.coverage * 100)}%</span></span> },
    { key: "composite", header: "Stock-model", align: "right", sortValue: (r) => r.composite ?? -1, render: (r) => r.composite == null ? <span className="text-[#5A6477]">—</span> : <span className="text-[#9CA7BB]">{r.composite.toFixed(2)}</span> },
    { key: "rating", header: "Rating", sortValue: (r) => RATING_RANK[relRating.get(r.ticker) ?? r.rating ?? ""] ?? 0, render: (r) => { const rt = relRating.get(r.ticker) ?? r.rating; return rt ? <RatingBadge rating={rt} /> : <span className="text-[#5A6477]">—</span>; } },
    { key: "price", header: "Price", align: "right", sortValue: (r) => r.price ?? -1, render: (r) => r.price == null ? "—" : fmtMoney(r.price) },
    { key: "cap", header: "AUM", align: "right", sortValue: (r) => r.aumB ?? -1, render: (r) => <span className="text-[#9CA7BB]">{r.aumB == null ? "—" : fmtCapB(r.aumB)}</span> },
  ], [goToDetail, relRating]);

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-relaxed text-[#7C879B]">
        <strong className="text-[#9CA7BB]">Look-through</strong> scores each ETF as a weight-weighted basket of its holdings' stock scores{lt ? ` (${lt.n_scored}/${lt.n_etfs} ETFs scored; free yfinance top-holdings, % = weight mapped)` : ""}. Ratings rank <strong className="text-[#9CA7BB]">within the ETF cohort</strong> (top ~15% Strong Buy). “—” = bond / broad-international (holdings outside the scored US-equity universe). Non-linked tickers are expanded coverage beyond the baked universe (no stock-detail page). Full weights would need a paid holdings feed; the pipeline swaps in unchanged.
      </p>
      <SortableTable columns={cols} rows={display} rowKey={(r) => r.ticker} initialSortKey="lt" initialSortDir="desc" />
    </div>
  );
}
