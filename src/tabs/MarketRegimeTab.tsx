import { useMemo } from "react";
import { useStore } from "../store";
import { Card, Metric, Spinner, Unavailable } from "../components/ui";
import { fmtPct, fmtNum } from "../lib/format";
import { useLiveData } from "../lib/live";
import { computeBreadth, computeFearGreed } from "../lib/regime";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const clip = (x: number) => Math.max(0, Math.min(100, x));
// port of macro.compute_macro_health (static macro + live yield curve)
function macroHealth(md: Record<string, any>, spread: number | null) {
  const ism = md.ism_composite, unemp = md.unemployment_current, gdp = md.gdp_latest_qoq_annualized, cpi = md.cpi_current;
  const ismS = clip((ism - 45) * 6.67), unS = clip((7.0 - unemp) / 3.5 * 100), gdpS = clip(gdp * 25);
  const cpiS = cpi >= 2.0 && cpi <= 2.5 ? 100 : cpi >= 1.5 && cpi <= 3.0 ? 75 : cpi >= 1.0 && cpi <= 3.5 ? 50 : Math.max(0, 50 - Math.abs(cpi - 2.5) * 20);
  const ycS = spread == null ? 50 : spread > 0.5 ? 80 : spread > 0 ? 60 : spread > -0.5 ? 30 : 10;
  const score = ismS * 0.25 + unS * 0.25 + gdpS * 0.2 + cpiS * 0.15 + ycS * 0.15;
  const [label, color] = score >= 75 ? ["Strong Expansion", "#00C805"] : score >= 55 ? ["Moderate Growth", "#8BC34A"]
    : score >= 40 ? ["Slowing", "#FFC107"] : score >= 25 ? ["Contraction Risk", "#FF5722"] : ["Recession", "#D32F2F"];
  return { score: Math.round(score), label, color, comps: { ISM: Math.round(ismS), Unemployment: Math.round(unS), GDP: Math.round(gdpS), CPI: Math.round(cpiS), "Yield Curve": Math.round(ycS) } };
}

const BASE = `${import.meta.env.BASE_URL}data`;

interface Market {
  ok?: boolean;
  indices?: { name: string; ok: boolean; price?: number; distance_from_ath_pct?: number; change_1d_pct?: number; change_5d_pct?: number; change_1m_pct?: number; change_3m_pct?: number; ytd_pct?: number }[];
  dxy?: { ok: boolean; current?: number; change_1d_pct?: number; ytd_pct?: number };
  vix?: { ok: boolean; current?: number; level?: string; score?: number; percentile?: number; avg_1y?: number };
  yields?: { ok: boolean; y10?: number; y2?: number; spread?: number };
  buffett?: { ok: boolean; ratio?: number; level?: string; score?: number };
  pgi?: { ok: boolean; pgi?: number; level?: string; money_market_t?: number; fred_keyless?: boolean };
  dots?: { ok: boolean; median_current_year?: number; median_longer_run?: number };
}
interface MarketStatic {
  ok?: boolean;
  macro_data?: Record<string, any>; earnings_forecast?: any; fed_outlook?: any;
  economic_calendar?: { name?: string; date?: string; description?: string; [k: string]: any }[];
  fomc_meetings?: string[]; us_gdp_trillions?: number;
}

export default function MarketRegimeTab() {
  const { rows, loadingUniverse } = useStore();
  const mkt = useLiveData<Market>("/api/market");
  const stat = useLiveData<MarketStatic>(`${BASE}/market_static.json`);

  const breadth = useMemo(() => (rows.length ? computeBreadth(rows) : null), [rows]);
  const sp = mkt.data?.indices?.find((i) => i.name === "S&P 500");
  const fearGreed = useMemo(() => {
    if (!breadth || mkt.status !== "ok") return null;
    return computeFearGreed(mkt.data?.vix ?? null, breadth, sp?.distance_from_ath_pct ?? null, mkt.data?.buffett ?? null);
  }, [breadth, mkt, sp]);

  const nextFomc = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (stat.data?.fomc_meetings ?? []).filter((d) => d >= today).sort()[0] ?? null;
  }, [stat.data]);

  if (loadingUniverse) return <Spinner />;
  const md = stat.data?.macro_data ?? {};
  const ef = stat.data?.earnings_forecast;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Market Regime</h2>
        <p className="text-xs text-[#7C879B]">Live market gauges + macro context. Breadth is computed from the scored universe; market prices/yields are fetched server-side (keyless).</p>
      </div>

      {/* live gauges */}
      {mkt.status === "loading" ? <Spinner label="Loading live market data…" /> :
       mkt.status === "unavailable" ? <Unavailable what="Live market data" detail="Market prices/VIX/yields are fetched by the /api/market serverless function on the deployed app. In a static-only preview this is unavailable; baked macro context below still renders." /> :
       (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {fearGreed && <Metric label="Fear & Greed" value={<span style={{ color: fearGreed.color }}>{fearGreed.score.toFixed(0)}</span>} hint={fearGreed.classification} />}
          {mkt.data?.vix?.ok && <Metric label="VIX" value={fmtNum(mkt.data.vix.current, 1)} hint={mkt.data.vix.level} />}
          {mkt.data?.yields?.ok && <Metric label="10Y Treasury" value={`${(mkt.data.yields.y10 ?? 0).toFixed(2)}%`} hint={`10Y–2Y ${(mkt.data.yields.spread ?? 0).toFixed(2)}%`} />}
          {mkt.data?.dxy?.ok && <Metric label="Dollar (DXY)" value={fmtNum(mkt.data.dxy.current, 2)} hint={mkt.data.dxy.ytd_pct != null ? `YTD ${fmtPct(mkt.data.dxy.ytd_pct, 1, true)}` : undefined} />}
          {sp && <Metric label="S&P vs ATH" value={fmtPct(sp.distance_from_ath_pct ?? 0, 1, true)} />}
          {mkt.data?.yields?.ok && <Metric label="10Y–2Y" value={`${(mkt.data.yields.spread ?? 0).toFixed(2)}%`} hint={(mkt.data.yields.spread ?? 0) < 0 ? "Inverted" : "Normal"} />}
          {mkt.data?.buffett?.ok && <Metric label="Buffett Ind." value={`${Math.round(mkt.data.buffett.ratio ?? 0)}%`} hint={mkt.data.buffett.level} />}
        </div>
      )}

      {/* PGI + breadth */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {mkt.status === "ok" && mkt.data?.pgi?.ok && (
          <Card title="Potential Growth Indicator (PGI)" sub={`Money-market AUM vs total market cap${mkt.data.pgi.fred_keyless ? " · FRED keyless" : " · fallback estimate"}`}>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-white">{(mkt.data.pgi.pgi ?? 0).toFixed(1)}%</span>
              <span className="text-sm text-[#9CA7BB]">{mkt.data.pgi.level}</span>
            </div>
            <div className="mt-1 text-xs text-[#7C879B]">Money market: ${(mkt.data.pgi.money_market_t ?? 0).toFixed(2)}T dry powder</div>
          </Card>
        )}
        {breadth && (
          <Card title="Market Breadth" sub="Computed from the scored universe">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between"><span className="text-[#7C879B]">% above 50-SMA</span><span>{breadth.pct_above_50sma.toFixed(0)}%</span></div>
              <div className="flex justify-between"><span className="text-[#7C879B]">% above 200-SMA</span><span>{breadth.pct_above_200sma.toFixed(0)}%</span></div>
              <div className="flex justify-between"><span className="text-[#7C879B]">% positive 1M</span><span>{breadth.pct_positive_1m.toFixed(0)}%</span></div>
              <div className="flex justify-between"><span className="text-[#7C879B]">Breadth score</span><span className="font-semibold">{breadth.breadth_score.toFixed(0)}</span></div>
            </div>
          </Card>
        )}
      </div>

      {/* macro context (baked) */}
      {stat.status === "ok" && (
        <Card title="Macro Context" sub={`Updated ${md.last_updated ?? "periodically"}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="CPI (YoY)" value={md.cpi_current != null ? `${md.cpi_current}%` : "—"} hint={md.cpi_prior != null ? `${(md.cpi_current - md.cpi_prior) >= 0 ? "+" : ""}${(md.cpi_current - md.cpi_prior).toFixed(1)}% vs prior` : md.cpi_trend} />
            <Metric label="Unemployment" value={md.unemployment_current != null ? `${md.unemployment_current}%` : "—"} hint={md.unemployment_prior != null ? `${(md.unemployment_current - md.unemployment_prior) >= 0 ? "+" : ""}${(md.unemployment_current - md.unemployment_prior).toFixed(1)}% vs prior` : md.unemployment_trend} />
            <Metric label="ISM Mfg" value={md.ism_manufacturing ?? "—"} />
            <Metric label="ISM Svcs" value={md.ism_services ?? "—"} />
            <Metric label="Fed Funds" value={md.fed_funds_upper != null ? `${md.fed_funds_lower}–${md.fed_funds_upper}%` : "—"} />
            <Metric label="GDP QoQ" value={md.gdp_latest_qoq_annualized != null ? `${md.gdp_latest_qoq_annualized}%` : "—"} hint={md.gdp_quarter} />
          </div>
        </Card>
      )}

      {/* Macro Health + Earnings Forecast */}
      {stat.status === "ok" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(() => {
            const mh = macroHealth(md, mkt.data?.yields?.spread ?? null);
            return (
              <Card title="Macro Health" sub="ISM, jobs, GDP, CPI + yield curve">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold" style={{ color: mh.color }}>{mh.score}<span className="text-base text-[#7C879B]">/100</span></span>
                  <span className="text-sm font-semibold" style={{ color: mh.color }}>{mh.label}</span>
                </div>
                <div className="mt-2 space-y-1 text-xs">
                  {Object.entries(mh.comps).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="w-24 text-[#7C879B]">{k}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#1A2130]"><div className="h-full rounded bg-[#5BA8FF]" style={{ width: `${v}%` }} /></div>
                      <span className="w-8 text-right text-[#9CA7BB]">{v}</span>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })()}
          {ef && (
            <Card title="S&P 500 Earnings Forecast" sub="3-factor model (CPI + Unemployment + ISM)">
              <div className="text-2xl font-bold text-white">{fmtPct(ef.sp500_earnings_growth, 1, true)}</div>
              <div className="text-xs text-[#7C879B]">modeled YoY earnings growth</div>
              {ef.scenarios && (
                <table className="mt-2 w-full text-xs">
                  <thead><tr><th className="py-1 text-left text-[#7C879B]">Scenario</th><th className="py-1 text-right text-[#7C879B]">Growth</th><th className="py-1 text-left text-[#7C879B]">CPI/Unemp/ISM</th></tr></thead>
                  <tbody>
                    {Object.entries<any>(ef.scenarios).map(([name, s]) => (
                      <tr key={name} className="border-t border-[#161D29]">
                        <td className="py-1 text-[#C3CAD7]">{name}</td>
                        <td className="py-1 text-right font-semibold" style={{ color: s.earnings_growth >= 0 ? "#00C805" : "#FF5722" }}>{fmtPct(s.earnings_growth, 1, true)}</td>
                        <td className="py-1 text-[#7C879B]">{s.cpi?.toFixed(1)} / {s.unemployment?.toFixed(1)} / {s.ism?.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Sector earnings forecast chart */}
      {stat.status === "ok" && ef?.sector_forecasts && (
        <Card title="Sector Earnings Forecast" sub="Modeled YoY earnings growth by sector">
          <ResponsiveContainer width="100%" height={Math.max(220, Object.keys(ef.sector_forecasts).length * 26)}>
            <BarChart layout="vertical" data={Object.entries<number>(ef.sector_forecasts).map(([s, v]) => ({ sector: s, growth: v })).sort((a, b) => b.growth - a.growth)} margin={{ left: 40, right: 20 }}>
              <XAxis type="number" tick={{ fill: "#7C879B", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="sector" width={140} tick={{ fill: "#9CA7BB", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0F1420", border: "1px solid #1E2632", borderRadius: 8 }} formatter={(v: number) => [`${v.toFixed(1)}%`, "Growth"]} />
              <Bar dataKey="growth" radius={[0, 3, 3, 0]}>
                {Object.entries<number>(ef.sector_forecasts).sort((a, b) => b[1] - a[1]).map(([s, v]) => <Cell key={s} fill={v >= 0 ? "#00C805" : "#FF5722"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Fed outlook + calendar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {stat.data?.fed_outlook && (
          <Card title="Fed Rate Outlook" sub={nextFomc ? `Next FOMC: ${nextFomc}` : undefined}>
            <div className="space-y-1 text-sm">
              {stat.data.fed_outlook.bias && <div><span className="text-[#7C879B]">Bias: </span><span className="text-[#C3CAD7]">{stat.data.fed_outlook.bias}</span></div>}
              {["cut_probability", "hold_probability", "hike_probability"].map((k) => stat.data!.fed_outlook[k] != null && (
                <div key={k} className="flex justify-between"><span className="capitalize text-[#7C879B]">{k.replace("_probability", "")}</span><span>{stat.data!.fed_outlook[k]}%</span></div>
              ))}
              {mkt.data?.dots?.ok && (
                <div className="mt-2 border-t border-[#1E2632] pt-2">
                  <div className="text-[10px] uppercase text-[#7C879B]">SEP median projection (FRED)</div>
                  <div className="flex justify-between"><span className="text-[#9CA7BB]">Current year</span><span>{mkt.data.dots.median_current_year != null ? `${mkt.data.dots.median_current_year.toFixed(2)}%` : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-[#9CA7BB]">Longer run</span><span>{mkt.data.dots.median_longer_run != null ? `${mkt.data.dots.median_longer_run.toFixed(2)}%` : "—"}</span></div>
                  <div className="text-[10px] text-[#5C6678]">Full per-participant dot matrix is only in the FOMC SEP release (not in keyless FRED); median path shown.</div>
                </div>
              )}
            </div>
          </Card>
        )}
        {stat.data?.economic_calendar?.length ? (
          <Card title="Economic Calendar" sub="Scheduled macro releases, grouped by month.">
            {(() => {
              const byMonth = new Map<string, { name: string; date: string }[]>();
              for (const e of stat.data!.economic_calendar!) {
                const date = String(e.date ?? (e as any).next_date ?? "");
                const name = String(e.name ?? (e as any).event ?? (e as any).title ?? "");
                if (!name) continue;
                const key = date.slice(0, 7) || "Scheduled";
                (byMonth.get(key) ?? byMonth.set(key, []).get(key)!).push({ name, date });
              }
              const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
              const monthLabel = (k: string) => /^\d{4}-\d{2}$/.test(k) ? new Date(`${k}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : k;
              return (
                <div className="space-y-2">
                  {months.map(([k, items]) => (
                    <div key={k}>
                      <div className="text-[11px] font-semibold uppercase text-[#7C879B]">{monthLabel(k)}</div>
                      <ul className="text-sm">
                        {items.map((e, i) => (
                          <li key={i} className="flex justify-between border-t border-[#161D29] py-1">
                            <span className="text-[#C3CAD7]">{e.name}</span><span className="text-[#7C879B]">{e.date}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="mt-2 text-[10px] text-[#5C6678]">Bellwether (S&P 100) earnings dates require a live earnings-date feed (Finnhub) — deferred, pending the same API-wiring decision as the EPS beat/miss feature.</div>
          </Card>
        ) : null}
      </div>

      {/* index table */}
      {mkt.status === "ok" && mkt.data?.indices?.some((i) => i.ok) && (
        <Card title="Major Indices">
          <table className="w-full text-sm">
            <thead><tr>{["Index", "Price", "1D", "5D", "1M", "3M", "YTD", "vs ATH"].map((h) => <th key={h} className={`py-1 text-xs uppercase text-[#7C879B] ${h === "Index" ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {mkt.data.indices.filter((i) => i.ok).map((i) => (
                <tr key={i.name} className="border-t border-[#161D29]">
                  <td className="py-1.5 text-[#C3CAD7]">{i.name}</td>
                  <td className="py-1.5 text-right">{fmtNum(i.price, 0)}</td>
                  {[i.change_1d_pct, i.change_5d_pct, i.change_1m_pct, i.change_3m_pct, i.ytd_pct].map((v, j) => (
                    <td key={j} className="py-1.5 text-right" style={{ color: (v ?? 0) >= 0 ? "#00C805" : "#FF5722" }}>{v == null ? "—" : fmtPct(v, 1, true)}</td>
                  ))}
                  <td className="py-1.5 text-right" style={{ color: (i.distance_from_ath_pct ?? 0) >= -1 ? "#00C805" : "#FF9800" }}>{fmtPct(i.distance_from_ath_pct ?? 0, 1, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-[10px] text-[#5C6678]">Live market data via keyless Yahoo Finance + FRED endpoints, fetched server-side. Macro indicators refreshed each bake.</p>
    </div>
  );
}
