import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Card, GradePill, RatingBadge, Spinner, Metric } from "../components/ui";
import { fmtMoney, fmtPct, fmtCapB } from "../lib/format";
import { loadTickerDetail, loadTickerPrices } from "../lib/data";
import type { TickerDetail, PriceSeries } from "../lib/types";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";

export default function StockDetailTab() {
  const { rows, byTicker, selectedTicker, selectTicker, floor, watchlist, toggleWatch, meta } = useStore();
  const [td, setTd] = useState<TickerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [series, setSeries] = useState<PriceSeries | null>(null);
  const [query, setQuery] = useState("");

  const ticker = selectedTicker ?? rows.find((r) => r.sector !== "ETF")?.ticker ?? null;
  const row = ticker ? byTicker.get(ticker) : null;

  useEffect(() => {
    if (!ticker) return;
    let live = true;
    setDetailLoading(true); setTd(null); setSeries(null);
    loadTickerDetail(floor, ticker).then((d) => { if (live) { setTd(d); setDetailLoading(false); } });
    loadTickerPrices(ticker).then((p) => { if (live) setSeries(p); });
    return () => { live = false; };
  }, [ticker, floor]);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const s = query.trim().toUpperCase();
    return rows.filter((r) => r.ticker.includes(s) || (r.name ?? "").toUpperCase().includes(s)).slice(0, 8);
  }, [query, rows]);

  const chartData = useMemo(() => {
    if (!series) return [];
    return series.dates.map((d, i) => ({ date: d, close: series.close[i] }));
  }, [series]);

  if (!row) return <div className="p-4 text-[#9CA7BB]">Select a ticker.</div>;

  return (
    <div className="space-y-4">
      {/* selector */}
      <div className="relative max-w-md">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ticker (current: ${row.ticker})`}
          className="w-full rounded-md border border-[#1E2632] bg-[#121723] px-3 py-2 text-sm text-white"
        />
        {suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-[#1E2632] bg-[#0F1420] shadow-xl">
            {suggestions.map((s) => (
              <button key={s.ticker} onClick={() => { selectTicker(s.ticker); setQuery(""); }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[#1B2433]">
                <span className="font-semibold text-[#5BA8FF]">{s.ticker}</span> <span className="text-[#9CA7BB]">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-2xl font-bold text-white">{row.ticker}</div>
          <div className="text-sm text-[#9CA7BB]">{row.name} · {row.sector} · {row.industry}</div>
        </div>
        <RatingBadge rating={row.rating} />
        <button onClick={() => toggleWatch(row.ticker)} className="rounded-md border border-[#1E2632] px-2 py-1 text-xs text-[#9CA7BB] hover:bg-[#161D29]">
          {watchlist.includes(row.ticker) ? "★ Watching" : "☆ Watch"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Price" value={fmtMoney(row.price)} />
        <Metric label="Composite" value={`${row.composite.toFixed(2)} / 12`} />
        <Metric label="Fair Value" value={fmtMoney(row.fv)} />
        <Metric label="Quant Buy Point" value={fmtMoney(row.qbp)} />
        <Metric label="Mkt Cap" value={fmtCapB(row.marketCapB)} />
        <Metric label="Prem / Disc" value={row.fv ? fmtPct((row.price! / row.fv - 1) * 100, 1, true) : "—"} hint="price vs FV" />
      </div>

      {/* price chart */}
      <Card title="Price — last ~1y (daily close)" sub={series ? undefined : "Loading price history…"}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#1A2130" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#7C879B", fontSize: 11 }} minTickGap={48} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "#7C879B", fontSize: 11 }} width={52} tickFormatter={(v) => `$${v}`} />
              <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} labelStyle={{ color: "#9CA7BB" }} formatter={(v: number) => [`$${v.toFixed(2)}`, "Close"]} />
              {row.fv && <ReferenceLine y={row.fv} stroke="#FFC107" strokeDasharray="4 4" label={{ value: "FV", fill: "#FFC107", fontSize: 11 }} />}
              {row.qbp && <ReferenceLine y={row.qbp} stroke="#00C805" strokeDasharray="4 4" label={{ value: "QBP", fill: "#00C805", fontSize: 11 }} />}
              <Line type="monotone" dataKey="close" stroke="#5BA8FF" dot={false} strokeWidth={1.6} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="py-8 text-center text-sm text-[#7C879B]">No price history baked for this ticker.</div>
        )}
      </Card>

      {/* FV + QBP */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Fair Value" sub={td?.fv ? `${td.fv.verdict} · ${td.fv.num_methods_used} methods` : undefined}>
          {detailLoading ? <Spinner /> : td?.fv ? (
            <div>
              <div className="mb-2 flex items-baseline gap-3">
                <span className="text-2xl font-bold" style={{ color: td.fv.verdict_color }}>{fmtMoney(td.fv.composite_fair_value)}</span>
                <span className="text-sm" style={{ color: td.fv.verdict_color }}>{fmtPct(td.fv.premium_discount_pct, 1, true)} vs price</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(td.fv.methods).map(([name, m]) => (
                    <tr key={name} className="border-t border-[#161D29]">
                      <td className="py-1.5 text-[#C3CAD7]">{name}</td>
                      <td className="py-1.5 text-right font-medium">{fmtMoney(m.fair_value)}</td>
                      <td className="py-1.5 text-right text-[#7C879B]">{fmtPct(m.premium_discount_pct, 1, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 text-xs text-[#7C879B]">North star: {td.fv.north_star_metric}</div>
            </div>
          ) : <div className="py-4 text-sm text-[#7C879B]">Fair value unavailable (insufficient data).</div>}
        </Card>

        <Card title="Quant Buy Point" sub={td?.qbp ? `${td.qbp.signal} · ${fmtPct(td.qbp.distance_pct, 1, true)} from buy point` : undefined}>
          {detailLoading ? <Spinner /> : td?.qbp ? (
            <div>
              <div className="mb-2 text-2xl font-bold" style={{ color: td.qbp.signal_color }}>{fmtMoney(td.qbp.buy_point)}</div>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(td.qbp.components).map(([name, c]) => (
                    <tr key={name} className="border-t border-[#161D29]">
                      <td className="py-1.5 text-[#C3CAD7]">{name}</td>
                      <td className="py-1.5 text-right text-[#7C879B]">{(c.weight * 100).toFixed(0)}%</td>
                      <td className="py-1.5 text-right font-medium">{fmtMoney(c.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {Object.entries(td.qbp.technicals).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-[#7C879B]">{k}</span><span className="text-[#C3CAD7]">{v}</span></div>
                ))}
              </div>
            </div>
          ) : <div className="py-4 text-sm text-[#7C879B]">Buy point unavailable (insufficient price history).</div>}
        </Card>
      </div>

      {/* pillar detail */}
      {td && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Object.entries(td.pillar_detail).map(([pillar, pd]) => (
            <Card key={pillar} title={pillar} sub={`Pillar grade ${pd.pillar_grade} · score ${pd.pillar_score?.toFixed?.(2) ?? pd.pillar_score}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-[#7C879B]">
                    <th className="py-1 text-left font-medium">Metric</th>
                    <th className="py-1 text-right font-medium">Value</th>
                    <th className="py-1 text-center font-medium">Grade</th>
                    <th className="py-1 text-right font-medium">Pctile</th>
                    <th className="py-1 text-right font-medium">Sector Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {pd.metrics.map((m) => (
                    <tr key={m.metric} className="border-t border-[#161D29]">
                      <td className="py-1.5 text-[#C3CAD7]">{m.metric}</td>
                      <td className="py-1.5 text-right">{m.value}</td>
                      <td className="py-1.5 text-center"><GradePill grade={m.grade} /></td>
                      <td className="py-1.5 text-right text-[#7C879B]">{m.percentile}</td>
                      <td className="py-1.5 text-right text-[#7C879B]">{m.sector_avg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
