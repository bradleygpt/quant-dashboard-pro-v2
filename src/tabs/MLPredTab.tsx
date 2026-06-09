import { useEffect, useMemo, useState } from "react";
import { Card, Metric, Pill, Spinner, Unavailable } from "../components/ui";
import { fmtMoney, fmtPct } from "../lib/format";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ScatterChart, Scatter, ZAxis } from "recharts";

const BASE = `${import.meta.env.BASE_URL}data`;

interface StreamSig { sig: number; p3m: number; p12m: number }
interface MLRow {
  ticker: string; sector: string | null; market_cap: number | null; price: number | null;
  pred_3m: number | null; pred_12m: number | null; target_3m: number | null; target_12m: number | null;
  c78q_post: number | null; c78q_rank: number | null; c78q_top8: number;
  n_active: number; n_bull: number; n_bear: number;
  rsi14: number | null; rsi2: number | null;
  ret_5d: number | null; ret_21d: number | null; ret_63d: number | null; ret_252d: number | null;
  dd_52wh: number | null;
  streams: Record<string, StreamSig>;
}
interface MLPred {
  generated_at?: string;
  effective_date?: string;
  n?: number;
  streams_present?: string[];
  rows: MLRow[];
}

type Sub = "rankings" | "screener" | "detail";
type Horizon = "pred_3m" | "pred_12m";

const SECTORS = ["All", "Technology", "Healthcare", "Financial Services", "Consumer Cyclical",
  "Communication Services", "Industrials", "Consumer Defensive", "Energy", "Real Estate",
  "Basic Materials", "Utilities"];

export default function MLPredTab() {
  const [data, setData] = useState<MLPred | null>(null);
  const [err, setErr] = useState(false);
  const [sub, setSub] = useState<Sub>("rankings");

  useEffect(() => {
    fetch(`${BASE}/mlpred.json`).then((r) => r.ok ? r.json() : Promise.reject()).then(setData).catch(() => setErr(true));
  }, []);

  const tabs: [Sub, string][] = [["rankings", "🏆 Rankings"], ["screener", "🔍 Screener"], ["detail", "🔬 Stream Detail"]];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">ML Predictions</h2>
        <p className="text-xs text-[#7C879B]">
          MLPred v7.2 ensemble return forecasts (3-month and 12-month horizons) across {data?.n ?? "~1,180"} US equities,
          as of {data?.effective_date ?? "latest"}. {data?.streams_present?.length ?? 0} streams active this run
          ({(data?.streams_present ?? []).join(", ") || "loading"}). Isotonic per-stream calibration on actual forward
          returns, compounded by historical R². The 1-month horizon is intentionally excluded (never validated as signal).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">{tabs.map(([k, l]) => <Pill key={k} active={sub === k} onClick={() => setSub(k)}>{l}</Pill>)}</div>

      {!data ? (err ? (
        <Unavailable what="ML prediction data" detail="mlpred.json is produced by the predict_returns engine and baked during deploy. Unavailable in a preview without it." />
      ) : <Spinner label="Loading predictions…" />) : (
        <>
          {sub === "rankings" && <RankingsBlock data={data} />}
          {sub === "screener" && <ScreenerBlock data={data} />}
          {sub === "detail" && <DetailBlock data={data} />}
        </>
      )}
    </div>
  );
}

// ── Rankings: top/bottom predicted return ───────────────────────────────────
function RankingsBlock({ data }: { data: MLPred }) {
  const [horizon, setHorizon] = useState<Horizon>("pred_3m");
  const [n, setN] = useState(25);

  const ranked = useMemo(() => {
    const valid = data.rows.filter((r) => r[horizon] != null);
    return [...valid].sort((a, b) => (b[horizon]! - a[horizon]!));
  }, [data, horizon]);

  const top = ranked.slice(0, n);
  const bottom = ranked.slice(-n).reverse();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[#7C879B]">Horizon:</span>
        <Pill active={horizon === "pred_3m"} onClick={() => setHorizon("pred_3m")}>3-Month</Pill>
        <Pill active={horizon === "pred_12m"} onClick={() => setHorizon("pred_12m")}>12-Month</Pill>
        <span className="ml-4 text-xs text-[#7C879B]">Show:</span>
        {[10, 25, 50].map((v) => <Pill key={v} active={n === v} onClick={() => setN(v)}>{v}</Pill>)}
      </div>

      <Card title={`Top ${n} — Highest Predicted ${horizon === "pred_3m" ? "3-Month" : "12-Month"} Return`}
            sub={`Ensemble forecast as of ${data.effective_date}. Predicted return and implied price target.`}>
        <PredTable rows={top} horizon={horizon} />
      </Card>

      <Card title={`Bottom ${n} — Lowest Predicted ${horizon === "pred_3m" ? "3-Month" : "12-Month"} Return`}
            sub="Weakest forecasts in the universe.">
        <PredTable rows={bottom} horizon={horizon} />
      </Card>
    </div>
  );
}

function PredTable({ rows, horizon }: { rows: MLRow[]; horizon: Horizon }) {
  const target = horizon === "pred_3m" ? "target_3m" : "target_12m";
  if (!rows.length) return <div className="text-sm text-[#7C879B]">No rows.</div>;
  return (
    <div className="overflow-auto rounded-lg border border-[#1E2632]">
      <table className="w-full text-sm">
        <thead><tr>{["#", "Ticker", "Sector", "Price", "Pred Return", "Target", "Bull/Bear", "RSI14"].map((h) =>
          <th key={h} className="bg-[#0F1420] px-3 py-2 text-left text-xs uppercase text-[#7C879B]">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.ticker} className="border-t border-[#161D29]">
              <td className="px-3 py-1.5 text-[#7C879B]">{i + 1}</td>
              <td className="px-3 py-1.5 font-semibold text-[#5BA8FF]">{r.ticker}</td>
              <td className="px-3 py-1.5 text-xs text-[#9CA7BB]">{r.sector ?? "—"}</td>
              <td className="px-3 py-1.5">{r.price != null ? fmtMoney(r.price) : "—"}</td>
              <td className="px-3 py-1.5 font-semibold" style={{ color: (r[horizon] ?? 0) >= 0 ? "#00C805" : "#FF5722" }}>
                {r[horizon] != null ? fmtPct(r[horizon]! * 100, 1, true) : "—"}
              </td>
              <td className="px-3 py-1.5 text-[#C3CAD7]">{r[target] != null ? fmtMoney(r[target]!) : "—"}</td>
              <td className="px-3 py-1.5 text-xs"><span className="text-[#00C805]">{r.n_bull}</span> / <span className="text-[#FF5722]">{r.n_bear}</span></td>
              <td className="px-3 py-1.5 text-[#9CA7BB]">{r.rsi14 != null ? r.rsi14.toFixed(0) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Screener: filter by sector + predicted return threshold ──────────────────
function ScreenerBlock({ data }: { data: MLPred }) {
  const [sector, setSector] = useState("All");
  const [minPred, setMinPred] = useState(0);
  const [horizon, setHorizon] = useState<Horizon>("pred_3m");

  const filtered = useMemo(() => {
    return data.rows
      .filter((r) => r[horizon] != null)
      .filter((r) => sector === "All" || r.sector === sector)
      .filter((r) => (r[horizon]! * 100) >= minPred)
      .sort((a, b) => b[horizon]! - a[horizon]!);
  }, [data, sector, minPred, horizon]);

  return (
    <div className="space-y-4">
      <Card title="Prediction Screener" sub="Filter the universe by sector and minimum predicted return.">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[10px] uppercase text-[#7C879B]">Sector</label>
            <select value={sector} onChange={(e) => setSector(e.target.value)}
                    className="rounded border border-[#1E2632] bg-[#0F1420] px-2 py-1 text-sm text-[#C3CAD7]">
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-[#7C879B]">Horizon</label>
            <div className="flex gap-1">
              <Pill active={horizon === "pred_3m"} onClick={() => setHorizon("pred_3m")}>3M</Pill>
              <Pill active={horizon === "pred_12m"} onClick={() => setHorizon("pred_12m")}>12M</Pill>
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-[#7C879B]">Min Pred Return: {minPred}%</label>
            <input type="range" min={-10} max={30} step={1} value={minPred}
                   onChange={(e) => setMinPred(Number(e.target.value))} className="w-40" />
          </div>
          <Metric label="Matches" value={filtered.length} />
        </div>
      </Card>

      <Card title={`${filtered.length} Matches`} sub={`${sector} · predicted ${horizon === "pred_3m" ? "3M" : "12M"} ≥ ${minPred}%`}>
        <PredTable rows={filtered.slice(0, 100)} horizon={horizon} />
        {filtered.length > 100 && <div className="mt-2 text-[11px] text-[#7C879B]">Showing top 100 of {filtered.length}.</div>}
      </Card>
    </div>
  );
}

// ── Stream Detail: per-ticker stream breakdown ───────────────────────────────
function DetailBlock({ data }: { data: MLPred }) {
  const [ticker, setTicker] = useState(data.rows[0]?.ticker ?? "");
  const row = useMemo(() => data.rows.find((r) => r.ticker === ticker), [data, ticker]);

  const streamRows = useMemo(() => {
    if (!row) return [];
    return Object.entries(row.streams).map(([sid, s]) => ({
      stream: sid, signal: s.sig, p3m: s.p3m, p12m: s.p12m,
    })).sort((a, b) => b.p3m - a.p3m);
  }, [row]);

  return (
    <div className="space-y-4">
      <Card title="Per-Stream Breakdown" sub="Each active stream's z-scored signal and its isotonic-calibrated return forecast for this ticker.">
        <div className="mb-3">
          <label className="block text-[10px] uppercase text-[#7C879B]">Ticker</label>
          <input list="mlpred-tickers" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
                 className="rounded border border-[#1E2632] bg-[#0F1420] px-2 py-1 text-sm text-[#C3CAD7]" placeholder="e.g. AAPL" />
          <datalist id="mlpred-tickers">{data.rows.map((r) => <option key={r.ticker} value={r.ticker} />)}</datalist>
        </div>

        {!row ? <div className="text-sm text-[#7C879B]">Ticker not in universe.</div> : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <Metric label="Price" value={row.price != null ? fmtMoney(row.price) : "—"} />
              <Metric label="Pred 3M" value={<span style={{ color: (row.pred_3m ?? 0) >= 0 ? "#00C805" : "#FF5722" }}>{row.pred_3m != null ? fmtPct(row.pred_3m * 100, 1, true) : "—"}</span>} />
              <Metric label="Pred 12M" value={<span style={{ color: (row.pred_12m ?? 0) >= 0 ? "#00C805" : "#FF5722" }}>{row.pred_12m != null ? fmtPct(row.pred_12m * 100, 1, true) : "—"}</span>} />
              <Metric label="Streams active" value={row.n_active} />
              <Metric label="Bull / Bear" value={`${row.n_bull} / ${row.n_bear}`} />
              <Metric label="RSI14" value={row.rsi14 != null ? row.rsi14.toFixed(0) : "—"} />
            </div>

            <div className="overflow-auto rounded-lg border border-[#1E2632]">
              <table className="w-full text-sm">
                <thead><tr>{["Stream", "Signal (z)", "Pred 3M", "Pred 12M"].map((h) =>
                  <th key={h} className="bg-[#0F1420] px-3 py-2 text-left text-xs uppercase text-[#7C879B]">{h}</th>)}</tr></thead>
                <tbody>
                  {streamRows.map((s) => (
                    <tr key={s.stream} className="border-t border-[#161D29]">
                      <td className="px-3 py-1.5 font-semibold text-[#5BA8FF]">{s.stream}</td>
                      <td className="px-3 py-1.5" style={{ color: s.signal >= 0 ? "#00C805" : "#FF5722" }}>{s.signal.toFixed(3)}</td>
                      <td className="px-3 py-1.5" style={{ color: s.p3m >= 0 ? "#00C805" : "#FF5722" }}>{fmtPct(s.p3m * 100, 1, true)}</td>
                      <td className="px-3 py-1.5" style={{ color: s.p12m >= 0 ? "#00C805" : "#FF5722" }}>{fmtPct(s.p12m * 100, 1, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="5d return" value={row.ret_5d != null ? fmtPct(row.ret_5d * 100, 1, true) : "—"} />
              <Metric label="21d return" value={row.ret_21d != null ? fmtPct(row.ret_21d * 100, 1, true) : "—"} />
              <Metric label="63d return" value={row.ret_63d != null ? fmtPct(row.ret_63d * 100, 1, true) : "—"} />
              <Metric label="252d return" value={row.ret_252d != null ? fmtPct(row.ret_252d * 100, 1, true) : "—"} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
