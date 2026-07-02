import { useEffect, useMemo, useRef, useState } from "react";
import { Treemap, ResponsiveContainer } from "recharts";
import { Card, Spinner } from "../components/ui";

const BASE = `${import.meta.env.BASE_URL}data`;

// live = broker-confirmed positions; paper = signal-derived research book (2026-07-01 directive:
// a paper book must always be visibly labeled wherever holdings are shown).
type BookType = "live" | "paper";
type StatusMap = Record<string, { book_type?: BookType; status?: string; as_of?: string }>;
function bookTypeOf(slug: string, statusMap: StatusMap | undefined, jsonBookType?: unknown): BookType {
  const s = statusMap?.[slug]?.book_type;
  if (s === "live" || s === "paper") return s;
  if (jsonBookType === "live" || jsonBookType === "paper") return jsonBookType;
  return "paper";
}

// ───────────────────────── Holdings TreeMap ─────────────────────────
type Hold = { ticker: string; name?: string | null; daily: number | null; rebalance: number | null; alltime: number | null };
type PerfStrat = { slug: string; label: string; color: string; entry?: string; book_type?: BookType; holdings: Hold[] };
type Perf = { generated_at: string; as_of: string; strategies: PerfStrat[] };
type Period = "daily" | "rebalance" | "alltime";

// period-aware colour: small moves still need to read, so caps are tight + the alpha floor is high
const CAP: Record<Period, number> = { daily: 3, rebalance: 7, alltime: 80 };
function gainColor(g: number | null, period: Period): string {
  if (g == null) return "#33404F";
  let a: number;
  if (period === "alltime") a = Math.min(1, Math.log10(1 + Math.abs(g)) / Math.log10(1 + CAP.alltime));
  else a = Math.min(1, Math.abs(g) / CAP[period]);
  a = 0.5 + 0.45 * a; // bright floor so a ±1% move is still clearly green/red
  return g >= 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`;
}
const fmtGain = (g: number | null) => (g == null ? "—" : `${g >= 0 ? "+" : ""}${Math.abs(g) >= 1000 ? g.toLocaleString(undefined, { maximumFractionDigits: 0 }) : g}%`);

function TreeCell(props: any) {
  const { x, y, width, height, depth, name, fill, stratColor, label } = props;
  if (depth === 1) {
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1.5} />
        {width > 46 && height > 14 && (
          <>
            <rect x={x + 3} y={y + 2.5} width={(name?.length ?? 4) * 6.2 + 8} height={13} rx={2} fill="rgba(3,6,12,0.55)" />
            <text x={x + 7} y={y + 12.5} fontSize={9.5} fontWeight={800} fill={stratColor ?? "#C7CEDA"}>{name}</text>
          </>
        )}
      </g>
    );
  }
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
      {width > 36 && height > 24 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 1} textAnchor="middle" fontSize={Math.min(12, width / 4)} fontWeight={800} fill="#fff" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.5)", strokeWidth: 2.4 } as any}>{name}</text>
          <text x={x + width / 2} y={y + height / 2 + 12} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.5)", strokeWidth: 2.4 } as any}>{label}</text>
        </>
      )}
    </g>
  );
}

function HoldingsTreemap({ statusMap }: { statusMap?: StatusMap }) {
  const [perf, setPerf] = useState<Perf | null | "err">(null);
  const [period, setPeriod] = useState<Period>("rebalance");
  useEffect(() => { fetch(`${BASE}/strategies_holdings_perf.json`).then((r) => (r.ok ? r.json() : null)).then((d) => setPerf(d ?? "err")).catch(() => setPerf("err")); }, []);
  const data = useMemo(() => {
    if (!perf || perf === "err") return [];
    return perf.strategies.map((s) => {
      const bt = bookTypeOf(s.slug, statusMap, s.book_type);
      return {
        name: bt === "paper" ? `${s.label} · PAPER` : `${s.label} · LIVE`, stratColor: s.color,
        children: s.holdings.map((h) => ({ name: h.ticker, size: 1, fill: gainColor(h[period], period), label: fmtGain(h[period]), stratColor: s.color })),
      };
    });
  }, [perf, period, statusMap]);
  if (perf === "err") return null;
  if (!perf) return <Card title="Holdings performance map" sub=""><Spinner /></Card>;
  return (
    <Card title="🗺️ Holdings performance map" asOfDate={perf.as_of} sub={`Current book of each strategy, coloured by gain (green up / red down) — LIVE = broker-confirmed positions, PAPER = research book (never held at a broker).`}>
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
type Node = { t: string; x: number; y: number; s: string[]; c: string; w: number; cur: boolean; shared: boolean; bspx: number | null; bndx: number | null };
type Edge = { a: string; b: string; v: number };
type StratCorr = { a: string; b: string; corr: number };
type IndexRef = { id: string; label: string; color: string; median_beta: number | null };
type Corr = {
  window: string; note: string; nodes: Node[]; edges: Edge[]; avg_abs_corr: number; n_nodes: number; n_edges: number;
  indices?: IndexRef[];
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
type Sim = { t: string; x: number; y: number; vx: number; vy: number; r: number; c: string; cur: boolean; bspx: number; bndx: number };
type IdxBody = { id: string; label: string; color: string; x: number; y: number; vx: number; vy: number };

function ForceNetwork({ d }: { d: Corr }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d")!;
    const H = 560;
    let W = wrap.clientWidth || 720;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // faint starfield (normalized coords) — mirrors the landing's deep-space backdrop
    const STARS = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.2, a: Math.random() * 0.45 + 0.12 }));
    const geo = () => { const cx = W / 2, cy = H / 2; return { cx, cy, R: Math.min(W, H) / 2 - 14 }; };

    const idx = new Map<string, number>(); d.nodes.forEach((n, i) => idx.set(n.t, i));
    const R0 = Math.min(W, H) / 2 - 14;
    // ── FORMATION SEAM (Akribeia logo, not yet made) ──────────────────────────────────────────
    // Nodes START here and the force sim then disperses them into the correlation layout. Today
    // that start IS the settled MDS layout. When the logo exists, drop its outline as normalised
    // [-1,1] points into LOGO_POINTS: the cloud will assemble AS the logo, then bloom outward into
    // the correlation map for free (the springs/repulsion carry every node from start → equilibrium).
    const LOGO_POINTS = null as { x: number; y: number }[] | null;
    const start = (n: Node, i: number) => LOGO_POINTS && LOGO_POINTS.length
      ? { x: W / 2 + LOGO_POINTS[i % LOGO_POINTS.length].x * R0 * 0.7, y: H / 2 + LOGO_POINTS[i % LOGO_POINTS.length].y * R0 * 0.7 }
      : { x: W / 2 + n.x * R0 * 0.92, y: H / 2 + n.y * R0 * 0.92 };
    const sim: Sim[] = d.nodes.map((n, i) => ({
      t: n.t, ...start(n, i), vx: 0, vy: 0,
      r: 2.6 + Math.min(5.5, Math.sqrt(n.w)), c: n.c, cur: n.cur,
      bspx: n.bspx ?? 1, bndx: n.bndx ?? 1,
    }));
    const edges = d.edges.map((e) => ({ i: idx.get(e.a)!, j: idx.get(e.b)!, v: e.v }))
      .filter((e) => e.i != null && e.j != null);
    // S&P 500 + NASDAQ gravity wells — two heavy bodies the stocks gravitate toward by BETA
    // (high-beta names pulled close = systematic/"noise"; low-beta names drift to the rim = idiosyncratic).
    const idxBodies: IdxBody[] = (d.indices ?? []).map((ix, k) => ({
      id: ix.id, label: ix.label, color: ix.color,
      x: W / 2 + (k === 0 ? -0.42 : 0.42) * R0, y: H / 2 + (k === 0 ? -0.18 : 0.18) * R0, vx: 0, vy: 0,
    }));

    const resize = () => {
      W = wrap.clientWidth || 720;
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrap);

    let raf = 0, frame = 0;
    const CELL = 58;
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
            const f = 520 / d2; fx += dx * f; fy += dy * f;
          }
        }
        // beta gravity: pull toward each index well ∝ this name's beta to that index
        for (const ix of idxBodies) {
          const b = ix.id === "SPX" ? a.bspx : a.bndx;
          fx += (ix.x - a.x) * 0.0013 * b; fy += (ix.y - a.y) * 0.0013 * b;
        }
        // weak centering + ORGANIC random jitter (no coherent sine — that read as an "agricultural
        // grid"). The correlation springs couple the random walks of correlated names, so the motion
        // reads as correlated drift, not independent noise.
        fx += (W / 2 - a.x) * 0.0003 + (Math.random() - 0.5) * 0.8;
        fy += (H / 2 - a.y) * 0.0003 + (Math.random() - 0.5) * 0.8;
        a.vx = (a.vx + fx) * 0.88; a.vy = (a.vy + fy) * 0.88;
        const cap = Math.max(0.85, 1.4 - frame * 0.001);
        const sp = Math.hypot(a.vx, a.vy); if (sp > cap) { a.vx *= cap / sp; a.vy *= cap / sp; }
      }
      // springs along correlation edges (higher |corr| -> shorter rest length)
      for (const e of edges) {
        const a = sim[e.i], b = sim[e.j]; let dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1; const rest = 36 + (1 - Math.abs(e.v)) * 72;
        const f = (dist - rest) * 0.008; dx /= dist; dy /= dist;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      const { cx, cy, R } = geo();
      const SPEED = 0.55; // drift speed
      for (const a of sim) {
        a.x += a.vx * SPEED; a.y += a.vy * SPEED;
        const ddx = a.x - cx, ddy = a.y - cy, dd = Math.hypot(ddx, ddy) || 1;
        if (dd > R) { a.x = cx + (ddx / dd) * R; a.y = cy + (ddy / dd) * R; a.vx *= 0.4; a.vy *= 0.4; }
      }
      // gravity wells orbit the centre (kept opposite each other) so they read as gravitating bodies
      const ROT = 0.0005, rc = Math.cos(ROT), rs = Math.sin(ROT);
      for (const a of sim) { const dx = a.x - cx, dy = a.y - cy; a.x = cx + dx * rc - dy * rs; a.y = cy + dx * rs + dy * rc; }
      for (const A of idxBodies) { const dx = A.x - cx, dy = A.y - cy; A.x = cx + dx * rc - dy * rs; A.y = cy + dx * rs + dy * rc; }
      // ── render (deep-space palette mirroring the landing) ──
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.35);
      bg.addColorStop(0, "#0B1A30"); bg.addColorStop(0.55, "#070E1C"); bg.addColorStop(1, "#03060C");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      for (const s of STARS) { ctx.fillStyle = `rgba(200,222,255,${s.a})`; ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.2832); ctx.fill(); }
      ctx.strokeStyle = "rgba(91,168,255,0.14)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.stroke();
      // index gravity wells — large translucent glowing spheres (drawn under the stock nodes)
      for (const A of idxBodies) {
        const gw = ctx.createRadialGradient(A.x, A.y, 0, A.x, A.y, 40);
        gw.addColorStop(0, A.color + "4D"); gw.addColorStop(0.5, A.color + "22"); gw.addColorStop(1, A.color + "00");
        ctx.fillStyle = gw; ctx.beginPath(); ctx.arc(A.x, A.y, 40, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.85; ctx.lineWidth = 1.6; ctx.strokeStyle = A.color;
        ctx.beginPath(); ctx.arc(A.x, A.y, 15, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = A.color; ctx.font = "700 12px ui-sans-serif, system-ui"; ctx.textAlign = "center";
        ctx.fillText(A.label, A.x, A.y - 22);
      }
      // edges — bright only where they touch a LIVE holding (the book's real correlations);
      // history-only links stay as a faint backdrop so the structure that matters reads clearly.
      const hov = hoverRef.current;
      for (const e of edges) {
        const a = sim[e.i], b = sim[e.j], live = a.cur || b.cur;
        const al = live ? 0.2 + 0.5 * Math.abs(e.v) : 0.03 + 0.1 * Math.abs(e.v);
        ctx.lineWidth = live ? 1 : 0.5;
        ctx.strokeStyle = e.v >= 0 ? `rgba(120,180,255,${al})` : `rgba(190,130,255,${al})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      // nodes — LIVE holdings glow + white ring; inactive (held only in the backtest) are hollow,
      // dim, strategy-coloured outlines so the active book pops out of the historical universe.
      for (const a of sim) {
        if (a.cur) {
          ctx.globalAlpha = 0.22; ctx.fillStyle = a.c; ctx.beginPath(); ctx.arc(a.x, a.y, a.r * 2.8, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = 1; ctx.fillStyle = a.c; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.2832); ctx.fill();
          ctx.lineWidth = 1.4; ctx.strokeStyle = "#EAF2FF"; ctx.stroke();
        } else {
          ctx.globalAlpha = a.t === hov ? 0.95 : 0.42; ctx.lineWidth = 1.1; ctx.strokeStyle = a.c;
          ctx.beginPath(); ctx.arc(a.x, a.y, Math.max(1.8, a.r * 0.78), 0, 6.2832); ctx.stroke();
        }
        ctx.globalAlpha = 1;
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

function CorrelationNetwork({ statusMap }: { statusMap?: StatusMap }) {
  const [d, setD] = useState<Corr | null | "err">(null);
  useEffect(() => { fetch(`${BASE}/strategies_correlation.json`).then((r) => (r.ok ? r.json() : null)).then((x) => setD(x ?? "err")).catch(() => setD("err")); }, []);
  if (d === "err") return null;
  if (!d) return <Card title="Holdings correlation network" sub=""><Spinner /></Card>;
  const slugs = Object.keys(d.strategy_labels);
  return (
    <Card title="🕸️ Holdings correlation network — all backtest holdings"
      sub={`All ${d.n_nodes} names ever held across the 5 strategies. Distance encodes correlation (${d.window}); the slow orbit is decorative. Avg |corr| ${d.avg_abs_corr}.`}>
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <ForceNetwork d={d} />
        <div className="space-y-3 text-xs">
          <div className="rounded-md border border-[#1E2632] bg-[#0B1018] px-2.5 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#9CB6E0]">How to read this</div>
            <ul className="space-y-1 text-[10px] leading-relaxed text-[#9CA7BB]">
              <li><span className="text-[#C7CEDA]">Solid + ringed dots = current holdings</span> (of live OR paper books — see the legend tags); hollow dim outlines are names held only in the backtest. Colour = the strategy that held it most.</li>
              <li><span className="text-[#C7CEDA]">The two big spheres are S&amp;P 500 &amp; NASDAQ</span> — each name is pulled toward them by its <em>beta</em>. High-beta (market-driven) names hug the spheres; low-beta (idiosyncratic) names drift to the rim — systematic vs. stock-specific at a glance.</li>
              <li><span className="text-[#C7CEDA]">Closeness = correlation.</span> Two dots sit near each other when their returns move together, far apart when they don't.</li>
              <li><span className="text-[#C7CEDA]">Bright links</span> are correlations involving a current holding; faint links are history-only. Watch whether the current-book dots cluster (overlap) or spread (decoupled).</li>
              <li><span className="text-[#C7CEDA]">The drift is decoration</span> — only relative position carries meaning, not the motion.</li>
            </ul>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-[#7C879B]">Strategy (dominant)</div>
            <div className="flex flex-col gap-1">
              {slugs.map((s) => {
                const bt = bookTypeOf(s, statusMap);
                return (
                  <span key={s} className="inline-flex items-center gap-1.5 text-[#C7CEDA]">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: d.strategy_colors[s] }} />{d.strategy_labels[s]}
                    <span className={`text-[9px] font-semibold ${bt === "live" ? "text-[#00C805]" : "text-[#D8B878]"}`}>{bt === "live" ? "● LIVE" : "◌ PAPER"}</span>
                  </span>
                );
              })}
            </div>
            <div className="mt-1 text-[10px] text-[#5A6477]">White-ringed = current holding (live or paper book per the tag above). Node size = times held. Hover for ticker. Edges: top correlations, |corr| ≥ 0.45.</div>
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

export default function StrategiesViz({ statusMap }: { statusMap?: StatusMap }) {
  return <><HoldingsTreemap statusMap={statusMap} /><CorrelationNetwork statusMap={statusMap} /></>;
}
