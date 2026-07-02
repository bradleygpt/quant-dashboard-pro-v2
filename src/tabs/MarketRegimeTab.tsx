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
  pgi?: { ok: boolean; pgi?: number; level?: string; money_market_t?: number; total_mkt_cap_t?: number; fred_keyless?: boolean };
  dots?: { ok: boolean; median_current_year?: number; median_longer_run?: number };
}
interface PgiMM { ok?: boolean; money_market_t?: number; as_of?: string; source?: string; source_desc?: string; fetched_at?: string }

// Quarterly series + publish lag: an as-of older than ~7 months is genuinely stale.
function staleDays(asOf?: string): number | null {
  if (!asOf) return null;
  const t = Date.parse(asOf);
  if (!isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}
interface MacroSignal { id: string; label: string; unit: string; risk_dir: "higher" | "lower" | null; value: number; date: string }
interface ForwardEarnings { as_of?: string | null; source?: string; note?: string; path?: { year: string; pce_inflation: number; unemployment: number; ism_assumed: number; sp500_earnings_growth: number }[] }
interface MarketStatic {
  ok?: boolean;
  macro_data?: Record<string, any>; earnings_forecast?: any; fed_outlook?: any;
  economic_calendar?: { name?: string; date?: string; description?: string; [k: string]: any }[];
  fomc_meetings?: string[]; us_gdp_trillions?: number;
  macro_signals?: { signals?: MacroSignal[]; as_of?: string | null; source?: string };
  forward_earnings?: ForwardEarnings;
}

export default function MarketRegimeTab() {
  const { rows, loadingUniverse } = useStore();
  const mkt = useLiveData<Market>("/api/market", 25000); // /api/market chain is ~11s (FRED CSV is slow); 12s default raced the abort → spurious "unavailable"
  const stat = useLiveData<MarketStatic>(`${BASE}/market_static.json`);
  const pgiMM = useLiveData<PgiMM>(`${BASE}/pgi_money_market.json`); // baked real AUM (FRED MMMFFAQ027S) — never frozen

  // PGI money-market AUM: prefer a successful LIVE FRED hit, else the dated baked
  // value (recompute the % against live total market cap), else a flagged estimate.
  // The hardcoded constant only surfaces when both real sources are absent.
  const pgiView = useMemo(() => {
    const live = mkt.data?.pgi;
    const baked = pgiMM.data;
    const totalT = live?.total_mkt_cap_t ?? null;
    const levelOf = (pct: number | null) => pct == null ? (live?.level ?? "—") : pct > 11.5 ? "Eager to Invest" : pct >= 9.5 ? "Neutral" : "Cautious";
    if (live?.ok && live.fred_keyless && live.money_market_t != null)
      return { mmT: live.money_market_t, pct: live.pgi ?? null, level: live.level ?? levelOf(live.pgi ?? null), src: "live" as const, asOf: "live · FRED MMMFFAQ027S", stale: false };
    if (baked?.ok && baked.money_market_t != null) {
      const mmT = baked.money_market_t;
      const pct = totalT && totalT > 0 ? (mmT / totalT) * 100 : (live?.pgi ?? null);
      const days = staleDays(baked.as_of);
      return { mmT, pct, level: levelOf(pct), src: "baked" as const, asOf: `FRED MMMFFAQ027S · as-of ${baked.as_of}`, stale: days != null && days > 210 };
    }
    if (live?.ok)
      return { mmT: live.money_market_t ?? null, pct: live.pgi ?? null, level: live.level ?? "—", src: "estimate" as const, asOf: "estimate — live & baked FRED both unavailable", stale: true };
    return null;
  }, [mkt.data, pgiMM.data]);

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
        {pgiView && (
          <Card title="Potential Growth Indicator (PGI)" sub={`Money-market AUM vs total market cap · ${pgiView.asOf}`}>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-white">{pgiView.pct != null ? `${pgiView.pct.toFixed(1)}%` : "—"}</span>
              <span className="text-sm text-[#9CA7BB]">{pgiView.level}</span>
            </div>
            <div className="mt-1 text-xs text-[#7C879B]">
              Money market: {pgiView.mmT != null ? `$${pgiView.mmT.toFixed(2)}T` : "—"} dry powder
              {pgiView.pct == null && pgiView.mmT != null ? " · % needs live total market cap" : ""}
            </div>
            {pgiView.src === "estimate" && (
              <div className="mt-2 rounded-md border border-[#5A1F1F] bg-[#1F0E0E] px-2 py-1 text-[11px] text-[#FF8A80]">
                ⚠️ Hardcoded estimate — both live and baked FRED sources are unavailable. Do not rely on this value.
              </div>
            )}
            {pgiView.src === "baked" && pgiView.stale && (
              <div className="mt-2 rounded-md border border-[#3A2A12] bg-[#1C1407] px-2 py-1 text-[11px] text-[#D8B878]">
                ⚠️ Stale: latest published FRED observation is {pgiView.asOf.replace("FRED MMMFFAQ027S · as-of ", "")}. Quarterly series — a publish lag is normal, but this is older than expected.
              </div>
            )}
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
        <Card title="Macro Context" sub="CPI & Unemployment verified live vs FRED at bake time; ISM is manual (not published on FRED). Each value carries its own as-of date.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="CPI (YoY)" value={md.cpi_current != null ? `${md.cpi_current}%` : "—"} hint={`${md.cpi_prior != null ? `${(md.cpi_current - md.cpi_prior) >= 0 ? "+" : ""}${(md.cpi_current - md.cpi_prior).toFixed(1)}% vs prior · ` : ""}${md.cpi_asof ? `as-of ${md.cpi_asof.slice(0, 7)}` : md.cpi_trend ?? ""}`} />
            <Metric label="Unemployment" value={md.unemployment_current != null ? `${md.unemployment_current}%` : "—"} hint={`${md.unemployment_prior != null ? `${(md.unemployment_current - md.unemployment_prior) >= 0 ? "+" : ""}${(md.unemployment_current - md.unemployment_prior).toFixed(1)}% vs prior · ` : ""}${md.unemployment_asof ? `as-of ${md.unemployment_asof.slice(0, 7)}` : md.unemployment_trend ?? ""}`} />
            <Metric label="ISM Mfg" value={md.ism_manufacturing ?? "—"} hint={md.ism_asof ? `manual · ${md.ism_asof}` : "manual"} />
            <Metric label="ISM Svcs" value={md.ism_services ?? "—"} hint={md.ism_asof ? `manual · ${md.ism_asof}` : "manual"} />
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
              <div className="mt-1 text-[10px] leading-relaxed text-[#5C6678]">
                Inputs: CPI {md.cpi_current ?? "—"}% {md.cpi_source?.startsWith("FRED") ? `(FRED, as-of ${md.cpi_asof?.slice(0, 7) ?? "?"})` : "(static)"} · Unemp {md.unemployment_current ?? "—"}% {md.unemployment_source?.startsWith("FRED") ? `(FRED, as-of ${md.unemployment_asof?.slice(0, 7) ?? "?"})` : "(static)"} · ISM {md.ism_composite ?? "—"} (manual, as-of {md.ism_asof ?? "?"})
              </div>
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

      {/* Forward earnings path (Fed SEP forward projections) + macro signals */}
      {stat.status === "ok" && stat.data?.forward_earnings?.path?.length ? (
        <Card title="Forward Earnings Path" sub={`S&P 500 modeled earnings growth on the Fed SEP's forward macro projections · as-of ${stat.data.forward_earnings.as_of ?? "?"}`}>
          <div className="grid grid-cols-3 gap-3">
            {stat.data.forward_earnings.path.map((p) => (
              <Metric key={p.year} label={p.year}
                value={<span style={{ color: p.sp500_earnings_growth >= 0 ? "#00C805" : "#FF5722" }}>{fmtPct(p.sp500_earnings_growth, 1, true)}</span>}
                hint={`PCE ${p.pce_inflation}% · U ${p.unemployment}%`} />
            ))}
          </div>
          <div className="mt-2 text-[10px] leading-relaxed text-[#5C6678]">{stat.data.forward_earnings.note} · {stat.data.forward_earnings.source}</div>
        </Card>
      ) : null}

      {stat.status === "ok" && stat.data?.macro_signals?.signals?.length ? (
        <Card title="Macro Signals" sub={`Yield curve, credit spreads, inflation expectations & labor — free FRED series, refreshed each bake · as-of ${stat.data.macro_signals.as_of ?? "?"}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {stat.data.macro_signals.signals.map((s) => {
              const inverted = s.risk_dir === "lower" && s.value < 0;
              const val = s.unit === "k" ? `${s.value}k` : `${s.value}%`;
              return (
                <Metric key={s.id} label={s.label}
                  value={<span style={inverted ? { color: "#FF5722" } : undefined}>{val}</span>}
                  hint={inverted ? "Inverted ⚠" : (s.date ? `as-of ${s.date.slice(0, 10)}` : undefined)} />
              );
            })}
          </div>
          <div className="mt-2 text-[10px] text-[#5C6678]">Curve inversion (negative 10Y–2Y / 10Y–3M) is the classic recession lead; widening HY OAS = credit stress; rising initial claims = labor softening.</div>
        </Card>
      ) : null}

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
