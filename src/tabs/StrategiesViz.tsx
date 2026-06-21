import { useEffect, useMemo, useRef, useState } from "react";
import { Treemap, ResponsiveContainer } from "recharts";
import { Card, Spinner } from "../components/ui";

const BASE = `${import.meta.env.BASE_URL}data`;

// ───────────────────────── Holdings TreeMap ─────────────────────────
type Hold = { ticker: string; name?: string | null; daily: number | null; rebalance: number | null; alltime: number | null };
type PerfStrat = { slug: string; label: string; color: string; entry?: string; holdings: Hold[] };
type Perf = { generated_at: string; as_of: string; strategies: PerfStrat[] };
type Period = "daily" | "rebalance" | "alltime";

// period-aware colour: daily/rebalance linear, all-time log (gains run to +12,000%+ over the backtest)
const CAP: Record<Period, number> = { daily: 5, rebalance: 25, alltime: 5000 };
function gainColor(g: number | null, period: Period): string {
  if (g == null) return "#2A3340";
  let a: number;
  if (period === "alltime") a = Math.min(1, Math.log10(1 + Math.abs(g)) / Math.log10(1 + CAP.alltime));
  else a = Math.min(1, Math.abs(g) / CAP[period]);
  return g >= 0 ? `rgba(0,200,5,${0.15 + 0.62 * a})` : `rgba(255,87,34,${0.15 + 0.62 * a})`;
}
const fmtGain = (g: number | null) => (g == null ? "—" : `${g >= 0 ? "+" : ""}${Math.abs(g) >= 1000 ? g.toLocaleString(undefined, { maximumFractionDigits: 0 }) : g}%`);

function TreeCell(props: any) {
  const { x, y, width, height, depth, name, fill, stratColor, label } = props;
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
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#0A0D13" strokeWidth={1} />
      {width > 36 && height > 24 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 1} textAnchor="middle" fontSize={Math.min(11, width / 4)} fontWeight={700} fill="#fff">{name}</text>
          <text x={x + width / 2} y={y + height / 2 + 11} textAnchor="middle" fontSize={9} fill="#E6E9EF">{label}</text>
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
      children: s.holdings.map((h) => ({ name: h.ticker, size: 1, fill: gainColor(h[period], period), label: fmtGain(h[period]), stratColor: s.color })),
    }));
  }, [perf, period]);
  if (perf === "err") return null;
  if (!perf) return <Card title="Holdings performance map" sub=""><Spinner /></Card>;
  return (
    <Card title="🗺️ Holdings performance map" sub={`Every live position across the 5 strategies, coloured by gain (green up / red down). As-of ${perf.as_of}.`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["daily", "rebalance", "alltime"] as Period[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`rounded-md px-3 py-1.5 text-xs transition ${period === p ? "bg-[#1B2433] font-semibold text-white" : "text-[#9CA7BB] hover:bg-[#161D29]"}`}>
            {p === "daily" ? "Daily" : p === "rebalance" ? "Since rebalance" : "All-time"}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-[#5A6477]">
          {period === "daily" ? "1-day move" : period === "rebalance" ? "since the current rebalance entry" : "full-backtest price history (log-scaled colour)"}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <Treemap data={data} dataKey="size" aspectRatio={4 / 3} stroke="#0A0D13" isAnimationActive={false} content={<TreeCell />} />
      </ResponsiveContainer>
    </Card>
  );
}

// ─────────────────────── Correlation network (live force sim on canvas) ───────────────────────
type Node = { t: string; x: number; y: number; s: string[]; c: string; w: number; cur: boolean; shared: boolean };
type Edge = { a: string; b: string; v: number };
type StratCorr = { a: string; b: string; corr: number };
type Corr = {
  window: string; note: string; nodes: Node[]; edges: Edge[]; avg_abs_corr: number; n_nodes: number; n_edges: number;
  strategy_corr: StratCorr[]; strategy_avg_abs_corr: number; strategy_labels: Record<string, string>; strategy_colors: Record<string, string>;
};

function corrFill(c: number): string {
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
  );
}

// mutable per-node sim state
type Sim = { t: string; x: number; y: number; vx: number; vy: number; r: number; c: string; cur: boolean };

function ForceNetwork({ d }: { d: Corr }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d")!;
    const H = 540;
    let W = wrap.clientWidth || 720;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const idx = new Map<string, number>(); d.nodes.forEach((n, i) => idx.set(n.t, i));
    const sim: Sim[] = d.nodes.map((n) => ({
      t: n.t, x: (n.x * 0.46 + 0.5) * W, y: (n.y * 0.46 + 0.5) * H, vx: 0, vy: 0,
      r: 2.6 + Math.min(5.5, Math.sqrt(n.w)), c: n.c, cur: n.cur,
    }));
    const edges = d.edges.map((e) => ({ i: idx.get(e.a)!, j: idx.get(e.b)!, v: e.v }))
      .filter((e) => e.i != null && e.j != null);

    const resize = () => {
      W = wrap.clientWidth || 720;
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrap);

    let raf = 0, frame = 0;
    const CELL = 46;
    const step = () => {
      frame++;
      // spatial-grid repulsion (O(n))
      const grid = new Map<number, number[]>();
      const key = (cx: number, cy: number) => cx * 100000 + cy;
      for (let k = 0; k < sim.length; k++) {
        const cx = Math.floor(sim[k].x / CELL), cy = Math.floor(sim[k].y / CELL), kk = key(cx, cy);
        (grid.get(kk) ?? grid.set(kk, []).get(kk)!).push(k);
      }
      for (let k = 0; k < sim.length; k++) {
        const a = sim[k]; let fx = 0, fy = 0;
        const cx = Math.floor(a.x / CELL), cy = Math.floor(a.y / CELL);
        for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const cell = grid.get(key(gx, gy)); if (!cell) continue;
          for (const m of cell) {
            if (m === k) continue;
            const b = sim[m]; let dx = a.x - b.x, dy = a.y - b.y; let d2 = dx * dx + dy * dy;
            if (d2 < 1) { d2 = 1; dx = (k - m) * 0.5; } if (d2 > CELL * CELL * 4) continue;
            const f = 240 / d2; fx += dx * f; fy += dy * f;
          }
        }
        // centering + gentle perpetual shimmer (keeps it "alive")
        fx += (W / 2 - a.x) * 0.0016 + Math.sin(frame * 0.03 + k) * 0.06;
        fy += (H / 2 - a.y) * 0.0016 + Math.cos(frame * 0.03 + k) * 0.06;
        a.vx = (a.vx + fx) * 0.86; a.vy = (a.vy + fy) * 0.86;
      }
      // springs along correlation edges (higher |corr| -> shorter rest length)
      for (const e of edges) {
        const a = sim[e.i], b = sim[e.j]; let dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1; const rest = 26 + (1 - Math.abs(e.v)) * 80;
        const f = (dist - rest) * 0.012; dx /= dist; dy /= dist;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      for (const a of sim) {
        a.x = Math.max(8, Math.min(W - 8, a.x + a.vx)); a.y = Math.max(8, Math.min(H - 8, a.y + a.vy));
      }
      // ── render ──
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#070A0F"; ctx.fillRect(0, 0, W, H);
      ctx.lineWidth = 0.7;
      for (const e of edges) {
        const a = sim[e.i], b = sim[e.j], al = 0.05 + 0.32 * Math.abs(e.v);
        ctx.strokeStyle = e.v >= 0 ? `rgba(90,150,220,${al})` : `rgba(170,90,240,${al})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      const hov = hoverRef.current;
      for (const a of sim) {
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.2832);
        ctx.fillStyle = a.c; ctx.globalAlpha = a.cur ? 1 : 0.78; ctx.fill(); ctx.globalAlpha = 1;
        if (a.cur) { ctx.lineWidth = 1.2; ctx.strokeStyle = "#fff"; ctx.stroke(); }
      }
      // labels: current holdings always + hovered
      ctx.font = "600 9px ui-sans-serif, system-ui"; ctx.textAlign = "center";
      for (const a of sim) {
        if (a.cur || a.t === hov) {
          ctx.fillStyle = a.t === hov ? "#fff" : "#C7CEDA";
          ctx.fillText(a.t, a.x, a.y - a.r - 3);
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const onMove = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect(); const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      let best: string | null = null, bd = 144;
      for (const a of sim) { const dx = a.x - mx, dy = a.y - my, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = a.t; } }
      hoverRef.current = best;
    };
    canvas.addEventListener("mousemove", onMove);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); canvas.removeEventListener("mousemove", onMove); };
  }, [d]);

  return <div ref={wrapRef} className="overflow-hidden rounded-lg border border-[#1A2130]"><canvas ref={canvasRef} /></div>;
}

function CorrelationNetwork() {
  const [d, setD] = useState<Corr | null | "err">(null);
  useEffect(() => { fetch(`${BASE}/strategies_correlation.json`).then((r) => (r.ok ? r.json() : null)).then((x) => setD(x ?? "err")).catch(() => setD("err")); }, []);
  if (d === "err") return null;
  if (!d) return <Card title="Holdings correlation network" sub=""><Spinner /></Card>;
  const slugs = Object.keys(d.strategy_labels);
  return (
    <Card title="🕸️ Holdings correlation network — all backtest holdings"
      sub={`All ${d.n_nodes} names ever held across the 5 strategies, as a live force graph: correlated names (${d.window}) pull together, the strategies settle into separate clusters — decoupling by design. Avg |corr| ${d.avg_abs_corr}.`}>
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <ForceNetwork d={d} />
        <div className="space-y-3 text-xs">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-[#7C879B]">Strategy (dominant)</div>
            <div className="flex flex-col gap-1">
              {slugs.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-[#C7CEDA]">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: d.strategy_colors[s] }} />{d.strategy_labels[s]}
                </span>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-[#5A6477]">White-ringed = current holding. Node size = times held. Hover for ticker. Edges: top correlations, |corr| ≥ 0.45.</div>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-[#7C879B]">Strategy-level corr · full backtest</div>
            <StrategyCorrMatrix d={d} />
            <div className="mt-1 text-[10px] leading-relaxed text-[#5A6477]">
              Avg |corr| <span className="text-[#9CA7BB]">{d.strategy_avg_abs_corr}</span> on monthly returns. All long-only equity (a ~0.3–0.5 beta floor is unavoidable); the distinct bets (Katalepsis / Aristeia / Pronoia) sit lowest, the quant-factor sleeves co-move more.
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
