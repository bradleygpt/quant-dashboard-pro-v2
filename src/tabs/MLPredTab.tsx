import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
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
  price_src?: "live" | "baked" | "asof";
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
  const { rows: universeRows } = useStore();
  const [raw, setRaw] = useState<MLPred | null>(null);
  const [err, setErr] = useState(false);
  const [sub, setSub] = useState<Sub>("rankings");

  useEffect(() => {
    fetch(`${BASE}/mlpred.json`).then((r) => r.ok ? r.json() : Promise.reject()).then(setRaw).catch(() => setErr(true));
  }, []);

  // Price preference: LIVE intraday quote -> baked daily price -> as-of-prediction
  // price. Predicted return is target/price - 1, so a STALE baked denominator
  // manufactures fake upside (verified: baked sat ~10-15% below live for the
  // Healthcare names dominating the top, inflating their returns). Live prices are
  // fetched only for a bounded candidate pool (the names that can populate the top
  // tables) so we never fire ~1,180 calls; the rest use baked, labeled.
  const bakedPrice = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of universeRows) if (u.price != null) m.set(u.ticker, u.price);
    return m;
  }, [universeRows]);

  const pool = useMemo(() => {
    if (!raw) return [] as string[];
    const scored = raw.rows.map((r) => {
      const p = bakedPrice.get(r.ticker) ?? r.price;
      const p12 = p && r.target_12m != null ? r.target_12m / p - 1 : (r.pred_12m ?? -99);
      const p3 = p && r.target_3m != null ? r.target_3m / p - 1 : (r.pred_3m ?? -99);
      return { t: r.ticker, m: Math.max(p12, p3) };
    });
    // top 120 (the /api/quotes cap) so the full 100-row filtered table — not just
    // the top-10/25/50 tables — is covered by live-preferred quotes.
    return scored.sort((a, b) => b.m - a.m).slice(0, 120).map((x) => x.t);
  }, [raw, bakedPrice]);

  const [live, setLive] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!pool.length) return;
    let alive = true;
    fetch(`/api/quotes?tickers=${pool.join(",")}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.prices) setLive(new Map(Object.entries(j.prices).map(([k, v]) => [k, Number(v)]))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [pool]);

  // Sanity bounds on the IMPLIED return (target/price − 1). A corrupt target or a
  // split/share-basis mismatch between the target's basis and the (live) price
  // denominator can manufacture absurd returns — e.g. KLAC: target $1,984 (baked
  // basis ~$1,929) ÷ live $254.54 = +680%, ranking it #1. Mirror the live-price
  // guard on the TARGET side: anything beyond a sane horizon bound is excluded
  // (its prediction nulled → dropped from rankings/screener) and flagged loudly.
  const SANE_3M = 1.5;   // |3-month implied return| > 150% ⇒ corrupt
  const SANE_12M = 3.0;  // |12-month implied return| > 300% ⇒ corrupt
  const { data, excluded } = useMemo<{ data: MLPred | null; excluded: { ticker: string; p3: number | null; p12: number | null }[] }>(() => {
    if (!raw) return { data: null, excluded: [] };
    const ex: { ticker: string; p3: number | null; p12: number | null }[] = [];
    const rows = raw.rows.map((r) => {
      const lp = live.get(r.ticker), bp = bakedPrice.get(r.ticker);
      const price = lp ?? bp ?? r.price;
      const price_src: MLRow["price_src"] = lp != null ? "live" : bp != null ? "baked" : "asof";
      let p3 = price && r.target_3m != null ? r.target_3m / price - 1 : r.pred_3m;
      let p12 = price && r.target_12m != null ? r.target_12m / price - 1 : r.pred_12m;
      const bad3 = p3 != null && Math.abs(p3) > SANE_3M;
      const bad12 = p12 != null && Math.abs(p12) > SANE_12M;
      if (bad3 || bad12) ex.push({ ticker: r.ticker, p3: bad3 ? p3 : null, p12: bad12 ? p12 : null });
      if (bad3) p3 = null;     // exclude from 3-month rankings/screener
      if (bad12) p12 = null;   // exclude from 12-month rankings/screener
      return { ...r, price, pred_3m: p3, pred_12m: p12, price_src };
    });
    return { data: { ...raw, rows }, excluded: ex };
  }, [raw, bakedPrice, live]);

  const tabs: [Sub, string][] = [["rankings", "🏆 Rankings"], ["screener", "🔍 Screener"], ["detail", "🔬 Stream Detail"]];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">ML Predictions</h2>
        <p className="text-xs text-[#7C879B]">
          MLPred v7.2 ensemble return forecasts (3-month and 12-month horizons) across {data?.n ?? "~1,180"} US equities,
          as of {data?.effective_date ?? "latest"}. {data?.streams_present?.length ?? 0} streams active this run
          ({(data?.streams_present ?? []).filter((s) => s !== "n_streams").join(", ") || "loading"}). Two engines: P(beat) is the binary classifier's probability of outperforming over 12 months (c78q posterior); targets
          are the return engine's monthly outputs (as-of prediction date). Predicted returns recompute as target/price − 1; the
          top tables prefer the LIVE intraday quote (labeled <span className="text-[#00C805]">live</span>) over the
          baked daily price (<span className="text-[#FF9800]">bkd</span>) so a stale denominator can't manufacture fake upside. Isotonic per-stream calibration
          on actual forward returns; 1-month horizon intentionally excluded (never validated as signal).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">{tabs.map(([k, l]) => <Pill key={k} active={sub === k} onClick={() => setSub(k)}>{l}</Pill>)}</div>

      {!data ? (err ? (
        <Unavailable what="ML prediction data" detail="mlpred.json is produced by the predict_returns engine and baked during deploy. Unavailable in a preview without it." />
      ) : <Spinner label="Loading predictions…" />) : (
        <>
          {excluded.length > 0 && (
            <div className="rounded-md border border-[#5a2a2a] bg-[#1f0d0d] px-3 py-2 text-[11px] leading-relaxed text-[#FF8A80]">
              ⚠ {excluded.length} row{excluded.length > 1 ? "s" : ""} excluded — corrupt target / price-basis mismatch (likely a stock-split or share-basis error):{" "}
              {excluded.map((e) => `${e.ticker}${e.p3 != null ? ` 3M ${(e.p3 * 100).toFixed(0)}%` : ""}${e.p12 != null ? ` 12M ${(e.p12 * 100).toFixed(0)}%` : ""}`).join("; ")}.
              An implied return (target ÷ price) beyond ±150% (3M) / ±300% (12M) is treated as corrupt and dropped from the rankings/screener rather than surfaced as a top pick.
            </div>
          )}
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
        <thead><tr>{["#", "Ticker", "Sector", "Price", "Pred Return", "Target", "P(beat)", "Bull/Bear", "RSI14"].map((h) =>
          <th key={h} className="bg-[#0F1420] px-3 py-2 text-left text-xs uppercase text-[#7C879B]">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.ticker} className="border-t border-[#161D29]">
              <td className="px-3 py-1.5 text-[#7C879B]">{i + 1}</td>
              <td className="px-3 py-1.5 font-semibold text-[#5BA8FF]">{r.ticker}</td>
              <td className="px-3 py-1.5 text-xs text-[#9CA7BB]">{r.sector ?? "—"}</td>
              <td className="px-3 py-1.5">{r.price != null ? fmtMoney(r.price) : "—"}
                {r.price_src && <span title={r.price_src === "live" ? "live intraday quote" : r.price_src === "baked" ? "baked daily price" : "as-of prediction date"} className="ml-1 text-[9px] uppercase" style={{ color: r.price_src === "live" ? "#00C805" : r.price_src === "baked" ? "#FF9800" : "#7C879B" }}>{r.price_src === "live" ? "live" : r.price_src === "baked" ? "bkd" : "asof"}</span>}</td>
              <td className="px-3 py-1.5 font-semibold" style={{ color: (r[horizon] ?? 0) >= 0 ? "#00C805" : "#FF5722" }}>
                {r[horizon] != null ? fmtPct(r[horizon]! * 100, 1, true) : "—"}
              </td>
              <td className="px-3 py-1.5 text-[#C3CAD7]">{r[target] != null ? fmtMoney(r[target]!) : "—"}</td>
              <td className="px-3 py-1.5 font-semibold" style={{ color: (r.c78q_post ?? 0) >= 0.6 ? "#00C805" : (r.c78q_post ?? 0) >= 0.4 ? "#FFC107" : "#9CA7BB" }}>{r.c78q_post != null ? `${(r.c78q_post * 100).toFixed(0)}%` : "—"}</td>
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
              <Metric label="P(beat, 12m)" value={row.c78q_post != null ? `${(row.c78q_post * 100).toFixed(1)}%` : "—"} hint={row.c78q_rank != null ? `rank ${row.c78q_rank}` : undefined} />
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
