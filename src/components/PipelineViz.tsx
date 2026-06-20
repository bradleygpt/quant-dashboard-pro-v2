import { useEffect, useMemo, useRef, useState } from "react";

// ── palette (matches the c78q alchemist reference) ───────────────────────────
const C = { ground: "#070A0C", panel: "#0D1116", panel2: "#0F141A", line: "#1A222A",
  text: "#E9E7E1", dim: "#7E8A95", faint: "#3C4651",
  green: "#3FB984", amber: "#D4A24E", red: "#C25A5A", blue: "#5B8BC4", violet: "#9B7FC9" };
const DISP = "'Space Grotesk', sans-serif"; const MONO = "'IBM Plex Mono', monospace";

export interface VizPeriod { label: string; growth: number; tickers: string[]; ret: number }
export interface VizStream { id: string; col: string }
export interface PipelineVizProps {
  title: string;
  periods: VizPeriod[];          // REAL, period-aggregated (yearly) — growth = cumulative multiple at period end
  basketSize: number; weightPct: number;
  kpis: { cagr: number; sharpe: number; maxdd: number };
  edge?: { full: { val: number; t: number; sig: boolean }; recent: { val: number; t: number; sig: boolean } };
  candidate?: boolean;
  footer: string;
  streams: VizStream[];
}

// Yearly-aggregate a (date, growth-multiple) series + (date, tickers) baskets into VizPeriod[].
// growth = cumulative multiple at year end; ret = YoY; tickers = basket held as-of year end.
export function buildPeriods(points: { date: string; growth: number }[], baskets: { date: string; tickers: string[] }[]): VizPeriod[] {
  if (!points.length) return [];
  const byYear = new Map<string, { date: string; growth: number }>();
  for (const p of points) { const y = p.date.slice(0, 4); byYear.set(y, p); } // last point of each year wins
  const years = [...byYear.keys()].sort();
  const bk = [...baskets].sort((a, b) => a.date.localeCompare(b.date));
  const out: VizPeriod[] = []; let prev = 1;
  for (const y of years) {
    const g = byYear.get(y)!.growth;
    const end = `${y}-12-31`;
    let tickers: string[] = [];
    for (const b of bk) { if (b.date <= end) tickers = b.tickers; else break; }
    out.push({ label: y, growth: g, tickers, ret: prev > 0 ? g / prev - 1 : 0 });
    prev = g;
  }
  return out;
}

export default function PipelineViz(props: PipelineVizProps) {
  const { title, periods, basketSize, weightPct, kpis, edge, candidate, footer, streams } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [round, setRound] = useState(7160);
  const [growthLabel, setGrowthLabel] = useState("$1.0");
  const [catOpen, setCatOpen] = useState(false);
  const [catIdx, setCatIdx] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const BASE = import.meta.env.BASE_URL;
  const CATS = useMemo(() => [`${BASE}cat1.png`, `${BASE}cat2.png`], [BASE]);

  // track container width for KPI-strip reflow on mobile
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 640));
    ro.observe(el); setNarrow(el.clientWidth < 640);
    return () => ro.disconnect();
  }, []);

  // ensure the display fonts are available (idempotent)
  useEffect(() => {
    const id = "pipeviz-fonts";
    if (!document.getElementById(id)) {
      const l = document.createElement("link"); l.id = id; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
      document.head.appendChild(l);
    }
  }, []);

  // cat easter-egg flip
  useEffect(() => {
    if (!catOpen) return;
    const t = setInterval(() => setCatIdx((i) => (i + 1) % CATS.length), 220);
    return () => clearInterval(t);
  }, [catOpen, CATS.length]);

  // ── the canvas pipeline (single master-clock rAF loop, crucible vessel) ──────
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap || periods.length === 0) return;
    let raf = 0, alive = true;
    const TICKERS = (i: number) => periods[i]?.tickers ?? [];
    const RET = periods.map((p) => p.ret);
    let TERM = 1; periods.forEach((p) => { TERM = Math.max(TERM, p.growth); });
    const N = Math.max(1, basketSize);

    type Pipe = ReturnType<typeof init> | null;
    let P: Pipe = null;

    function init() {
      const w = canvas!.clientWidth; if (!w || w < 10) return null;
      const h = Math.round(Math.min(520, Math.max(360, w * 0.62)));
      const r = window.devicePixelRatio || 1;
      canvas!.width = w * r; canvas!.height = h * r; canvas!.style.height = h + "px";
      const c = canvas!.getContext("2d"); if (!c) return null;
      c.setTransform(r, 0, 0, r, 0, 0);
      const streamTop = 24, streamY = 58, vesselY = h * 0.30, vesselCx = w / 2;
      const basketY = h * 0.52, curveTop = h * 0.60, curveBot = h - 26, curveX0 = w * 0.12, curveX1 = w * 0.88;
      const tot = streams.length;
      const ST = streams.map((s, i) => ({ id: s.id, col: s.col, x: w * 0.10 + (tot > 1 ? i / (tot - 1) : 0.5) * (w * 0.80), ph: (i * 1.7) % 6.28 }));
      let drops: any[] = [], monthN = 0, curve: { x: number; y: number }[] = [], growth = 1, fliers: any[] = [], swirl = 0, frame = 0;
      let fTarget = { x: 0, y: 0 };
      const curveXAt = (mn: number) => curveX0 + (mn / periods.length) * (curveX1 - curveX0);
      const curveYAt = (g: number) => curveBot - Math.min(Math.log(Math.max(g, 1)) / Math.log(Math.max(TERM, 1.0001)), 1) * (curveBot - curveTop);
      function startMonth() {
        const ret = RET[Math.min(monthN, RET.length - 1)] ?? 0; growth *= (1 + ret);
        const nx = curveXAt(monthN + 1), ny = curveYAt(growth); const tks = TICKERS(monthN);
        fliers = [];
        for (let i = 0; i < N; i++) {
          fliers.push({ tk: tks[i] ?? "", x: vesselCx + (i - N / 2) * 9, y: basketY, tx: nx, ty: ny, t: 0, speed: 0.012 + (i % 4) * 0.002, ret, state: "fly", candleT: 0 });
        }
        fTarget = { x: nx, y: ny };
      }
      curve.push({ x: curveXAt(0), y: curveYAt(1) }); startMonth();
      // VESSEL: swap point for Akribeia logo — replace this single function with the brand
      // logo render (streams pour into it, basket precipitates from its base; nothing else changes).
      function renderVessel(c: CanvasRenderingContext2D, vx: number, vy: number) {
        const rw = Math.min(52, w * 0.12);
        c.strokeStyle = "rgba(155,127,201,0.55)"; c.lineWidth = 1.6;
        c.beginPath(); c.arc(vx, vy, rw, 0.15 * Math.PI, 0.85 * Math.PI, false); c.stroke();
        c.beginPath(); c.moveTo(vx - rw + 6, vy + 8); c.lineTo(vx - rw - 6, vy + 8); c.moveTo(vx + rw - 6, vy + 8); c.lineTo(vx + rw + 6, vy + 8); c.stroke();
        const gl = c.createRadialGradient(vx, vy + 10, 2, vx, vy + 10, rw * 0.9);
        gl.addColorStop(0, "rgba(155,127,201,0.5)"); gl.addColorStop(0.6, "rgba(63,185,132,0.25)"); gl.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = gl; c.beginPath(); c.arc(vx, vy + 10, rw * 0.85, 0, 7); c.fill();
        for (let k = 0; k < 7; k++) { const ph = swirl * 1.4 + k * 0.9; const bx = vx + Math.sin(ph) * rw * 0.5;
          const by = vy + 18 - ((swirl * 20 + k * 30) % 48); const al = Math.max(0, 1 - ((swirl * 20 + k * 30) % 48) / 48);
          c.fillStyle = `rgba(63,185,132,${0.5 * al})`; c.beginPath(); c.arc(bx, by, 2 + al * 2, 0, 7); c.fill(); }
        swirl += 0.05;
      }
      function pourParticles() {
        ST.forEach((st) => { if (Math.random() < 0.4) drops.push({ col: st.col, t: 0, x0: st.x, y0: streamY, x1: vesselCx + (Math.random() - 0.5) * 30, y1: vesselY - 6 }); });
      }
      function tick() {
        frame++; c!.clearRect(0, 0, w, h);
        // streams
        ST.forEach((st) => {
          const yy = streamY + Math.sin(frame * 0.05 + st.ph) * 2;
          c!.strokeStyle = st.col; c!.globalAlpha = 0.3; c!.beginPath(); c!.moveTo(st.x, streamTop); c!.lineTo(st.x, streamY); c!.stroke(); c!.globalAlpha = 1;
          c!.fillStyle = st.col; c!.beginPath(); c!.arc(st.x, yy, 3, 0, 7); c!.fill();
          c!.fillStyle = C.dim; c!.font = `7px ${MONO}`; c!.textAlign = "center"; c!.fillText(st.id, st.x, streamTop - 3);
        });
        if (frame % 3 === 0) pourParticles();
        drops.forEach((p) => (p.t += 0.025)); drops = drops.filter((p) => p.t < 1);
        drops.forEach((p) => { const e = p.t, x = p.x0 + (p.x1 - p.x0) * e, y = p.y0 + (p.y1 - p.y0) * e;
          c!.fillStyle = p.col; c!.globalAlpha = 0.55 * (1 - e) + 0.2; c!.beginPath(); c!.arc(x, y, 1.7, 0, 7); c!.fill(); c!.globalAlpha = 1; });
        renderVessel(c!, vesselCx, vesselY);
        // basket label
        c!.fillStyle = C.amber; c!.font = `8.5px ${MONO}`; c!.textAlign = "center";
        c!.fillText(`▼ BASKET · ${N} × ${weightPct.toFixed(1)}% · ${periods[Math.min(monthN, periods.length - 1)]?.label ?? ""}`, vesselCx, basketY + 2);
        // $1 baseline + curve
        c!.strokeStyle = C.line; c!.setLineDash([2, 4]); c!.beginPath(); c!.moveTo(curveX0, curveYAt(1)); c!.lineTo(curveX1, curveYAt(1)); c!.stroke(); c!.setLineDash([]);
        c!.fillStyle = C.dim; c!.font = `8px ${MONO}`; c!.textAlign = "start"; c!.fillText("$1", curveX0 - 2, curveYAt(1) - 4);
        c!.strokeStyle = C.green; c!.lineWidth = 2; c!.beginPath();
        curve.forEach((pt, i) => (i === 0 ? c!.moveTo(pt.x, pt.y) : c!.lineTo(pt.x, pt.y))); c!.stroke();
        if (curve.length) { const tp = curve[curve.length - 1]; c!.fillStyle = C.green; c!.beginPath(); c!.arc(tp.x, tp.y, 3, 0, 7); c!.fill(); }
        // fliers basket -> curve, then candle
        fliers.forEach((fl: any) => {
          if (fl.state === "fly") {
            fl.t = Math.min(fl.t + fl.speed, 1); const e = fl.t < 0.5 ? 2 * fl.t * fl.t : 1 - Math.pow(-2 * fl.t + 2, 2) / 2;
            fl.cx = fl.x + (fl.tx - fl.x) * e; fl.cy = fl.y + (fl.ty - fl.y) * e;
            c!.fillStyle = C.amber; c!.beginPath(); c!.arc(fl.cx, fl.cy, 3, 0, 7); c!.fill();
            if (fl.tk) { c!.fillStyle = C.amber; c!.font = `7.5px ${MONO}`; c!.textAlign = "center"; c!.fillText(fl.tk, fl.cx, fl.cy - 7); }
            if (fl.t >= 1) { fl.state = "candle"; fl.candleT = 0; }
          } else if (fl.state === "candle") {
            fl.candleT += 0.06; const up = fl.ret >= 0, col = up ? C.green : C.red, pr = Math.min(fl.candleT, 1);
            const bh = Math.min(Math.abs(fl.ret) * 140, 22) * pr;
            c!.strokeStyle = col; c!.lineWidth = 1; c!.beginPath(); c!.moveTo(fl.tx, fl.ty - bh / 2 - bh * 0.4); c!.lineTo(fl.tx, fl.ty + bh / 2 + bh * 0.4); c!.stroke();
            c!.fillStyle = col; c!.globalAlpha = 0.85 * pr; c!.fillRect(fl.tx - 3, fl.ty - bh / 2, 6, Math.max(bh, 1)); c!.globalAlpha = 1;
            if (fl.tk) { c!.fillStyle = C.amber; c!.globalAlpha = Math.max(0, 1 - fl.candleT); c!.font = `7.5px ${MONO}`; c!.textAlign = "center"; c!.fillText(fl.tk, fl.tx, fl.ty - 16); c!.globalAlpha = 1; }
            if (fl.candleT >= 1.2) fl.state = "done";
          }
        });
        if (fliers.length > 0 && fliers.every((f: any) => f.state === "done")) {
          curve.push({ x: fTarget.x, y: fTarget.y }); setGrowthLabel("$" + growth.toFixed(1)); monthN++;
          if (monthN >= periods.length) { monthN = 0; growth = 1; curve = [{ x: curveXAt(0), y: curveYAt(1) }]; setRound((r) => r + 1); }
          startMonth();
        }
      }
      return { tick };
    }
    function master() {
      if (!alive) return;
      if (!P) P = init();
      try { P?.tick(); } catch { P = null; }
      raf = requestAnimationFrame(master);
    }
    raf = requestAnimationFrame(master);
    const ro = new ResizeObserver(() => { P = null; });
    ro.observe(wrap);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [periods, basketSize, weightPct, streams]);

  // ── chrome (topbar / KPI strip / canvas / footer) ───────────────────────────
  const term = periods.length ? periods[periods.length - 1].growth : 1;
  return (
    <div ref={wrapRef} style={{ fontFamily: MONO, color: C.text, background: C.ground, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.line}`, background: C.panel }}>
        <div><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: C.green, marginRight: 8 }} />
          <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 15, letterSpacing: ".02em" }}>{title}</span>
          <span style={{ color: C.dim, fontSize: 10, marginLeft: 10 }}>STREAMS ↓ TRANSMUTE ↓ BASKET ↓ CURVE</span></div>
        <div style={{ fontSize: 10, textAlign: "right", lineHeight: 1.6, color: C.dim }}>
          {candidate && <span style={{ border: `1px solid ${C.faint}`, borderRadius: 3, padding: "2px 7px", color: C.amber, fontSize: 9.5, letterSpacing: ".1em" }}>CANDIDATE-GRADE</span>}
          <br /><span>ROUND #{round}</span></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(2,1fr)" : `1.3fr repeat(${edge ? 5 : 3},1fr)`, borderBottom: `1px solid ${C.line}` }}>
        <Kcell hero label="Growth of $1 · realized" value={growthLabel} sub="building live ↓" color={C.green} />
        <Kcell label="CAGR" value={`${kpis.cagr.toFixed(1)}%`} sub="to latest" clickable onClick={() => setCatOpen((o) => !o)}
          overlay={catOpen ? <CatOverlay src={CATS[catIdx]} /> : null} />
        <Kcell label="Sharpe" value={kpis.sharpe.toFixed(2)} sub="true daily" />
        <Kcell label="Max DD" value={`${kpis.maxdd.toFixed(1)}%`} sub="daily mark" color={C.red} />
        {edge && <>
          <Kcell label="Edge·full" value={`+${edge.full.val.toFixed(2)}%`} sub={`t ${edge.full.t.toFixed(2)}`} color={C.amber} sig={edge.full.sig ? "y" : "n"} />
          <Kcell label="Edge·recent" value={`+${edge.recent.val.toFixed(2)}%`} sub={`t ${edge.recent.t.toFixed(2)}${edge.recent.sig ? "" : " n.s."}`} color={edge.recent.sig ? C.amber : C.red} sig={edge.recent.sig ? "y" : "n"} />
        </>}
      </div>
      <div style={{ position: "relative", background: C.ground }}>
        <canvas ref={canvasRef} style={{ display: "block", width: "100%" }} />
      </div>
      <div style={{ padding: "11px 16px", fontSize: 9.5, color: C.faint, lineHeight: 1.8, background: C.panel }}>
        ● {footer} &nbsp;·&nbsp; <span style={{ color: C.amber }}>click CAGR for a surprise</span> &nbsp;·&nbsp;
        <span style={{ color: C.dim }}> terminal ×{term.toFixed(0)} over {periods.length} yrs</span>
      </div>
    </div>
  );
}

function Kcell({ label, value, sub, color, hero, sig, clickable, onClick, overlay }: {
  label: string; value: string; sub: string; color?: string; hero?: boolean; sig?: "y" | "n";
  clickable?: boolean; onClick?: () => void; overlay?: React.ReactNode;
}) {
  return (
    <div onClick={onClick} style={{ padding: "11px 14px", borderRight: `1px solid ${C.line}`, background: C.panel, position: "relative", overflow: "hidden", cursor: clickable ? "pointer" : "default" }}>
      <div style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: C.dim }}>{label}</div>
      <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: hero ? 29 : 23, marginTop: 5, color: color ?? C.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 9.5, color: C.dim, marginTop: 3 }}>
        {sig && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", marginRight: 4, background: sig === "y" ? C.amber : C.red }} />}{sub}</div>
      {overlay}
    </div>
  );
}

function CatOverlay({ src }: { src: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: C.ground, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <img src={src} alt="grumpy" style={{ height: "68%", width: "auto", borderRadius: 4, objectFit: "cover", animation: "pipeviz-jolt .09s infinite" }} />
      <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 13, color: C.red, letterSpacing: ".08em", animation: "pipeviz-shake .1s infinite" }}>GRRRR</div>
      <style>{`@keyframes pipeviz-jolt{0%,100%{transform:translate(0,0) rotate(0)}25%{transform:translate(-1px,1px) rotate(-1.5deg)}75%{transform:translate(1px,-1px) rotate(1.5deg)}}@keyframes pipeviz-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}`}</style>
    </div>
  );
}
