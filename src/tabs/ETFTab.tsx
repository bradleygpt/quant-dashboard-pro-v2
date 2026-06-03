import { useEffect, useMemo, useState } from "react";
import { useStore, type ViewRow } from "../store";
import { Card, Metric, Pill, RatingBadge, Spinner, Unavailable } from "../components/ui";
import { SortableTable, RATING_RANK, type Column } from "../components/SortableTable";
import { fmtMoney, fmtCapB, fmtPct } from "../lib/format";

const BASE = `${import.meta.env.BASE_URL}data`;

interface Alloc { category: string; etf: string; alt: string; weight: number; purpose: string }
interface Template { description: string; risk_score: number; expected_annual_return: string; max_drawdown_estimate: string; allocations: Alloc[] }
interface MapRow { sector?: string; theme?: string; ticker: string; alternative: string | null; use_case: string }
interface EtfData { shortName?: string; industry?: string; expenseRatio?: number | null; totalAssets?: number | null; ytdReturn?: number | null; threeYearReturn?: number | null; fiveYearReturn?: number | null; currentPrice?: number | null; beta3Year?: number | null; yield?: number | null; momentum_1m?: number | null; momentum_3m?: number | null; momentum_6m?: number | null; momentum_12m?: number | null }
interface EtfFile { templates: Record<string, Template>; sector_map: MapRow[]; theme_map: MapRow[]; etfs: Record<string, EtfData> }

type Section = "builder" | "compare" | "maps" | "universe";

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
        <Pill active={section === "builder"} onClick={() => setSection("builder")}>📊 Portfolio Builder</Pill>
        <Pill active={section === "compare"} onClick={() => setSection("compare")}>🔍 ETF Comparison</Pill>
        <Pill active={section === "maps"} onClick={() => setSection("maps")}>🗺️ Sector & Theme Map</Pill>
        <Pill active={section === "universe"} onClick={() => setSection("universe")}>📋 ETF Universe</Pill>
      </div>

      {err && section !== "universe" && <Unavailable what="ETF reference data" />}
      {!data && !err && section !== "universe" && <Spinner />}

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

function UniverseTable({ rows, goToDetail }: { rows: ViewRow[]; goToDetail: (t: string) => void }) {
  const cols = useMemo<Column<ViewRow>[]>(() => [
    { key: "ticker", header: "Ticker", sortValue: (r) => r.ticker, render: (r) => <button onClick={() => goToDetail(r.ticker)} className="font-semibold text-[#5BA8FF] hover:underline">{r.ticker}</button> },
    { key: "name", header: "Name", sortValue: (r) => r.name ?? "", render: (r) => <span className="block max-w-[320px] truncate text-[#C3CAD7]">{r.name}</span> },
    { key: "composite", header: "Score", align: "right", sortValue: (r) => r.composite, render: (r) => <span className="font-semibold">{r.composite.toFixed(2)}</span> },
    { key: "rating", header: "Rating", sortValue: (r) => RATING_RANK[r.rating] ?? 0, render: (r) => <RatingBadge rating={r.rating} /> },
    { key: "price", header: "Price", align: "right", sortValue: (r) => r.price, render: (r) => fmtMoney(r.price) },
    { key: "cap", header: "AUM/Cap", align: "right", sortValue: (r) => r.marketCapB, render: (r) => <span className="text-[#9CA7BB]">{fmtCapB(r.marketCapB)}</span> },
  ], [goToDetail]);
  return <SortableTable columns={cols} rows={rows} rowKey={(r) => r.ticker} initialSortKey="composite" initialSortDir="desc" />;
}
