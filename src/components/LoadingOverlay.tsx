// Akribeia loading sequence — the front door that plays before the three-body portal.
//
// PROVENANCE: the animation below is the APPROVED artifact
// (Downloads/akribeia-loading-quant__1_.html, 2026-07-22) ported verbatim — every
// phase duration, easing, particle constant, bear polygon, route and draw call is
// byte-faithful to the original. What was ADDED is only the lifecycle the standalone
// file lacked (it was an orphan: it ended on the final mark with a Replay button and
// no handoff):
//   - onComplete fires when the settle phase resolves (at TOTAL), not after the
//     original's extra +600ms dwell — 18.2s every visit is long enough already
//   - a SKIP control, present from early in the sequence rather than only at the end
//   - the RAF loop id is captured and cancelled on unmount (the original never stored
//     it, so an orphaned loop would keep burning CPU behind the portal forever)
//   - the resize listener is removed on unmount
//   - the two base64 logos became /landing/*.png (633 KB of base64 does not belong in
//     a JS bundle; same-origin so the getImageData sampling still works untainted)
// The Replay button is dropped: it is meaningless once the sequence auto-advances.
//
// Rendered ON TOP of an already-mounted portal, so the cross-fade reveals a live view
// rather than triggering a second load. Reduced-motion users never see this at all —
// the parent skips mounting it (they should not be held for 18 seconds).
import { useEffect, useRef, useState } from "react";

const FADE_MS = 700;      // cross-fade into the portal
const SKIP_FADE_MS = 320;  // snappier when the user asked to leave

export default function LoadingOverlay({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const sublabelRef = useRef<HTMLParagraphElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const barfillRef = useRef<HTMLElement>(null);
  const [fading, setFading] = useState(false);
  const finishedRef = useRef(false);

  // single exit path for both auto-advance and skip: fade, then hand off
  const finish = useRef((ms: number) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFading(true);
    window.setTimeout(onDone, ms);
  });
  useEffect(() => {
    finish.current = (ms: number) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setFading(true);
      window.setTimeout(onDone, ms);
    };
  }, [onDone]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wordmark = wordmarkRef.current!;
    const caption = captionRef.current!;
    const barfill = barfillRef.current!;
    const ctx = canvas.getContext("2d")!;
    let rafId = 0;
    let cancelled = false;

    // ── original IIFE body, verbatim except for the marked lifecycle hooks ──
    const VARIANT = new URLSearchParams(location.search).get("v") || "quant";
    rootRef.current!.classList.add(VARIANT === "ai" ? "v-ai" : "v-quant");
    sublabelRef.current!.innerHTML =
      VARIANT === "ai" ? "AI &amp; <em>DATA SCIENCE</em>" : "QUANTITATIVE <em>ANALYSIS</em>";

    const DW = 1000, DH = 600;
    const PHASES = [
      { name: "starfield", dur: 2200, cap: "INITIALIZING" },
      { name: "converge", dur: 5000, cap: "SIGNAL DETECTED" },
      { name: "bear", dur: 2600, cap: "URSA MAJOR" },
      { name: "bigbang", dur: 1400, cap: "REGIME CHANGE" },
      { name: "draw", dur: 4800, cap: "RESOLVING" },
      { name: "settle", dur: 2200, cap: "AKRIBEIA" },
    ];
    const TOTAL = PHASES.reduce((a, p) => a + p.dur, 0);

    let W = 0, H = 0, S = 1, OX = 0, OY = 0, DPR = 1;
    function resize() {
      DPR = Math.min(devicePixelRatio || 1, 2);
      // ADDED: a 0-width viewport at mount (background/prerendered tab, mobile
      // address-bar settle) would otherwise bake a 0x0 canvas that never recovers.
      // Fall back through the document element, then to a sane default.
      W = innerWidth || document.documentElement.clientWidth || 1280;
      H = innerHeight || document.documentElement.clientHeight || 720;
      canvas.width = W * DPR; canvas.height = H * DPR;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      S = Math.min(W / DW, H / DH); OX = (W - DW * S) / 2; OY = (H - DH * S) / 2;
    }
    addEventListener("resize", resize); resize();
    const vb = () => ({ x0: -OX / S, y0: -OY / S, x1: DW + OX / S, y1: DH + OY / S });

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
    const easeIO = (t: number) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const easeO = (t: number) => 1 - Math.pow(1 - t, 3);

    /* ============ bear: contour traced from the reference artwork ============ */
    const BEARPOLY = [[847.1, 341.5], [817.4, 301.8], [810.8, 270.4], [782.7, 239.0], [779.4, 217.6], [751.3, 220.9], [744.7, 201.0], [711.7, 206.0], [601.0, 130.0], [551.4, 130.0], [465.5, 153.1], [364.7, 151.5], [315.1, 166.3], [255.7, 204.3], [242.4, 232.4], [239.1, 275.4], [216.0, 353.0], [212.7, 405.9], [192.9, 452.2], [192.9, 475.3], [202.8, 493.5], [217.7, 498.4], [259.0, 501.7], [285.4, 496.8], [283.7, 486.9], [260.6, 465.4], [260.6, 452.2], [292.0, 422.4], [303.6, 405.9], [316.8, 405.9], [358.1, 447.2], [373.0, 467.0], [377.9, 485.2], [389.5, 493.5], [427.5, 501.7], [453.9, 501.7], [465.5, 493.5], [478.7, 490.2], [485.3, 477.0], [498.5, 477.0], [508.4, 481.9], [538.2, 486.9], [556.3, 481.9], [556.3, 473.7], [549.7, 470.3], [549.7, 462.1], [521.7, 453.8], [520.0, 439.0], [536.5, 420.8], [541.5, 420.8], [543.1, 412.5], [554.7, 397.7], [567.9, 397.7], [614.2, 452.2], [668.7, 500.1], [690.2, 508.3], [743.0, 510.0], [756.3, 503.4], [756.3, 491.8], [744.7, 490.2], [741.4, 478.6], [726.5, 473.7], [726.5, 455.5], [701.7, 453.8], [660.4, 374.5], [657.1, 351.4], [673.7, 349.7], [698.4, 363.0], [728.2, 386.1], [741.4, 389.4], [756.3, 377.8], [769.5, 377.8], [784.3, 384.4], [799.2, 386.1], [805.8, 377.8], [840.5, 356.3], [847.1, 349.7]];
    const DTGT = [{ x: 224.7, y: 486.4, o: 0 }, { x: 259.8, y: 170.3, o: 6 }, { x: 270.7, y: 495.8, o: 1 }, { x: 277.9, y: 379.2, o: 2 }, { x: 306.9, y: 203.8, o: 4 }, { x: 394.8, y: 471.1, o: 7 }, { x: 397.4, y: 311.1, o: 13 }, { x: 399.1, y: 217.9, o: 3 }, { x: 405.2, y: 423.3, o: 10 }, { x: 453.2, y: 316.8, o: 11 }, { x: 463.4, y: 265.6, o: 8 }, { x: 474.1, y: 222.3, o: 5 }, { x: 527.4, y: 309.7, o: 14 }, { x: 554.1, y: 226.0, o: 9 }, { x: 597.4, y: 307.2, o: 16 }, { x: 620.7, y: 366.2, o: 18 }, { x: 633.3, y: 234.6, o: 12 }, { x: 665.5, y: 435.5, o: 20 }, { x: 667.1, y: 280.3, o: 19 }, { x: 671.1, y: 465.5, o: 21 }, { x: 686.0, y: 243.7, o: 15 }, { x: 705.7, y: 497.4, o: 23 }, { x: 722.3, y: 461.5, o: 22 }, { x: 738.5, y: 258.4, o: 17 }];
    const DLINES = [[1, 4], [4, 7], [7, 11], [11, 13], [13, 16], [16, 20], [20, 23], [23, 18], [18, 14], [14, 12], [12, 9], [6, 9], [10, 9], [11, 10], [14, 15], [15, 19], [19, 21], [15, 17], [17, 22], [4, 5], [8, 5], [7, 3], [3, 0], [0, 2]];
    const BEAR_CX = 542, BEAR_CY = 397;

    function bearPath(c: CanvasRenderingContext2D) {
      c.beginPath();
      c.moveTo(BEARPOLY[0][0], BEARPOLY[0][1]);
      for (let i = 1; i < BEARPOLY.length; i++) c.lineTo(BEARPOLY[i][0], BEARPOLY[i][1]);
      c.closePath();
    }

    /* ============ logo geometry ============ */
    const QA = {
      cx: 540, cy: 303, r: 86, lw: 40, a0: 0.726, a1: 5.557,
      stemX: 598, stemW: 43, stemTop: 205, stemBot: 390, dotX: 602, dotY: 404, dotR: 18,
    };
    function quantGradient(c: CanvasRenderingContext2D) {
      const g = c.createLinearGradient(392, 187, 612, 453);
      g.addColorStop(0, "#ee7d6b"); g.addColorStop(.45, "#e55b75");
      g.addColorStop(.75, "#de4a8a"); g.addColorStop(1, "#ca49a3");
      return g;
    }
    const TO = [[352, 438], [500, 150], [648, 438]], TI = [[447, 368], [500, 262], [553, 368]];
    function aiGradient(c: CanvasRenderingContext2D) {
      const g = c.createLinearGradient(370, 440, 640, 160);
      g.addColorStop(0, "#e0407f"); g.addColorStop(.5, "#8b5cf6"); g.addColorStop(1, "#38bdf8");
      return g;
    }
    /* the actual logo — the final mark IS this image (extracted from the artifact) */
    const LIMG = new Image();
    const LP_QUANT = { x: 368, y: 116, w: 283, h: 345 };
    const LP_AI = { x: 266, y: 60, w: 482, h: 462 };
    const LP = VARIANT === "ai" ? LP_AI : LP_QUANT;
    function drawLogoImage(c: CanvasRenderingContext2D, alpha: number) {
      c.save(); c.globalAlpha = alpha; c.drawImage(LIMG, LP.x, LP.y, LP.w, LP.h); c.restore();
    }
    const logoCrisp = (c: CanvasRenderingContext2D, a: number) => drawLogoImage(c, a);
    const STROKE_W = VARIANT === "ai" ? 22 : QA.lw;

    /* ============ probe route: the Droplet draws the mark ============ */
    type RP = { x: number; y: number; pen: number; tag?: string | null };
    let ROUTE: RP[] = [], EVENTS: { idx: number; type: string }[] = [];
    function pushLine(x0: number, y0: number, x1: number, y1: number, pen: number, step = 4, tag: string | null = null) {
      const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(d / step));
      for (let i = 1; i <= n; i++) ROUTE.push({ x: lerp(x0, x1, i / n), y: lerp(y0, y1, i / n), pen, tag });
    }
    function pushCurve(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, pen: number, step = 5) {
      const n = Math.max(6, Math.ceil((Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy)) / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n, a = 1 - t;
        ROUTE.push({ x: a * a * x0 + 2 * a * t * cx + t * t * x1, y: a * a * y0 + 2 * a * t * cy + t * t * y1, pen });
      }
    }
    function pushArc(cx: number, cy: number, r: number, a0: number, a1: number, pen: number, step = 4, tag: string | null = null) {
      const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r / step));
      for (let i = 1; i <= n; i++) {
        const a = lerp(a0, a1, i / n);
        ROUTE.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), pen, tag });
      }
    }
    function buildRoute() {
      ROUTE = []; EVENTS = [];
      const b = vb();
      if (VARIANT === "ai") {
        const X0 = 280, X1 = 712, Y0 = 112, Y1 = 510, rows = 6;
        ROUTE.push({ x: b.x0 - 90, y: Y0, pen: 0 });
        pushCurve(b.x0 - 90, Y0, 120, Y0, X0, Y0, 0);
        for (let r = 0; r <= rows; r++) {
          const y = lerp(Y0, Y1, r / rows), ltr = r % 2 === 0;
          pushLine(ltr ? X0 : X1, y, ltr ? X1 : X0, y, 1, 5, "sweep");
          if (r < rows) pushLine(ltr ? X1 : X0, y, ltr ? X1 : X0, lerp(Y0, Y1, (r + 1) / rows), 1, 5, "sweep");
        }
        pushCurve(rows % 2 === 0 ? X1 : X0, Y1, b.x1 + 80, Y1, b.x1 + 120, Y1, 0);
      } else {
        const q = QA;
        ROUTE.push({ x: b.x0 - 90, y: 520, pen: 0 });
        pushCurve(b.x0 - 90, 520, 260, 565, q.dotX, q.dotY, 0);
        EVENTS.push({ idx: ROUTE.length - 1, type: "dot" });
        const sx = q.cx + q.r * Math.cos(q.a0), sy = q.cy + q.r * Math.sin(q.a0);
        pushCurve(q.dotX, q.dotY, (q.dotX + sx) / 2 - 30, (q.dotY + sy) / 2, sx, sy, 0);
        pushArc(q.cx, q.cy, q.r, q.a0, q.a1, 1, 4, "ring");
        const ex = q.cx + q.r * Math.cos(q.a1), ey = q.cy + q.r * Math.sin(q.a1);
        pushCurve(ex, ey, (ex + q.stemX) / 2 + 8, (ey + q.stemTop) / 2 - 16, q.stemX, q.stemTop, 0);
        pushLine(q.stemX, q.stemTop, q.stemX, q.stemBot, 1, 4, "stem");
        pushCurve(q.stemX, q.stemBot, 700, 470, b.x1 + 120, 520, 0);
      }
    }

    /* reveal mask: the Droplet's path uncovers the real logo */
    const MASKC = document.createElement("canvas"); MASKC.width = DW; MASKC.height = DH;
    const MCTX = MASKC.getContext("2d")!;
    const COMPC = document.createElement("canvas"); COMPC.width = DW; COMPC.height = DH;
    const CCTX = COMPC.getContext("2d")!;
    let lastStamp = -1;
    function stampBrush(x: number, y: number, r: number) {
      const g = MCTX.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.6, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      MCTX.fillStyle = g; MCTX.beginPath(); MCTX.arc(x, y, r, 0, 7); MCTX.fill();
    }
    function stampTo(idx: number) {
      for (let i = Math.max(lastStamp + 1, 0); i <= idx && i < ROUTE.length; i++) {
        const p = ROUTE[i];
        if (p.pen) stampBrush(p.x, p.y, p.tag === "sweep" ? 60 : (p.tag === "stem" ? 52 : 50));
      }
      lastStamp = idx;
    }
    function drawReveal() {
      CCTX.setTransform(1, 0, 0, 1, 0, 0);
      CCTX.clearRect(0, 0, DW, DH);
      CCTX.drawImage(LIMG, LP.x, LP.y, LP.w, LP.h);
      CCTX.globalCompositeOperation = "destination-in";
      CCTX.drawImage(MASKC, 0, 0);
      CCTX.globalCompositeOperation = "source-over";
      ctx.drawImage(COMPC, 0, 0);
    }

    /* ============ sampling ============ */
    function sample(drawFn: (c: CanvasRenderingContext2D) => void, step: number) {
      const o = document.createElement("canvas"); o.width = DW; o.height = DH;
      const c = o.getContext("2d")!; drawFn(c);
      const d = c.getImageData(0, 0, DW, DH).data, pts: { x: number; y: number; col: number[] }[] = [];
      for (let y = 0; y < DH; y += step) for (let x = 0; x < DW; x += step) {
        const i = (y * DW + x) * 4;
        if (d[i + 3] > 140) pts.push({ x: x + rand(-1.2, 1.2), y: y + rand(-1.2, 1.2), col: [d[i], d[i + 1], d[i + 2]] });
      }
      for (let i = pts.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[pts[i], pts[j]] = [pts[j], pts[i]]; }
      return pts;
    }
    const bearPts = sample(c => { c.fillStyle = "#fff"; bearPath(c); c.fill(); }, 9);
    let logoPts: { x: number; y: number; col: number[] }[] = [];
    function computeLogoTargets() {
      logoPts = sample(c => drawLogoImage(c, 1), VARIANT === "ai" ? 7 : 6);
    }

    /* ============ particles ============ */
    const N = Math.min(1400, Math.max(600, ((W * H) / 1000) | 0));
    const P: any[] = [], SPARKS: any[] = [];
    let DSTARS: any[] = [], eventCursor = 0;

    function initWorld() {
      P.length = 0; SPARKS.length = 0; eventCursor = 0;
      lastStamp = -1; MCTX.setTransform(1, 0, 0, 1, 0, 0); MCTX.clearRect(0, 0, DW, DH);
      if (!logoPts.length) computeLogoTargets();
      buildRoute();
      const b = vb();
      for (let i = 0; i < N; i++) {
        const bt = bearPts[i % bearPts.length], lt = logoPts[i % logoPts.length];
        P.push({
          hx: rand(b.x0, b.x1), hy: rand(b.y0, b.y1), x: 0, y: 0, vx: 0, vy: 0,
          bx: bt.x, by: bt.y, lx: lt.x, ly: lt.y, lcol: lt.col,
          r: rand(.6, 1.8), tw: rand(0, Math.PI * 2), tws: rand(.5, 2.2),
          oi: i / N, conv: 0, struck: -1, boomed: false,
          boomA: rand(0, Math.PI * 2), boomS: rand(60, 320) * (Math.random() < .12 ? 2.1 : 1),
        });
        P[i].x = P[i].hx; P[i].y = P[i].hy;
      }
      DSTARS = DTGT.map((t, k) => {
        const lt = logoPts[(k * 37) % logoPts.length];
        return {
          hx: rand(b.x0, b.x1), hy: rand(b.y0, b.y1), x: 0, y: 0, vx: 0, vy: 0,
          tx: t.x, ty: t.y, lx: lt.x, ly: lt.y, lcol: lt.col,
          start: .06 + (t.o !== undefined ? t.o : k) * (0.74 / DTGT.length), landedAt: -1,
          conv: 0, struck: -1, boomed: false, boomA: rand(0, Math.PI * 2), boomS: rand(120, 380),
        };
      });
      DSTARS.forEach(s => { s.x = s.hx; s.y = s.hy; });
    }

    let t0 = performance.now(), done = false, lastPhase = -1;
    function phaseAt(el: number) {
      let acc = 0;
      for (let i = 0; i < PHASES.length; i++) {
        if (el < acc + PHASES[i].dur) return { i, p: (el - acc) / PHASES[i].dur };
        acc += PHASES[i].dur;
      }
      return { i: PHASES.length - 1, p: 1 };
    }
    const beat = (el: number) => {
      const T = (el / 1150) % 1, g = (m: number, s: number) => Math.exp(-((T - m) * (T - m)) / (2 * s * s));
      return g(.08, .045) + .65 * g(.26, .05);
    };
    function burst(x: number, y: number, col: string, n: number) {
      for (let k = 0; k < n; k++) {
        const a = rand(0, Math.PI * 2), s = rand(40, 260);
        SPARKS.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, col });
      }
    }
    function drawStar(x: number, y: number, r: number, alpha: number, flare: boolean) {
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (flare) {
        ctx.globalAlpha = alpha * .5; ctx.lineWidth = r * .3;
        ctx.beginPath();
        ctx.moveTo(x - r * 4, y); ctx.lineTo(x + r * 4, y);
        ctx.moveTo(x, y - r * 4); ctx.lineTo(x, y + r * 4); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    let TRAIL: { x: number; y: number }[] = [];
    function frame(now: number) {
      if (cancelled) return;                                   // ADDED: hard stop on unmount
      const el = now - t0, { i: pi, p } = phaseAt(el), ph = PHASES[pi].name;
      if (pi !== lastPhase) { caption.textContent = PHASES[pi].cap; lastPhase = pi; }
      barfill.style.width = (clamp(el / TOTAL, 0, 1) * 100).toFixed(1) + "%";
      const tsec = el / 1000, dt = 1 / 60;

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = "#04060c"; ctx.fillRect(0, 0, W, H);
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .2, W / 2, H / 2, Math.max(W, H) * .75);
      vg.addColorStop(0, "rgba(8,13,22,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      ctx.setTransform(S * DPR, 0, 0, S * DPR, OX * DPR, OY * DPR);

      const b = beat(el);

      /* ---- bear glow ---- */
      let bearGlow = 0;
      if (ph === "converge") bearGlow = .14 * easeIO(p);
      if (ph === "bear") bearGlow = easeO(clamp(p * 2, 0, 1));
      if (ph === "bigbang") bearGlow = Math.max(0, 1 - p * 3.2);
      if (bearGlow > 0) {
        ctx.save();
        const bg = ctx.createLinearGradient(220, 150, 890, 490);
        bg.addColorStop(0, "rgba(240,112,196,.36)");
        bg.addColorStop(.5, "rgba(148,110,248,.32)");
        bg.addColorStop(1, "rgba(96,142,255,.26)");
        ctx.globalAlpha = bearGlow; ctx.fillStyle = bg; bearPath(ctx); ctx.fill();
        ctx.strokeStyle = "rgba(198,172,255,.6)"; ctx.lineWidth = 1.6;
        ctx.shadowColor = "rgba(172,140,255,.9)"; ctx.shadowBlur = 26 * bearGlow;
        ctx.stroke(); ctx.restore();
      }

      /* ---- constellation stars: one-by-one arrivals ---- */
      const cvP = ph === "converge" ? p : (pi > 1 ? 1 : 0);
      if (pi >= 1 && pi <= 2) {
        for (const s of DSTARS) {
          const f = clamp((cvP - s.start) / .2, 0, 1);
          if (f >= 1 && s.landedAt < 0) s.landedAt = el;
          const e = easeIO(f);
          s.x = lerp(s.hx, s.tx, e); s.y = lerp(s.hy, s.ty, e);
          if (f >= 1) { s.x = s.tx + Math.sin(tsec * 2 + s.start * 40) * .8; s.y = s.ty + Math.cos(tsec * 1.7 + s.start * 40) * .8; }
        }
        ctx.save();
        ctx.strokeStyle = "rgba(236,240,255,.85)"; ctx.lineWidth = 1.4;
        ctx.shadowColor = "rgba(255,255,255,.75)"; ctx.shadowBlur = 6;
        for (const [a, c2] of DLINES) {
          const A = DSTARS[a], B = DSTARS[c2];
          if (A.landedAt < 0 || B.landedAt < 0) continue;
          const lp = clamp((el - Math.max(A.landedAt, B.landedAt)) / 320, 0, 1);
          ctx.beginPath(); ctx.moveTo(A.x, A.y);
          ctx.lineTo(lerp(A.x, B.x, lp), lerp(A.y, B.y, lp)); ctx.stroke();
        }
        for (const s of DSTARS) {
          const inFlight = s.landedAt < 0 && cvP > s.start;
          ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff";
          if (inFlight) {
            drawStar(s.x, s.y, 3.4, 1, true);
            ctx.globalAlpha = .35; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(s.hx, s.hy); ctx.lineTo(s.x, s.y); ctx.stroke();
            ctx.globalAlpha = 1;
          } else if (s.landedAt > 0) {
            const since = (el - s.landedAt) / 520;
            drawStar(s.x, s.y, 3.4 + .9 * Math.sin(tsec * 3 + s.tx), .95, true);
            if (since < 1) {
              ctx.globalAlpha = (1 - since) * .8; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.arc(s.tx, s.ty, 4 + since * 22, 0, 7); ctx.stroke();
              ctx.globalAlpha = 1;
            }
          }
        }
        ctx.restore();
      }

      /* ---- background particles ---- */
      for (const q of P) {
        if (ph === "starfield") {
          q.x = q.hx + Math.sin(tsec * .3 + q.tw) * 2; q.y = q.hy + Math.cos(tsec * .25 + q.tw) * 2;
        } else if (ph === "converge") {
          const st = .18 + q.oi * .62, f = clamp((p - st) / .16, 0, 1), e = easeO(f);
          const x = lerp(q.hx, q.bx, e), y = lerp(q.hy, q.by, e);
          const sq = 1 - .045 * b * e;
          q.x = BEAR_CX + (x - BEAR_CX) * sq; q.y = BEAR_CY + (y - BEAR_CY) * sq;
        } else if (ph === "bear") {
          const sq = 1 - .02 * b;
          q.x = BEAR_CX + (q.bx - BEAR_CX) * sq + Math.sin(tsec * 1.6 + q.tw) * 1.0;
          q.y = BEAR_CY + (q.by - BEAR_CY) * sq + Math.cos(tsec * 1.4 + q.tw) * 1.0;
        } else if (ph === "bigbang") {
          if (!q.boomed) { q.boomed = true; q.vx = Math.cos(q.boomA) * q.boomS; q.vy = Math.sin(q.boomA) * q.boomS; }
          q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= .985; q.vy *= .985;
        } else if (ph === "draw") {
          if (q.struck < 0) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= .99; q.vy *= .99; }
          else {
            const since = (el - q.struck) / 1000;
            if (since < .28) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= .94; q.vy *= .94; }
            else {
              q.conv = clamp(q.conv + .04, 0, 1);
              const k = .09 + .13 * q.conv;
              q.vx += (q.lx - q.x) * k; q.vy += (q.ly - q.y) * k;
              q.vx *= .82; q.vy *= .82; q.x += q.vx * .14; q.y += q.vy * .14;
            }
          }
        } else {
          if (q.struck < 0) { q.struck = el; q.conv = .0001; burst(q.x, q.y, `rgb(${q.lcol})`, 1); }
          q.conv = clamp(q.conv + .05, 0, 1);
          q.vx += (q.lx - q.x) * .2; q.vy += (q.ly - q.y) * .2;
          q.vx *= .76; q.vy *= .76; q.x += q.vx * .16; q.y += q.vy * .16;
        }
      }

      /* constellation stars join the debris after the bang */
      if (pi >= 3) {
        for (const s of DSTARS) {
          if (ph === "bigbang") {
            if (!s.boomed) { s.boomed = true; s.vx = Math.cos(s.boomA) * s.boomS; s.vy = Math.sin(s.boomA) * s.boomS; }
            s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= .985; s.vy *= .985;
          } else if (s.struck < 0) {
            if (ph === "settle") { s.struck = el; s.conv = .0001; }
            s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= .99; s.vy *= .99;
          } else {
            s.conv = clamp(s.conv + .04, 0, 1);
            s.vx += (s.lx - s.x) * .16; s.vy += (s.ly - s.y) * .16;
            s.vx *= .8; s.vy *= .8; s.x += s.vx * .15; s.y += s.vy * .15;
          }
          const col = s.struck < 0 ? "#fff" : `rgb(${s.lcol})`;
          ctx.fillStyle = col; ctx.strokeStyle = col;
          drawStar(s.x, s.y, 3.2, .95, true);
        }
      }

      /* ---- render background particles ---- */
      for (const q of P) {
        const twk = .55 + .45 * Math.sin(tsec * q.tws + q.tw);
        let col: string, a: number;
        if (q.conv > 0) {
          const c = q.lcol, m = q.conv;
          col = `rgb(${lerp(238, c[0], m) | 0},${lerp(242, c[1], m) | 0},${lerp(255, c[2], m) | 0})`;
          a = .55 + .45 * m;
        } else { col = "rgb(232,238,252)"; a = .35 + .5 * twk; }
        ctx.fillStyle = col;
        drawStar(q.x, q.y, q.r * (q.conv > 0 ? 1.3 : 1), a, false);
      }

      /* ---- sparks ---- */
      for (let i = SPARKS.length - 1; i >= 0; i--) {
        const s = SPARKS[i];
        s.life -= dt * 2.1; if (s.life <= 0) { SPARKS.splice(i, 1); continue; }
        s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= .94; s.vy *= .94;
        ctx.fillStyle = s.col; ctx.globalAlpha = s.life;
        ctx.beginPath(); ctx.arc(s.x, s.y, 1.6 * s.life + .4, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }

      /* ---- big bang flash ---- */
      if (ph === "bigbang" && p < .5) {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.fillStyle = `rgba(255,255,255,${(1 - p * 2) * .9})`; ctx.fillRect(0, 0, W, H);
        ctx.setTransform(S * DPR, 0, 0, S * DPR, OX * DPR, OY * DPR);
      }

      /* ---- the Droplet draws the mark ---- */
      if (ph === "draw" || ph === "settle") {
        const drawP = ph === "draw" ? easeIO(p) : 1;
        const idx = Math.min(ROUTE.length - 1, Math.floor(drawP * (ROUTE.length - 1)));

        stampTo(idx); drawReveal();

        if (ph === "draw") {
          const head = ROUTE[idx];
          while (eventCursor < EVENTS.length && idx >= EVENTS[eventCursor].idx) {
            if (EVENTS[eventCursor].type === "dot") {
              stampBrush(QA.dotX, QA.dotY, 46);
              burst(QA.dotX, QA.dotY, "#ca49a3", 8); burst(QA.dotX, QA.dotY, "#ffffff", 5);
            }
            eventCursor++;
          }
          const R2 = 36 * 36;
          const hit = (o: any) => {
            const dx = o.x - head.x, dy = o.y - head.y;
            if (dx * dx + dy * dy < R2) {
              o.struck = el; o.conv = .0001;
              o.vx = rand(-120, 120); o.vy = rand(-120, 120);
              burst(o.x, o.y, `rgb(${o.lcol})`, 3);
              burst(o.x, o.y, "rgba(255,240,225,1)", 2);
            }
          };
          for (const q of P) if (q.struck < 0) hit(q);
          for (const s of DSTARS) if (s.struck < 0) hit(s);

          TRAIL.push({ x: head.x, y: head.y }); if (TRAIL.length > 36) TRAIL.shift();
          ctx.save(); ctx.lineCap = "round";
          for (let i = 1; i < TRAIL.length; i++) {
            const f = i / TRAIL.length;
            ctx.strokeStyle = `rgba(220,232,244,${f * .65})`; ctx.lineWidth = .5 + f * 3.4;
            ctx.shadowColor = "rgba(190,215,240,.8)"; ctx.shadowBlur = 8 * f;
            ctx.beginPath(); ctx.moveTo(TRAIL[i - 1].x, TRAIL[i - 1].y);
            ctx.lineTo(TRAIL[i].x, TRAIL[i].y); ctx.stroke();
          }
          ctx.restore();

          const prev = ROUTE[Math.max(0, idx - 3)];
          const ang = Math.atan2(head.y - prev.y, head.x - prev.x);
          ctx.save();
          ctx.translate(head.x, head.y); ctx.rotate(ang + Math.PI / 2);
          const dg = ctx.createRadialGradient(-4, 4, 2, 0, 0, 28);
          dg.addColorStop(0, "#ffffff"); dg.addColorStop(.35, "#d7e9f2");
          dg.addColorStop(.75, "#61798c"); dg.addColorStop(1, "#1e2d3a");
          ctx.fillStyle = dg;
          ctx.beginPath();
          ctx.moveTo(0, -40);
          ctx.bezierCurveTo(13, -14, 15, 0, 15, 8);
          ctx.arc(0, 8, 15, 0, Math.PI);
          ctx.bezierCurveTo(-15, 0, -13, -14, 0, -40);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.9)";
          ctx.beginPath(); ctx.ellipse(-5, -2, 2.4, 7, -.35, 0, 7); ctx.fill();
          ctx.restore();
        } else {
          TRAIL.length = 0;
          const la = easeO(clamp(p / .7, 0, 1));
          logoCrisp(ctx, la);
          if (p > .3 && !wordmark.classList.contains("on")) wordmark.classList.add("on");
          if (p >= 1 && !done) {
            done = true;
            caption.style.opacity = "0";
            finish.current(FADE_MS);   // ADDED: the handoff — auto-advance at TOTAL
          }
        }
      }

      rafId = requestAnimationFrame(frame);   // ADDED: id captured so unmount can cancel
    }

    function start() {
      done = false; lastPhase = -1; TRAIL = [];
      wordmark.classList.remove("on");
      caption.style.opacity = "1";
      initWorld(); t0 = performance.now();
      rafId = requestAnimationFrame(frame);
    }
    LIMG.onload = start;
    LIMG.onerror = () => finish.current(0);   // ADDED: asset failure must not strand the visitor
    LIMG.src = VARIANT === "ai" ? "/landing/akribeia-mark-ai.png" : "/landing/akribeia-mark-quant.png";

    return () => {                            // ADDED: full teardown
      cancelled = true;
      cancelAnimationFrame(rafId);
      removeEventListener("resize", resize);
      LIMG.onload = null; LIMG.onerror = null;
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="akl-root"
      style={{ opacity: fading ? 0 : 1, transition: `opacity ${fading ? FADE_MS : 0}ms ease` }}
      aria-hidden={fading}
    >
      <style>{`
        .akl-root{position:fixed;inset:0;z-index:100;background:#04060c;
          font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;overflow:hidden}
        .akl-root.v-quant{--a1:#ee7d6b;--a2:#d4488f;--wm:#9aa2ac}
        .akl-root.v-ai{--a1:#8b5cf6;--a2:#e0407f;--wm:#eef1f7}
        .akl-root .akl-stage{position:fixed;inset:0;display:block}
        .akl-root .akl-wordmark{position:fixed;left:50%;top:50%;
          transform:translate(-50%,-50%) translateY(180px);
          text-align:center;opacity:0;transition:opacity 1.6s ease;pointer-events:none}
        .akl-root .akl-wordmark.on{opacity:1}
        .akl-root .akl-wordmark h1{color:var(--wm);font-weight:500;
          font-size:clamp(24px,3.6vw,36px);letter-spacing:.42em;text-indent:.42em}
        .akl-root .akl-wordmark p{color:#5b6675;font-weight:500;
          font-size:clamp(10px,1.2vw,13px);letter-spacing:.5em;text-indent:.5em;margin-top:10px}
        .akl-root .akl-wordmark p em{font-style:normal;color:var(--a1)}
        .akl-root.v-ai .akl-wordmark p em{
          background:linear-gradient(90deg,var(--a1),var(--a2));
          -webkit-background-clip:text;background-clip:text;color:transparent}
        .akl-root .akl-bar{position:fixed;left:50%;bottom:7vh;transform:translateX(-50%);
          width:min(320px,70vw);height:2px;background:rgba(255,255,255,.07);
          border-radius:2px;overflow:hidden}
        .akl-root .akl-bar i{display:block;height:100%;width:0%;
          background:linear-gradient(90deg,var(--a1),var(--a2));transition:width .3s linear}
        .akl-root .akl-caption{position:fixed;left:50%;bottom:calc(7vh + 14px);transform:translateX(-50%);
          color:#5b6675;font-size:10px;letter-spacing:.32em;text-indent:.32em;
          text-transform:uppercase;white-space:nowrap;transition:opacity .5s}
        .akl-root .akl-skip{position:fixed;right:24px;top:20px;color:#5b6675;font-size:10px;
          letter-spacing:.28em;text-transform:uppercase;background:none;border:none;
          cursor:pointer;font-family:inherit;padding:8px;transition:color .3s}
        .akl-root .akl-skip:hover{color:#eef1f7}
        .akl-root .akl-skip:focus-visible{outline:1px solid var(--a1);outline-offset:4px}
      `}</style>
      <canvas
        ref={canvasRef}
        className="akl-stage"
        aria-label="Loading animation: stars converge one by one into the Great Bear constellation, explode outward, and a probe draws the Akribeia mark through the debris"
      />
      <div ref={wordmarkRef} className="akl-wordmark">
        <h1>AKRIBEIA</h1>
        <p ref={sublabelRef} />
      </div>
      <div ref={captionRef} className="akl-caption">INITIALIZING</div>
      <div className="akl-bar"><i ref={barfillRef as React.RefObject<HTMLElement>} /></div>
      {/* SKIP is present from the first frame, not only at the end */}
      <button className="akl-skip" onClick={() => finish.current(SKIP_FADE_MS)}>skip →</button>
    </div>
  );
}
