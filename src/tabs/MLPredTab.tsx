import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import IndexBadges from "../components/IndexBadges";
import { Card, Metric, Pill, Spinner, Unavailable } from "../components/ui";
import AsOf from "../components/AsOf";
import { fmtMoney, fmtPct } from "../lib/format";
import { loadDataJSON } from "../lib/data";
import { INK, SEM } from "../theme";

// UI DECISIONS 2026-08-10 (Bradley): the 12-month prediction is displayed ONLY as a
// percentile ranking ("12-Month ML Ranking"). The return-space level is mechanically
// conservative (regression toward the mean compresses the output range to ~27% max when
// true annual winners run multiples of that), so it must never be presented as an
// expected return or price target. The ranking preserves what the model actually
// delivers — which stocks are most attractive relative to the universe. pred_3m and all
// target_* price columns are removed (no validated fenced signal / level-based).

interface StreamSig { sig: number; p12m: number }
interface MLRow {
  ticker: string; sector: string | null; market_cap: number | null; price: number | null;
  pred_12m_rank: number | null;
  /** legacy payloads (pre 2026-08-10 bake) carry the return-space level here */
  pred_12m?: number | null;
  c78q_post: number | null; c78q_rank: number | null; c78q_top8: number;
  n_active: number;
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

const SECTORS = ["All", "Technology", "Healthcare", "Financial Services", "Consumer Cyclical",
  "Communication Services", "Industrials", "Consumer Defensive", "Energy", "Real Estate",
  "Basic Materials", "Utilities"];

// "0.948" -> "95th"; "0.998" -> "99.8th" (one decimal only when it changes the story)
export function fmtPercentile(rank: number): string {
  const pct = rank * 100;
  if (pct < 1) return "<1st";
  const v = pct >= 99 ? Math.round(pct * 10) / 10 : Math.round(pct);
  const isInt = Number.isInteger(v);
  const suffix = !isInt ? "th"
    : v % 100 >= 11 && v % 100 <= 13 ? "th"
    : v % 10 === 1 ? "st" : v % 10 === 2 ? "nd" : v % 10 === 3 ? "rd" : "th";
  return `${v}${suffix}`;
}

const RANKING_EXPLAINER =
  "Relative-attractiveness ranking, not an expected return. The ensemble's raw return " +
  "outputs are mechanically conservative (regression toward the mean compresses the " +
  "range), so magnitudes are not meaningful — the cross-sectional ranking is what the " +
  "model validates on.";

function PercentileCell({ rank }: { rank: number | null }) {
  if (rank == null) return <span className="text-mute">—</span>;
  const topDecile = rank >= 0.9;
  const bottomDecile = rank <= 0.1;
  return (
    <span title={RANKING_EXPLAINER}>
      <span className="font-semibold" style={{ color: topDecile ? SEM.pos : bottomDecile ? SEM.neg : INK.ink2 }}>
        {fmtPercentile(rank)}
      </span>
      <span className="ml-1 text-[10px] text-mute">pctile</span>
      {topDecile && (
        <span className="ml-1.5 rounded bg-pos/15 px-1 py-0.5 text-[9px] font-semibold uppercase text-pos">top decile</span>
      )}
    </span>
  );
}

export default function MLPredTab() {
  const { rows: universeRows } = useStore();
  const [raw, setRaw] = useState<MLPred | null>(null);
  const [err, setErr] = useState(false);
  const [sub, setSub] = useState<Sub>("rankings");

  useEffect(() => {
    loadDataJSON<MLPred>("mlpred.json").then((j) => {
      if (!j) { setErr(true); return; }
      // LEGACY-PAYLOAD FALLBACK: a pre-2026-08-10 bake has no pred_12m_rank, only the
      // return-space pred_12m level. The payload is a single-date snapshot, so the
      // percentile rank of the levels IS the per-date rank — derive it client-side
      // rather than rendering an empty tab until the next publish.
      if (j.rows.length && j.rows.every((r) => r.pred_12m_rank == null)) {
        const levels = j.rows.map((r) => r.pred_12m).filter((v): v is number => v != null).sort((a, b) => a - b);
        if (levels.length) {
          j = {
            ...j,
            rows: j.rows.map((r) => {
              if (r.pred_12m == null) return r;
              const below = levels.filter((v) => v <= r.pred_12m!).length;
              return { ...r, pred_12m_rank: below / levels.length };
            }),
          };
        }
      }
      setRaw(j);
    });
  }, []);

  // Price column preference: LIVE intraday quote -> baked daily -> as-of-prediction.
  // Informational only since 2026-08-10 — nothing is computed off the price anymore
  // (the old target ÷ price return math is gone with the targets).
  const bakedPrice = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of universeRows) if (u.price != null) m.set(u.ticker, u.price);
    return m;
  }, [universeRows]);

  const pool = useMemo(() => {
    if (!raw) return [] as string[];
    const scored = raw.rows.map((r) => ({ t: r.ticker, m: r.pred_12m_rank ?? -1 }));
    return scored.sort((a, b) => b.m - a.m).slice(0, 120).map((x) => x.t);
  }, [raw]);

  const [live, setLive] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!pool.length) return;
    let alive = true;
    fetch(`/api/quotes?tickers=${pool.join(",")}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.prices) setLive(new Map(Object.entries(j.prices).map(([k, v]) => [k, Number(v)]))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [pool]);

  const data = useMemo<MLPred | null>(() => {
    if (!raw) return null;
    const rows = raw.rows.map((r) => {
      const lp = live.get(r.ticker), bp = bakedPrice.get(r.ticker);
      const price = lp ?? bp ?? r.price;
      const price_src: MLRow["price_src"] = lp != null ? "live" : bp != null ? "baked" : "asof";
      return { ...r, price, price_src };
    });
    return { ...raw, rows };
  }, [raw, bakedPrice, live]);

  const tabs: [Sub, string][] = [["rankings", "🏆 Rankings"], ["screener", "🔍 Screener"], ["detail", "🔬 Stream Detail"]];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">Project Prolepsis (12-Month ML Ranking) <AsOf date={data?.effective_date} /></h2>
        <p className="text-xs text-mute">
          Project Prolepsis — MLPred v7.2 ensemble, {data?.n ?? "~900"} US equities as of {data?.effective_date ?? "latest"}.
          The 12-month score is a <span className="text-ink-2">percentile ranking</span> of relative attractiveness across the
          universe — <span className="text-ink-2">not an expected return or price target</span>. The ensemble's raw return outputs
          are mechanically conservative (regression toward the mean compresses them to a fraction of what real annual winners do),
          so magnitudes carry no information; the cross-sectional ranking is the validated output and is what the Pronoia sleeve
          trades. {data?.streams_present?.length ?? 0} streams active
          ({(data?.streams_present ?? []).filter((s) => s !== "n_streams").join(", ") || "loading"}). P(beat) is the separate
          binary classifier's probability of outperforming over 12 months (c78q posterior). The 1-month and 3-month horizons are
          excluded — neither validated as signal once training-label leakage was fenced out (2026-08-10).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">{tabs.map(([k, l]) => <Pill key={k} active={sub === k} onClick={() => setSub(k)}>{l}</Pill>)}</div>

      {!data ? (err ? (
        <Unavailable what="ML ranking data" detail="mlpred.json is produced by the predict_returns engine and baked during deploy. Unavailable in a preview without it." />
      ) : <Spinner label="Loading rankings…" />) : (
        <>
          {sub === "rankings" && <RankingsBlock data={data} />}
          {sub === "screener" && <ScreenerBlock data={data} />}
          {sub === "detail" && <DetailBlock data={data} />}
        </>
      )}
    </div>
  );
}

// ── Rankings: top/bottom of the 12-month percentile ranking ─────────────────
function RankingsBlock({ data }: { data: MLPred }) {
  const [n, setN] = useState(25);

  const ranked = useMemo(() => {
    const valid = data.rows.filter((r) => r.pred_12m_rank != null);
    return [...valid].sort((a, b) => (b.pred_12m_rank! - a.pred_12m_rank!));
  }, [data]);

  const top = ranked.slice(0, n);
  const bottom = ranked.slice(-n).reverse();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-mute">Show:</span>
        {[10, 25, 50].map((v) => <Pill key={v} active={n === v} onClick={() => setN(v)}>{v}</Pill>)}
      </div>

      <Card title={`Top ${n} — 12-Month ML Ranking`}
            sub={`Highest-ranked names as of ${data.effective_date}. ${RANKING_EXPLAINER}`}>
        <PredTable rows={top} />
      </Card>

      <Card title={`Bottom ${n} — 12-Month ML Ranking`}
            sub="Lowest-ranked names in the universe.">
        <PredTable rows={bottom} />
      </Card>
    </div>
  );
}

function PredTable({ rows }: { rows: MLRow[] }) {
  const { byTicker, goToDetail } = useStore();
  if (!rows.length) return <div className="text-sm text-mute">No rows.</div>;
  return (
    <div className="overflow-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead><tr>{["#", "Ticker", "Sector", "Price", "ML Percentile (12mo)", "P(beat)", "RSI14"].map((h) =>
          <th key={h} className="bg-head px-3 py-2 text-left text-xs uppercase text-mute" title={h === "ML Percentile (12mo)" ? RANKING_EXPLAINER : undefined}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.ticker} className="border-t border-line-faint">
              <td className="px-3 py-1.5 text-mute">{i + 1}</td>
              <td className="px-3 py-1.5">
                <button onClick={() => goToDetail(r.ticker)} className="text-left" title={`Open ${r.ticker} stock detail`}>
                  <span className="font-semibold text-link hover:underline">{r.ticker}</span><IndexBadges ticker={r.ticker} />
                  {(byTicker.get(r.ticker) as any)?.name && (
                    <span className="block max-w-[180px] truncate text-[10px] text-mute">{(byTicker.get(r.ticker) as any).name}</span>
                  )}
                </button>
              </td>
              <td className="px-3 py-1.5 text-xs text-ink-3">{r.sector ?? "—"}</td>
              <td className="px-3 py-1.5">{r.price != null ? fmtMoney(r.price) : "—"}
                {r.price_src && <span title={r.price_src === "live" ? "live intraday quote" : r.price_src === "baked" ? "baked daily price" : "as-of prediction date"} className="ml-1 text-[9px] uppercase" style={{ color: r.price_src === "live" ? SEM.pos : r.price_src === "baked" ? SEM.warnHot : INK.mute }}>{r.price_src === "live" ? "live" : r.price_src === "baked" ? "bkd" : "asof"}</span>}</td>
              <td className="px-3 py-1.5"><PercentileCell rank={r.pred_12m_rank} /></td>
              <td className="px-3 py-1.5 font-semibold" style={{ color: (r.c78q_post ?? 0) >= 0.6 ? SEM.pos : (r.c78q_post ?? 0) >= 0.4 ? SEM.warn : INK.ink3 }}>{r.c78q_post != null ? `${(r.c78q_post * 100).toFixed(0)}%` : "—"}</td>
              <td className="px-3 py-1.5 text-ink-3">{r.rsi14 != null ? r.rsi14.toFixed(0) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Screener: filter by sector + minimum percentile ─────────────────────────
function ScreenerBlock({ data }: { data: MLPred }) {
  const [sector, setSector] = useState("All");
  const [minPct, setMinPct] = useState(50);

  const filtered = useMemo(() => {
    return data.rows
      .filter((r) => r.pred_12m_rank != null)
      .filter((r) => sector === "All" || r.sector === sector)
      .filter((r) => (r.pred_12m_rank! * 100) >= minPct)
      .sort((a, b) => b.pred_12m_rank! - a.pred_12m_rank!);
  }, [data, sector, minPct]);

  return (
    <div className="space-y-4">
      <Card title="Ranking Screener" sub={`Filter the universe by sector and minimum 12-month ML percentile. ${RANKING_EXPLAINER}`}>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[10px] uppercase text-mute">Sector</label>
            <select value={sector} onChange={(e) => setSector(e.target.value)}
                    className="rounded border border-line bg-head px-2 py-1 text-sm text-ink-2">
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-mute">Min Percentile: {minPct}</label>
            <input type="range" min={0} max={99} step={1} value={minPct}
                   onChange={(e) => setMinPct(Number(e.target.value))} className="w-40" />
          </div>
          <Metric label="Matches" value={filtered.length} />
        </div>
      </Card>

      <Card title={`${filtered.length} Matches`} sub={`${sector} · 12-month ML percentile ≥ ${minPct}`}>
        <PredTable rows={filtered.slice(0, 100)} />
        {filtered.length > 100 && <div className="mt-2 text-[11px] text-mute">Showing top 100 of {filtered.length}.</div>}
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
      stream: sid, signal: s.sig, p12m: s.p12m,
    })).sort((a, b) => b.p12m - a.p12m);
  }, [row]);

  return (
    <div className="space-y-4">
      <Card title="Per-Stream Breakdown"
            sub="Each active stream's z-scored signal and its isotonic-calibrated 12-month output. Stream outputs are model-internal diagnostics (return-space units, mechanically compressed) — only the cross-sectional ranking they produce is meaningful.">
        <div className="mb-3">
          <label className="block text-[10px] uppercase text-mute">Ticker</label>
          <input list="mlpred-tickers" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
                 className="rounded border border-line bg-head px-2 py-1 text-sm text-ink-2" placeholder="e.g. AAPL" />
          <datalist id="mlpred-tickers">{data.rows.map((r) => <option key={r.ticker} value={r.ticker} />)}</datalist>
        </div>

        {!row ? <div className="text-sm text-mute">Ticker not in universe.</div> : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <Metric label="Price" value={row.price != null ? fmtMoney(row.price) : "—"} />
              <Metric label="ML Percentile (12mo)" value={<PercentileCell rank={row.pred_12m_rank} />} hint="relative ranking, not expected return" />
              <Metric label="P(beat, 12m)" value={row.c78q_post != null ? `${(row.c78q_post * 100).toFixed(1)}%` : "—"} hint={row.c78q_rank != null ? `rank ${row.c78q_rank}` : undefined} />
              <Metric label="Streams active" value={row.n_active} />
              <Metric label="RSI14" value={row.rsi14 != null ? row.rsi14.toFixed(0) : "—"} />
              <Metric label="RSI2" value={row.rsi2 != null ? row.rsi2.toFixed(0) : "—"} />
            </div>

            <div className="overflow-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead><tr>{["Stream", "Signal (z)", "Stream 12M (model units)"].map((h) =>
                  <th key={h} className="bg-head px-3 py-2 text-left text-xs uppercase text-mute">{h}</th>)}</tr></thead>
                <tbody>
                  {streamRows.map((s) => (
                    <tr key={s.stream} className="border-t border-line-faint">
                      <td className="px-3 py-1.5 font-semibold text-link">{s.stream}</td>
                      <td className="px-3 py-1.5" style={{ color: s.signal >= 0 ? SEM.pos : SEM.neg }}>{s.signal.toFixed(3)}</td>
                      <td className="px-3 py-1.5" style={{ color: s.p12m >= 0 ? SEM.pos : SEM.neg }}>{fmtPct(s.p12m * 100, 1, true)}</td>
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
