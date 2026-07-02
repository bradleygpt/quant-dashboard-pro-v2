import { useEffect, useMemo, useRef, useState } from "react";
import { BRASS, ENTITY, INK, LINE, SEM, STREAM, alpha } from "../theme";

// ── palette (the c78q alchemist reference) ───────────────────────────────────
// Semantic members come from the token layer (P&L green/red, brass accent,
// stream-family hues). ground/panel/panel2 stay local: the crucible is a framed
// art object rendered on a deliberately deeper ground than any app surface.
const C = { ground: "#070A0C", panel: "#0D1116", panel2: "#0F141A", line: LINE.line,
  text: INK.ink, dim: INK.mute, faint: INK.dim,
  green: STREAM.price, amber: BRASS.bright, red: ENTITY.krasis, blue: STREAM.fundamental, violet: STREAM.event };
const DISP = "'Space Grotesk', sans-serif"; const MONO = "'IBM Plex Mono', monospace";

export interface VizStream { id: string; col: string }
export interface VizRebalance { endIdx: number; label: string; tickers: { sym: string; ret: number }[] }
export interface VizData { curve: number[]; rebalances: VizRebalance[] }
export interface PipelineVizProps {
  title: string;
  data: VizData;                 // REAL: full growth path + real per-rebalance baskets
  basketSize: number; weightPct: number;
  kpis: { cagr: number; sharpe: number; maxdd: number };
  edge?: { full: { val: number; t: number; sig: boolean }; recent: { val: number; t: number; sig: boolean } };
  candidate?: boolean;
  footer: string;
  streams: VizStream[];
}

// Build the viz data from a real (date,growth) curve + real (date,tickers) holdings.
// curve = the ACTUAL backtest path (every point). rebalances = real baskets, each mapped to
// the curve index where its holding period ends, with per-ticker realized returns.
export function buildVizData(
  points: { date: string; growth: number }[],
  holdings: { date: string; tickers: (string | { sym: string; ret: number })[] }[],
): VizData {
  const curve = points.map((p) => (Number.isFinite(p.growth) && p.growth > 0 ? p.growth : 1));
  if (!points.length) return { curve: [1], rebalances: [] };
  const idxOf = (d: string) => { let lo = 0; for (let i = 0; i < points.length; i++) { if (points[i].date <= d) lo = i; else break; } return lo; };
  const hs = [...holdings].filter((h) => h.tickers?.length).sort((a, b) => a.date.localeCompare(b.date));
  const rebalances: VizRebalance[] = hs.map((h, i) => {
    const startIdx = idxOf(h.date);
    const endIdx = i + 1 < hs.length ? idxOf(hs[i + 1].date) : curve.length - 1;
    const periodRet = curve[startIdx] > 0 ? curve[endIdx] / curve[startIdx] - 1 : 0;
    const tickers = h.tickers.map((t) => typeof t === "string"
      ? { sym: t, ret: periodRet }
      : { sym: t.sym, ret: Number.isFinite(t.ret) ? t.ret : periodRet });
    return { endIdx, label: h.date.slice(0, 7), tickers };
  });
  return { curve, rebalances };
}

export default function PipelineViz(props: PipelineVizProps) {
  const { title, data, basketSize, weightPct, kpis, edge, candidate, footer, streams } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [round, setRound] = useState(7160);
  const [growthLabel, setGrowthLabel] = useState("$1.0");
  const [catOpen, setCatOpen] = useState(false);
  const [catIdx, setCatIdx] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const BASE = import.meta.env.BASE_URL;
  const CATS = useMemo(() => [`${BASE}cat1.png`, `${BASE}cat2.png`], [BASE]);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 640));
    ro.observe(el); setNarrow(el.clientWidth < 640);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const id = "pipeviz-fonts";
    if (!document.getElementById(id)) {
      const l = document.createElement("link"); l.id = id; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
      document.head.appendChild(l);
    }
  }, []);
  useEffect(() => {
    if (!catOpen) return;
    const t = setInterval(() => setCatIdx((i) => (i + 1) % CATS.length), 220);
    return () => clearInterval(t);
  }, [catOpen, CATS.length]);

  // ── canvas pipeline: REAL curve drawn progressively, REAL baskets at each rebalance ──
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    const { curve, rebalances } = data;
    if (!canvas || !wrap || curve.length < 2 || rebalances.length === 0) return;
    let raf = 0, alive = true;
    const N = Math.max(1, basketSize);
    let TERM = 1; curve.forEach((g) => { TERM = Math.max(TERM, g); });
    // scale flight speed so a full loop stays watchable regardless of rebalance count
    const speedK = Math.max(1, rebalances.length / 40);

    let P: ReturnType<typeof init> | null = null;
    function init() {
      const w = canvas!.clientWidth; if (!w || w < 10) return null;
      const h = Math.round(Math.min(520, Math.max(360, w * 0.62)));
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = w * dpr; canvas!.height = h * dpr; canvas!.style.height = h + "px";
      const c = canvas!.getContext("2d"); if (!c) return null;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const streamTop = 24, streamY = 58, vesselY = h * 0.30, vesselCx = w / 2;
      const basketY = h * 0.52, curveTop = h * 0.60, curveBot = h - 26, curveX0 = w * 0.12, curveX1 = w * 0.88;
      const tot = streams.length;
      const ST = streams.map((s, i) => ({ id: s.id, col: s.col, x: w * 0.10 + (tot > 1 ? i / (tot - 1) : 0.5) * (w * 0.80), ph: (i * 1.7) % 6.28 }));
      const curveXAt = (i: number) => curveX0 + (i / Math.max(1, curve.length - 1)) * (curveX1 - curveX0);
      const curveYAt = (g: number) => curveBot - Math.min(Math.log(Math.max(g, 1)) / Math.log(Math.max(TERM, 1.0001)), 1) * (curveBot - curveTop);
      const spread = Math.min(16, (w * 0.5) / N);
      let drops: any[] = [], swirl = 0, frame = 0;
      let r = 0, drawnIdx = 0, fliers: any[] = [], targetIdx = 0;

      function startRebalance() {
        const rb = rebalances[r]; targetIdx = rb.endIdx;
        const ex = curveXAt(rb.endIdx), ey = curveYAt(curve[rb.endIdx]);
        fliers = rb.tickers.slice(0, N).map((t, i) => ({
          sym: t.sym, ret: t.ret, x: vesselCx + (i - (Math.min(N, rb.tickers.length) - 1) / 2) * spread, y: basketY,
          tx: ex, ty: ey, t: 0, speed: (0.012 + (i % 4) * 0.002) * speedK, state: "fly", candleT: 0,
        }));
      }
      startRebalance();

      // VESSEL: swap point for Akribeia logo — replace this single function with the brand
      // logo render (streams pour in, basket precipitates from its base; nothing else changes).
      function renderVessel(c: CanvasRenderingContext2D, vx: number, vy: number) {
        const rw = Math.min(52, w * 0.12);
        c.strokeStyle = alpha(STREAM.event, 0.55); c.lineWidth = 1.6;
        c.beginPath(); c.arc(vx, vy, rw, 0.15 * Math.PI, 0.85 * Math.PI, false); c.stroke();
        c.beginPath(); c.moveTo(vx - rw + 6, vy + 8); c.lineTo(vx - rw - 6, vy + 8); c.moveTo(vx + rw - 6, vy + 8); c.lineTo(vx + rw + 6, vy + 8); c.stroke();
        const gl = c.createRadialGradient(vx, vy + 10, 2, vx, vy + 10, rw * 0.9);
        gl.addColorStop(0, alpha(STREAM.event, 0.5)); gl.addColorStop(0.6, alpha(SEM.pos, 0.25)); gl.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = gl; c.beginPath(); c.arc(vx, vy + 10, rw * 0.85, 0, 7); c.fill();
        for (let k = 0; k < 7; k++) { const ph = swirl * 1.4 + k * 0.9; const bx = vx + Math.sin(ph) * rw * 0.5;
          const by = vy + 18 - ((swirl * 20 + k * 30) % 48); const al = Math.max(0, 1 - ((swirl * 20 + k * 30) % 48) / 48);
          c.fillStyle = alpha(SEM.pos, 0.5 * al); c.beginPath(); c.arc(bx, by, 2 + al * 2, 0, 7); c.fill(); }
        swirl += 0.05;
      }
      function pourParticles() {
        ST.forEach((st) => { if (Math.random() < 0.4) drops.push({ col: st.col, t: 0, x0: st.x, y0: streamY, x1: vesselCx + (Math.random() - 0.5) * 30, y1: vesselY - 6 }); });
      }
      function tick() {
        frame++; c!.clearRect(0, 0, w, h);
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
        // basket label (current real rebalance)
        const rb = rebalances[Math.min(r, rebalances.length - 1)];
        c!.fillStyle = C.amber; c!.font = `8.5px ${MONO}`; c!.textAlign = "center";
        c!.fillText(`▼ BASKET · ${rb.tickers.length} × ${weightPct.toFixed(1)}% · ${rb.label}`, vesselCx, basketY + 2);
        // $1 baseline + REAL curve up to drawnIdx
        c!.strokeStyle = C.line; c!.setLineDash([2, 4]); c!.beginPath(); c!.moveTo(curveX0, curveYAt(1)); c!.lineTo(curveX1, curveYAt(1)); c!.stroke(); c!.setLineDash([]);
        c!.fillStyle = C.dim; c!.font = `8px ${MONO}`; c!.textAlign = "start"; c!.fillText("$1", curveX0 - 2, curveYAt(1) - 4);
        c!.strokeStyle = C.green; c!.lineWidth = 2; c!.beginPath();
        for (let i = 0; i <= drawnIdx; i++) { const x = curveXAt(i), y = curveYAt(curve[i]); i === 0 ? c!.moveTo(x, y) : c!.lineTo(x, y); }
        c!.stroke();
        { const tx = curveXAt(drawnIdx), ty = curveYAt(curve[drawnIdx]); c!.fillStyle = C.green; c!.beginPath(); c!.arc(tx, ty, 3, 0, 7); c!.fill(); }
        // fliers basket -> curve endpoint, then candle (real per-ticker return)
        fliers.forEach((fl: any) => {
          if (fl.state === "fly") {
            fl.t = Math.min(fl.t + fl.speed, 1); const e = fl.t < 0.5 ? 2 * fl.t * fl.t : 1 - Math.pow(-2 * fl.t + 2, 2) / 2;
            fl.cx = fl.x + (fl.tx - fl.x) * e; fl.cy = fl.y + (fl.ty - fl.y) * e;
            c!.fillStyle = C.amber; c!.beginPath(); c!.arc(fl.cx, fl.cy, 3, 0, 7); c!.fill();
            if (fl.sym) { c!.fillStyle = C.amber; c!.font = `7.5px ${MONO}`; c!.textAlign = "center"; c!.fillText(fl.sym, fl.cx, fl.cy - 7); }
            if (fl.t >= 1) { fl.state = "candle"; fl.candleT = 0; }
          } else if (fl.state === "candle") {
            fl.candleT += 0.06 * speedK; const up = fl.ret >= 0, col = up ? C.green : C.red, pr = Math.min(fl.candleT, 1);
            const bh = Math.min(Math.abs(fl.ret) * 140, 22) * pr;
            c!.strokeStyle = col; c!.lineWidth = 1; c!.beginPath(); c!.moveTo(fl.tx, fl.ty - bh / 2 - bh * 0.4); c!.lineTo(fl.tx, fl.ty + bh / 2 + bh * 0.4); c!.stroke();
            c!.fillStyle = col; c!.globalAlpha = 0.85 * pr; c!.fillRect(fl.tx - 3, fl.ty - bh / 2, 6, Math.max(bh, 1)); c!.globalAlpha = 1;
            if (fl.sym) { c!.fillStyle = C.amber; c!.globalAlpha = Math.max(0, 1 - fl.candleT); c!.font = `7.5px ${MONO}`; c!.textAlign = "center"; c!.fillText(fl.sym, fl.tx, fl.ty - 16); c!.globalAlpha = 1; }
            if (fl.candleT >= 1.2) fl.state = "done";
          }
        });
        if (fliers.length > 0 && fliers.every((f: any) => f.state === "done")) {
          drawnIdx = targetIdx; setGrowthLabel("$" + curve[drawnIdx].toFixed(1)); r++;
          if (r >= rebalances.length) { r = 0; drawnIdx = 0; setRound((x) => x + 1); }
          startRebalance();
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
  }, [data, basketSize, weightPct, streams]);

  const term = data.curve.length ? data.curve[data.curve.length - 1] : 1;
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
        <span style={{ color: C.dim }}>real path · terminal ${term.toFixed(0)} · {data.rebalances.length} rebalances</span>
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
