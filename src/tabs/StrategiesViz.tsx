import { useEffect, useMemo, useState } from "react";
import { Treemap, ResponsiveContainer } from "recharts";
import { Card, Spinner } from "../components/ui";

const BASE = `${import.meta.env.BASE_URL}data`;

// ───────────────────────── Holdings TreeMap ─────────────────────────
type Hold = { ticker: string; name?: string | null; daily: number | null; rebalance: number | null; alltime: number | null };
type PerfStrat = { slug: string; label: string; color: string; entry?: string; holdings: Hold[] };
type Perf = { generated_at: string; as_of: string; strategies: PerfStrat[] };
type Period = "daily" | "rebalance" | "alltime";
const PERIOD_LABEL: Record<Period, string> = { daily: "Daily", rebalance: "Since rebalance", alltime: "All-time" };

function gainColor(g: number | null): string {
  if (g == null) return "#2A3340";
  const c = Math.max(-15, Math.min(15, g)), a = Math.abs(c) / 15;
  return c >= 0 ? `rgba(0,200,5,${0.18 + 0.62 * a})` : `rgba(255,87,34,${0.18 + 0.62 * a})`;
}

function TreeCell(props: any) {
  const { x, y, width, height, depth, name, gain, stratColor } = props;
  if (depth === 1) {
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill="none" stroke="#0A0D13" strokeWidth={3} />
        {width > 46 && height > 14 && <text x={x + 5} y={y + 12} fontSize={9} fontWeight={700} fill={stratColor ?? "#7C879B"}>{name}</text>}
      </g>
    );
  }
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={gainColor(gain)} stroke="#0A0D13" strokeWidth={1} />
      {width > 34 && height > 24 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 1} textAnchor="middle" fontSize={Math.min(11, width / 4)} fontWeight={700} fill="#fff">{name}</text>
          <text x={x + width / 2} y={y + height / 2 + 11} textAnchor="middle" fontSize={9} fill="#E6E9EF">{gain == null ? "—" : `${gain >= 0 ? "+" : ""}${gain}%`}</text>
        </>
      )}
    </g>
  );
}

function HoldingsTreemap() {
  const [perf, setPerf] = useState<Perf | null | "err">(null);
  const [period, setPeriod] = useState<Period>("rebalance");
  useEffect(() => { fetch(`${BASE}/strategies_holdings_perf.json`).then((r) => (r.ok ? r.json() : null)).then((d) => setPerf(d ?? "err")).catch(() => setPerf("err")); }, []);

  const data = useMemo(() => {
    if (!perf || perf === "err") return [];
    return perf.strategies.map((s) => ({
      name: s.label, stratColor: s.color,
      children: s.holdings.map((h) => ({ name: h.ticker, size: 1, gain: h[period], stratColor: s.color })),
    }));
  }, [perf, period]);

  if (perf === "err") return null;
  if (!perf) return <Card title="Holdings performance" sub=""><Spinner /></Card>;

  return (
    <Card title="🗺️ Holdings performance map" sub={`Every live position across the 5 strategies, sized equally, coloured by ${PERIOD_LABEL[period].toLowerCase()} gain (green up / red down). As-of ${perf.as_of}.`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["daily", "rebalance", "alltime"] as Period[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`rounded-md px-3 py-1.5 text-xs transition ${period === p ? "bg-[#1B2433] font-semibold text-white" : "text-[#9CA7BB] hover:bg-[#161D29]"}`}>
            {p === "daily" ? "Daily" : p === "rebalance" ? "Since rebalance" : "All-time"}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-[#5A6477]">
          {period === "daily" ? "1-day move" : period === "rebalance" ? "since the current rebalance entry" : "since the name was first held by the strategy"}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <Treemap data={data} dataKey="size" aspectRatio={4 / 3} stroke="#0A0D13" isAnimationActive={false} content={<TreeCell />} />
      </ResponsiveContainer>
    </Card>
  );
}

// ─────────────────────── Correlation network ───────────────────────
type Node = { ticker: string; name?: string | null; x: number; y: number; strategies: string[]; color: string; shared: boolean };
type Edge = { a: string; b: string; corr: number };
type StratCorr = { a: string; b: string; corr: number };
type Corr = {
  generated_at: string; window: string; note: string; nodes: Node[]; edges: Edge[]; avg_abs_corr: number;
  strategy_corr: StratCorr[]; strategy_avg_abs_corr: number; strategy_labels: Record<string, string>; strategy_colors: Record<string, string>;
};

function corrFill(c: number): string {
  // low correlation = good (decoupled) = cool/dim; high = warm
  const a = Math.max(0, Math.min(1, Math.abs(c)));
  return c >= 0 ? `rgba(91,168,255,${0.12 + 0.7 * a})` : `rgba(168,85,247,${0.12 + 0.7 * a})`;
}

function StrategyCorrMatrix({ d }: { d: Corr }) {
  const slugs = Object.keys(d.strategy_labels);
  const m = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    slugs.forEach((a) => { map[a] = {}; slugs.forEach((b) => (map[a][b] = a === b ? 1 : NaN)); });
    d.strategy_corr.forEach((p) => {
      const ai = slugs.find((s) => d.strategy_labels[s] === p.a), bi = slugs.find((s) => d.strategy_labels[s] === p.b);
      if (ai && bi) { map[ai][bi] = p.corr; map[bi][ai] = p.corr; }
    });
    return map;
  }, [d]);
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-center text-[10px]">
        <thead><tr><th className="p-1"></th>{slugs.map((s) => <th key={s} className="p-1 font-medium" style={{ color: d.strategy_colors[s] }}>{d.strategy_labels[s].slice(0, 4)}</th>)}</tr></thead>
        <tbody>
          {slugs.map((a) => (
            <tr key={a}>
              <td className="p-1 text-right font-medium" style={{ color: d.strategy_colors[a] }}>{d.strategy_labels[a].slice(0, 4)}</td>
              {slugs.map((b) => {
                const v = m[a][b];
                return <td key={b} className="p-1 font-mono" style={{ background: a === b ? "#11161F" : corrFill(v), color: a === b ? "#5A6477" : "#E6E9EF" }}>{a === b ? "—" : isNaN(v) ? "·" : v.toFixed(2)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CorrelationNetwork() {
  const [d, setD] = useState<Corr | null | "err">(null);
  useEffect(() => { fetch(`${BASE}/strategies_correlation.json`).then((r) => (r.ok ? r.json() : null)).then((x) => setD(x ?? "err")).catch(() => setD("err")); }, []);
  if (d === "err") return null;
  if (!d) return <Card title="Holdings correlation network" sub=""><Spinner /></Card>;

  const W = 620, H = 430, pad = 46;
  const sx = (x: number) => pad + ((x + 1) / 2) * (W - 2 * pad);
  const sy = (y: number) => pad + ((y + 1) / 2) * (H - 2 * pad);
  const pos: Record<string, [number, number]> = Object.fromEntries(d.nodes.map((n) => [n.ticker, [sx(n.x), sy(n.y)]]));
  const slugs = Object.keys(d.strategy_labels);

  return (
    <Card title="🕸️ Holdings correlation network"
      sub={`Every live holding as a node, coloured by strategy and pulled together by return correlation (${d.window}). Tightly-correlated names sit close; the strategies form separate clusters — that decoupling is by design. Avg |corr| ${d.avg_abs_corr}.`}>
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="overflow-hidden rounded-lg border border-[#1A2130] bg-[#0A0D13]">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {d.edges.map((e, i) => {
              const [x1, y1] = pos[e.a] ?? [0, 0], [x2, y2] = pos[e.b] ?? [0, 0];
              const a = Math.min(1, Math.abs(e.corr));
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={e.corr >= 0 ? "#3A5980" : "#5B3A80"} strokeWidth={0.6 + 2 * a} strokeOpacity={0.15 + 0.5 * a} />;
            })}
            {d.nodes.map((n) => {
              const [x, y] = pos[n.ticker];
              return (
                <g key={n.ticker}>
                  <circle cx={x} cy={y} r={n.shared ? 9 : 7} fill={n.color} stroke={n.shared ? "#fff" : "#0A0D13"} strokeWidth={n.shared ? 1.6 : 1} />
                  <text x={x} y={y - 11} textAnchor="middle" fontSize={9} fontWeight={600} fill="#C7CEDA">{n.ticker}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="space-y-3 text-xs">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-[#7C879B]">Strategy</div>
            <div className="flex flex-wrap gap-2">
              {slugs.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 text-[#C7CEDA]">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: d.strategy_colors[s] }} />{d.strategy_labels[s]}
                </span>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-[#5A6477]">⊕ white-ringed = held by 2+ strategies. Edges drawn for |corr| ≥ 0.35.</div>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-[#7C879B]">Strategy-level correlation · full backtest</div>
            <StrategyCorrMatrix d={d} />
            <div className="mt-1 text-[10px] leading-relaxed text-[#5A6477]">
              Avg |corr| <span className="text-[#9CA7BB]">{d.strategy_avg_abs_corr}</span> across monthly returns. All are long-only equity (a ~0.3–0.5 market-beta floor is unavoidable); the deliberately-distinct bets (Katalepsis / Aristeia / Pronoia) sit at the low end, the two quant-factor sleeves co-move more.
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function StrategiesViz() {
  return <><HoldingsTreemap /><CorrelationNetwork /></>;
}
