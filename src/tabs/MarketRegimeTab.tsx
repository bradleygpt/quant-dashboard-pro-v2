import { useMemo } from "react";
import { useStore } from "../store";
import { Card, Metric, Spinner, Unavailable } from "../components/ui";
import { fmtPct, fmtNum } from "../lib/format";
import { useLiveData } from "../lib/live";
import { computeBreadth, computeFearGreed } from "../lib/regime";

const BASE = `${import.meta.env.BASE_URL}data`;

interface Market {
  ok?: boolean;
  indices?: { name: string; ok: boolean; price?: number; distance_from_ath_pct?: number; change_1d_pct?: number; change_1m_pct?: number; change_3m_pct?: number }[];
  vix?: { ok: boolean; current?: number; level?: string; score?: number; percentile?: number; avg_1y?: number };
  yields?: { ok: boolean; y10?: number; y2?: number; spread?: number };
  buffett?: { ok: boolean; ratio?: number; level?: string; score?: number };
  pgi?: { ok: boolean; pgi?: number; level?: string; money_market_t?: number; fred_keyless?: boolean };
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {fearGreed && <Metric label="Fear & Greed" value={<span style={{ color: fearGreed.color }}>{fearGreed.score.toFixed(0)}</span>} hint={fearGreed.classification} />}
          {mkt.data?.vix?.ok && <Metric label="VIX" value={fmtNum(mkt.data.vix.current, 1)} hint={mkt.data.vix.level} />}
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
            <Metric label="CPI" value={md.cpi_current != null ? `${md.cpi_current}%` : "—"} hint={md.cpi_trend} />
            <Metric label="Unemployment" value={md.unemployment_current != null ? `${md.unemployment_current}%` : "—"} hint={md.unemployment_trend} />
            <Metric label="ISM Mfg" value={md.ism_manufacturing ?? "—"} />
            <Metric label="ISM Svcs" value={md.ism_services ?? "—"} />
            <Metric label="Fed Funds" value={md.fed_funds_upper != null ? `${md.fed_funds_lower}–${md.fed_funds_upper}%` : "—"} />
            <Metric label="GDP QoQ" value={md.gdp_latest_qoq_annualized != null ? `${md.gdp_latest_qoq_annualized}%` : "—"} hint={md.gdp_quarter} />
          </div>
          {ef?.sp500_earnings_growth != null && (
            <div className="mt-3 text-sm text-[#C3CAD7]">S&P 500 modeled earnings growth: <strong className="text-white">{fmtPct(ef.sp500_earnings_growth, 1, true)}</strong></div>
          )}
        </Card>
      )}

      {/* Fed outlook + calendar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {stat.data?.fed_outlook && (
          <Card title="Fed Rate Outlook" sub={nextFomc ? `Next FOMC: ${nextFomc}` : undefined}>
            <div className="space-y-1 text-sm">
              {stat.data.fed_outlook.bias && <div><span className="text-[#7C879B]">Bias: </span><span className="text-[#C3CAD7]">{stat.data.fed_outlook.bias}</span></div>}
              {["cut_prob", "hold_prob", "hike_prob"].map((k) => stat.data!.fed_outlook[k] != null && (
                <div key={k} className="flex justify-between"><span className="capitalize text-[#7C879B]">{k.replace("_prob", "")}</span><span>{stat.data!.fed_outlook[k]}%</span></div>
              ))}
            </div>
          </Card>
        )}
        {stat.data?.economic_calendar?.length ? (
          <Card title="Economic Calendar" sub="Upcoming releases (scheduled)">
            <ul className="space-y-1 text-sm">
              {stat.data.economic_calendar.slice(0, 8).map((e, i) => (
                <li key={i} className="flex justify-between border-t border-[#161D29] py-1 first:border-0">
                  <span className="text-[#C3CAD7]">{e.name ?? e.event ?? e.title}</span>
                  <span className="text-[#7C879B]">{e.date ?? e.next_date ?? ""}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      {/* index table */}
      {mkt.status === "ok" && mkt.data?.indices?.some((i) => i.ok) && (
        <Card title="Major Indices">
          <table className="w-full text-sm">
            <thead><tr><th className="py-1 text-left text-xs uppercase text-[#7C879B]">Index</th><th className="py-1 text-right text-xs uppercase text-[#7C879B]">Price</th><th className="py-1 text-right text-xs uppercase text-[#7C879B]">vs ATH</th><th className="py-1 text-right text-xs uppercase text-[#7C879B]">1D</th><th className="py-1 text-right text-xs uppercase text-[#7C879B]">1M</th><th className="py-1 text-right text-xs uppercase text-[#7C879B]">3M</th></tr></thead>
            <tbody>
              {mkt.data.indices.filter((i) => i.ok).map((i) => (
                <tr key={i.name} className="border-t border-[#161D29]">
                  <td className="py-1.5 text-[#C3CAD7]">{i.name}</td>
                  <td className="py-1.5 text-right">{fmtNum(i.price, 0)}</td>
                  <td className="py-1.5 text-right" style={{ color: (i.distance_from_ath_pct ?? 0) >= -1 ? "#00C805" : "#FF9800" }}>{fmtPct(i.distance_from_ath_pct ?? 0, 1, true)}</td>
                  {[i.change_1d_pct, i.change_1m_pct, i.change_3m_pct].map((v, j) => (
                    <td key={j} className="py-1.5 text-right" style={{ color: (v ?? 0) >= 0 ? "#00C805" : "#FF5722" }}>{v == null ? "—" : fmtPct(v, 1, true)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-[10px] text-[#5C6678]">Live market data via keyless Yahoo Finance + FRED endpoints, fetched server-side. Macro indicators refreshed each bake. Bellwether earnings calendar deferred.</p>
    </div>
  );
}
