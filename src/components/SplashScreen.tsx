// ─────────────────────────────────────────────────────────────────────────────
// SplashScreen.tsx — the Akribeia entry cinematic.
//
// PORTED, NOT REWRITTEN, from the verified standalone `akribeia-loading-quant`
// page. The visual behavior and timing curve are byte-for-byte the same:
//   starfield → stars converge one-by-one into the Great Bear (pixel-traced
//   contour) → big-bang → the Droplet probe REVEALS the embedded mark through a
//   soft mask brush → wordmark.
//
// The final mark IS the PNG (src/assets/marks/*.png, decoded from the verified
// build). It is NEVER procedurally redrawn — three procedural attempts were
// rejected. Do not "simplify" drawReveal() into a path fill.
//
// React contract:
//   · canvas via ref (never getElementById)
//   · every mutable animation datum lives inside the effect closure — no module
//     -level state, so StrictMode's double-mount and any remount are clean
//   · the rAF id is captured and cancelAnimationFrame'd in cleanup
//   · the resize listener is added in the effect and removed in cleanup
//
// Shown once per browser SESSION (sessionStorage), blocking, above the app
// shell. Route/tab changes never remount it — it is not wired to any router.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND, SPLASH, alpha } from "../theme";
import markQuantUrl from "../assets/marks/quant-a.png";
import markAiUrl from "../assets/marks/ai-tri.png";

export const SPLASH_SEEN_KEY = "akribeia_splash_seen";

type Variant = "quant" | "ai";

/** Design space. Everything below is authored in these units and letterboxed. */
const DW = 1000;
const DH = 600;

const PHASES = [
  { name: "starfield", dur: 2200, cap: "INITIALIZING" },
  { name: "converge", dur: 5000, cap: "SIGNAL DETECTED" },
  { name: "bear", dur: 2600, cap: "URSA MAJOR" },
  { name: "bigbang", dur: 1400, cap: "REGIME CHANGE" },
  { name: "draw", dur: 4800, cap: "RESOLVING" },
  { name: "settle", dur: 2200, cap: "AKRIBEIA" },
] as const;
const TOTAL = PHASES.reduce((a, p) => a + p.dur, 0); // 18_200ms

// ── bear: contour traced from the reference artwork (do not re-derive) ────────
const BEARPOLY: [number, number][] = [[847.1,341.5],[817.4,301.8],[810.8,270.4],[782.7,239.0],[779.4,217.6],[751.3,220.9],[744.7,201.0],[711.7,206.0],[601.0,130.0],[551.4,130.0],[465.5,153.1],[364.7,151.5],[315.1,166.3],[255.7,204.3],[242.4,232.4],[239.1,275.4],[216.0,353.0],[212.7,405.9],[192.9,452.2],[192.9,475.3],[202.8,493.5],[217.7,498.4],[259.0,501.7],[285.4,496.8],[283.7,486.9],[260.6,465.4],[260.6,452.2],[292.0,422.4],[303.6,405.9],[316.8,405.9],[358.1,447.2],[373.0,467.0],[377.9,485.2],[389.5,493.5],[427.5,501.7],[453.9,501.7],[465.5,493.5],[478.7,490.2],[485.3,477.0],[498.5,477.0],[508.4,481.9],[538.2,486.9],[556.3,481.9],[556.3,473.7],[549.7,470.3],[549.7,462.1],[521.7,453.8],[520.0,439.0],[536.5,420.8],[541.5,420.8],[543.1,412.5],[554.7,397.7],[567.9,397.7],[614.2,452.2],[668.7,500.1],[690.2,508.3],[743.0,510.0],[756.3,503.4],[756.3,491.8],[744.7,490.2],[741.4,478.6],[726.5,473.7],[726.5,455.5],[701.7,453.8],[660.4,374.5],[657.1,351.4],[673.7,349.7],[698.4,363.0],[728.2,386.1],[741.4,389.4],[756.3,377.8],[769.5,377.8],[784.3,384.4],[799.2,386.1],[805.8,377.8],[840.5,356.3],[847.1,349.7]];
/** Constellation stars, with `o` = BFS arrival order along the graph. */
const DTGT: { x: number; y: number; o: number }[] = [{x:224.7,y:486.4,o:0},{x:259.8,y:170.3,o:6},{x:270.7,y:495.8,o:1},{x:277.9,y:379.2,o:2},{x:306.9,y:203.8,o:4},{x:394.8,y:471.1,o:7},{x:397.4,y:311.1,o:13},{x:399.1,y:217.9,o:3},{x:405.2,y:423.3,o:10},{x:453.2,y:316.8,o:11},{x:463.4,y:265.6,o:8},{x:474.1,y:222.3,o:5},{x:527.4,y:309.7,o:14},{x:554.1,y:226.0,o:9},{x:597.4,y:307.2,o:16},{x:620.7,y:366.2,o:18},{x:633.3,y:234.6,o:12},{x:665.5,y:435.5,o:20},{x:667.1,y:280.3,o:19},{x:671.1,y:465.5,o:21},{x:686.0,y:243.7,o:15},{x:705.7,y:497.4,o:23},{x:722.3,y:461.5,o:22},{x:738.5,y:258.4,o:17}];
const DLINES: [number, number][] = [[1,4],[4,7],[7,11],[11,13],[13,16],[16,20],[20,23],[23,18],[18,14],[14,12],[12,9],[6,9],[10,9],[11,10],[14,15],[15,19],[19,21],[15,17],[17,22],[4,5],[8,5],[7,3],[3,0],[0,2]];
const BEAR_CX = 542;
const BEAR_CY = 397;

/** Probe route geometry for the quant "a." — tuned to the embedded artwork. */
const QA = {
  cx: 540, cy: 303, r: 86,
  a0: 0.726, a1: 5.557,
  stemX: 598, stemTop: 205, stemBot: 390,
  dotX: 602, dotY: 404, dotR: 18,
};
/** Placement of each mark in design space (ring center lands on QA.cx/cy). */
const LP_QUANT = { x: 368, y: 116, w: 283, h: 345 };
const LP_AI = { x: 266, y: 60, w: 482, h: 462 };

// ── tiny math ────────────────────────────────────────────────────────────────
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const easeIO = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeO = (t: number) => 1 - Math.pow(1 - t, 3);
const hexRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
];

interface Particle {
  hx: number; hy: number; x: number; y: number; vx: number; vy: number;
  bx: number; by: number; lx: number; ly: number; lcol: [number, number, number];
  r: number; tw: number; tws: number; oi: number;
  conv: number; struck: number; boomed: boolean; boomA: number; boomS: number;
}
interface DStar {
  hx: number; hy: number; x: number; y: number; vx: number; vy: number;
  tx: number; ty: number; lx: number; ly: number; lcol: [number, number, number];
  start: number; landedAt: number; conv: number; struck: number;
  boomed: boolean; boomA: number; boomS: number;
}
interface Spark { x: number; y: number; vx: number; vy: number; life: number; col: string }
interface RoutePt { x: number; y: number; pen: number; tag?: string | null }
interface SamplePt { x: number; y: number; col: [number, number, number] }

function shouldSkipCinematic(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (window.sessionStorage.getItem(SPLASH_SEEN_KEY)) return true;
  } catch {
    /* private mode — fall through and just play it */
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function SplashScreen({
  variant = "quant",
  onDone,
}: {
  variant?: Variant;
  onDone?: () => void;
}) {
  const [visible, setVisible] = useState(() => !shouldSkipCinematic());
  const [exiting, setExiting] = useState(false);
  const [showSkip, setShowSkip] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wordmarkRef = useRef<HTMLDivElement | null>(null);
  const captionRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const exitTimer = useRef<number | null>(null);
  const skipRef = useRef<(() => void) | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  /** Begin the fade-out; unmount lands in the `!visible` effect below. */
  const finish = useCallback(() => {
    setExiting(true);
    exitTimer.current = window.setTimeout(() => setVisible(false), 520);
  }, []);

  // Single place that records "seen" and notifies the app — covers all three
  // exits: completed, skipped, and never-played (reduced-motion / repeat load).
  useEffect(() => {
    if (visible) return;
    try {
      window.sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    onDoneRef.current?.();
  }, [visible]);

  useEffect(() => () => { if (exitTimer.current) clearTimeout(exitTimer.current); }, []);

  // Lock body scroll only while the splash actually blocks the app.
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [visible]);

  // Reveal the skip affordance after a beat so it never competes with the open.
  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setShowSkip(true), 1500);
    return () => clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let cancelled = false;
    let imgOk = false;

    // ── viewport / letterbox ──────────────────────────────────────────────
    let W = 0, H = 0, S = 1, OX = 0, OY = 0, DPR = 1;
    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * DPR; canvas.height = H * DPR;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      S = Math.min(W / DW, H / DH);
      OX = (W - DW * S) / 2; OY = (H - DH * S) / 2;
    };
    resize();
    window.addEventListener("resize", resize);
    const vb = () => ({ x0: -OX / S, y0: -OY / S, x1: DW + OX / S, y1: DH + OY / S });

    // ── the mark ──────────────────────────────────────────────────────────
    const LIMG = new Image();
    const LP = variant === "ai" ? LP_AI : LP_QUANT;
    const drawLogoImage = (c: CanvasRenderingContext2D, a: number) => {
      if (!imgOk) return;
      c.save(); c.globalAlpha = a; c.drawImage(LIMG, LP.x, LP.y, LP.w, LP.h); c.restore();
    };

    const bearPath = (c: CanvasRenderingContext2D) => {
      c.beginPath();
      c.moveTo(BEARPOLY[0][0], BEARPOLY[0][1]);
      for (let i = 1; i < BEARPOLY.length; i++) c.lineTo(BEARPOLY[i][0], BEARPOLY[i][1]);
      c.closePath();
    };

    // ── probe route ───────────────────────────────────────────────────────
    let ROUTE: RoutePt[] = [];
    let EVENTS: { idx: number; type: string }[] = [];
    const pushLine = (x0: number, y0: number, x1: number, y1: number, pen: number, step = 4, tag: string | null = null) => {
      const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(d / step));
      for (let i = 1; i <= n; i++) ROUTE.push({ x: lerp(x0, x1, i / n), y: lerp(y0, y1, i / n), pen, tag });
    };
    const pushCurve = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, pen: number, step = 5) => {
      const n = Math.max(6, Math.ceil((Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy)) / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n, a = 1 - t;
        ROUTE.push({ x: a * a * x0 + 2 * a * t * cx + t * t * x1, y: a * a * y0 + 2 * a * t * cy + t * t * y1, pen });
      }
    };
    const pushArc = (cx: number, cy: number, r: number, a0: number, a1: number, pen: number, step = 4, tag: string | null = null) => {
      const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * r) / step));
      for (let i = 1; i <= n; i++) {
        const a = lerp(a0, a1, i / n);
        ROUTE.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), pen, tag });
      }
    };
    const buildRoute = () => {
      ROUTE = []; EVENTS = [];
      const b = vb();
      if (variant === "ai") {
        // serpentine scan-sweep: the mesh materializes row by row
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
        pushCurve(b.x0 - 90, 520, 260, 565, q.dotX, q.dotY, 0); // entry: dive to the dot
        EVENTS.push({ idx: ROUTE.length - 1, type: "dot" });
        const sx = q.cx + q.r * Math.cos(q.a0), sy = q.cy + q.r * Math.sin(q.a0);
        pushCurve(q.dotX, q.dotY, (q.dotX + sx) / 2 - 30, (q.dotY + sy) / 2, sx, sy, 0);
        pushArc(q.cx, q.cy, q.r, q.a0, q.a1, 1, 4, "ring"); // one path around the ring
        const ex = q.cx + q.r * Math.cos(q.a1), ey = q.cy + q.r * Math.sin(q.a1);
        pushCurve(ex, ey, (ex + q.stemX) / 2 + 8, (ey + q.stemTop) / 2 - 16, q.stemX, q.stemTop, 0);
        pushLine(q.stemX, q.stemTop, q.stemX, q.stemBot, 1, 4, "stem"); // double back down the stem
        pushCurve(q.stemX, q.stemBot, 700, 470, b.x1 + 120, 520, 0);
      }
    };

    // ── reveal mask: the probe's path uncovers the real logo ───────────────
    // NB: the mask canvases carry an ALPHA CHANNEL, not brand color — the
    // white below is a matte, which is why it isn't a theme token.
    const MASKC = document.createElement("canvas"); MASKC.width = DW; MASKC.height = DH;
    const MCTX = MASKC.getContext("2d")!;
    const COMPC = document.createElement("canvas"); COMPC.width = DW; COMPC.height = DH;
    const CCTX = COMPC.getContext("2d")!;
    let lastStamp = -1;
    const stampBrush = (x: number, y: number, r: number) => {
      const g = MCTX.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.6, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      MCTX.fillStyle = g; MCTX.beginPath(); MCTX.arc(x, y, r, 0, 7); MCTX.fill();
    };
    const stampTo = (idx: number) => {
      for (let i = Math.max(lastStamp + 1, 0); i <= idx && i < ROUTE.length; i++) {
        const p = ROUTE[i];
        if (p.pen) stampBrush(p.x, p.y, p.tag === "sweep" ? 60 : p.tag === "stem" ? 52 : 50);
      }
      lastStamp = idx;
    };
    const drawReveal = () => {
      if (!imgOk) return;
      CCTX.setTransform(1, 0, 0, 1, 0, 0);
      CCTX.clearRect(0, 0, DW, DH);
      CCTX.drawImage(LIMG, LP.x, LP.y, LP.w, LP.h);
      CCTX.globalCompositeOperation = "destination-in";
      CCTX.drawImage(MASKC, 0, 0);
      CCTX.globalCompositeOperation = "source-over";
      ctx.drawImage(COMPC, 0, 0);
    };

    // ── sampling: particles inherit the mark's own pixels ──────────────────
    const sample = (drawFn: (c: CanvasRenderingContext2D) => void, step: number): SamplePt[] => {
      const o = document.createElement("canvas"); o.width = DW; o.height = DH;
      const c = o.getContext("2d")!;
      drawFn(c);
      const d = c.getImageData(0, 0, DW, DH).data;
      const pts: SamplePt[] = [];
      for (let y = 0; y < DH; y += step) for (let x = 0; x < DW; x += step) {
        const i = (y * DW + x) * 4;
        if (d[i + 3] > 140) pts.push({ x: x + rand(-1.2, 1.2), y: y + rand(-1.2, 1.2), col: [d[i], d[i + 1], d[i + 2]] });
      }
      for (let i = pts.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[pts[i], pts[j]] = [pts[j], pts[i]]; }
      return pts;
    };
    const bearPts = sample((c) => { c.fillStyle = SPLASH.starCore; bearPath(c); c.fill(); }, 9);
    let logoPts: SamplePt[] = [];

    // ── world ──────────────────────────────────────────────────────────────
    let N = 600;
    const P: Particle[] = [];
    let SPARKS: Spark[] = [];
    let DSTARS: DStar[] = [];
    let eventCursor = 0;
    let TRAIL: { x: number; y: number }[] = [];
    let t0 = 0, done = false, lastPhase = -1;

    const initWorld = () => {
      P.length = 0; SPARKS = []; eventCursor = 0;
      lastStamp = -1; MCTX.setTransform(1, 0, 0, 1, 0, 0); MCTX.clearRect(0, 0, DW, DH);
      if (!logoPts.length) logoPts = sample((c) => drawLogoImage(c, 1), variant === "ai" ? 7 : 6);
      if (!logoPts.length) return false; // mark failed to decode — caller bails
      buildRoute();
      N = Math.min(1400, Math.max(600, ((W * H) / 1000) | 0));
      const b = vb();
      for (let i = 0; i < N; i++) {
        const bt = bearPts[i % bearPts.length], lt = logoPts[i % logoPts.length];
        const q: Particle = {
          hx: rand(b.x0, b.x1), hy: rand(b.y0, b.y1), x: 0, y: 0, vx: 0, vy: 0,
          bx: bt.x, by: bt.y, lx: lt.x, ly: lt.y, lcol: lt.col,
          r: rand(0.6, 1.8), tw: rand(0, Math.PI * 2), tws: rand(0.5, 2.2),
          oi: i / N, conv: 0, struck: -1, boomed: false,
          boomA: rand(0, Math.PI * 2), boomS: rand(60, 320) * (Math.random() < 0.12 ? 2.1 : 1),
        };
        q.x = q.hx; q.y = q.hy;
        P.push(q);
      }
      DSTARS = DTGT.map((t, k) => {
        const lt = logoPts[(k * 37) % logoPts.length];
        const s: DStar = {
          hx: rand(b.x0, b.x1), hy: rand(b.y0, b.y1), x: 0, y: 0, vx: 0, vy: 0,
          tx: t.x, ty: t.y, lx: lt.x, ly: lt.y, lcol: lt.col,
          start: 0.06 + t.o * (0.74 / DTGT.length),
          landedAt: -1, conv: 0, struck: -1, boomed: false,
          boomA: rand(0, Math.PI * 2), boomS: rand(120, 380),
        };
        s.x = s.hx; s.y = s.hy;
        return s;
      });
      return true;
    };

    const phaseAt = (el: number) => {
      let acc = 0;
      for (let i = 0; i < PHASES.length; i++) {
        if (el < acc + PHASES[i].dur) return { i, p: (el - acc) / PHASES[i].dur };
        acc += PHASES[i].dur;
      }
      return { i: PHASES.length - 1, p: 1 };
    };
    const beat = (el: number) => {
      const T = (el / 1150) % 1;
      const g = (m: number, s: number) => Math.exp(-((T - m) * (T - m)) / (2 * s * s));
      return g(0.08, 0.045) + 0.65 * g(0.26, 0.05);
    };
    const burst = (x: number, y: number, col: string, n: number) => {
      for (let k = 0; k < n; k++) {
        const a = rand(0, Math.PI * 2), s = rand(40, 260);
        SPARKS.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, col });
      }
    };
    const drawStar = (x: number, y: number, r: number, a: number, flare: boolean) => {
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (flare) {
        ctx.globalAlpha = a * 0.5; ctx.lineWidth = r * 0.3;
        ctx.beginPath();
        ctx.moveTo(x - r * 4, y); ctx.lineTo(x + r * 4, y);
        ctx.moveTo(x, y - r * 4); ctx.lineTo(x, y + r * 4); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const drawFinal = () => {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = SPLASH.bg; ctx.fillRect(0, 0, W, H);
      ctx.setTransform(S * DPR, 0, 0, S * DPR, OX * DPR, OY * DPR);
      drawLogoImage(ctx, 1);
    };

    const PB = hexRgb(SPLASH.particleBase);
    const STAR_RGB = hexRgb(SPLASH.star);

    const frame = (now: number) => {
      if (cancelled) return;
      const el = now - t0;
      const { i: pi, p } = phaseAt(el);
      const ph = PHASES[pi].name;
      if (pi !== lastPhase) { if (captionRef.current) captionRef.current.textContent = PHASES[pi].cap; lastPhase = pi; }
      if (barRef.current) barRef.current.style.width = (clamp(el / TOTAL, 0, 1) * 100).toFixed(1) + "%";
      const tsec = el / 1000, dt = 1 / 60;

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = SPLASH.bg; ctx.fillRect(0, 0, W, H);
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, alpha("#080D16", 0)); vg.addColorStop(1, alpha("#000000", 0.55));
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      ctx.setTransform(S * DPR, 0, 0, S * DPR, OX * DPR, OY * DPR);

      const b = beat(el);

      // bear glow
      let bearGlow = 0;
      if (ph === "converge") bearGlow = 0.14 * easeIO(p);
      if (ph === "bear") bearGlow = easeO(clamp(p * 2, 0, 1));
      if (ph === "bigbang") bearGlow = Math.max(0, 1 - p * 3.2);
      if (bearGlow > 0) {
        ctx.save();
        const bg = ctx.createLinearGradient(220, 150, 890, 490);
        bg.addColorStop(0, alpha(SPLASH.bearPink, 0.36));
        bg.addColorStop(0.5, alpha(SPLASH.bearViolet, 0.32));
        bg.addColorStop(1, alpha(SPLASH.bearBlue, 0.26));
        ctx.globalAlpha = bearGlow; ctx.fillStyle = bg; bearPath(ctx); ctx.fill();
        ctx.strokeStyle = alpha(SPLASH.bearEdge, 0.6); ctx.lineWidth = 1.6;
        ctx.shadowColor = alpha(SPLASH.bearHalo, 0.9); ctx.shadowBlur = 26 * bearGlow;
        ctx.stroke(); ctx.restore();
      }

      // constellation stars: one-by-one arrivals
      const cvP = ph === "converge" ? p : pi > 1 ? 1 : 0;
      if (pi >= 1 && pi <= 2) {
        for (const s of DSTARS) {
          const f = clamp((cvP - s.start) / 0.2, 0, 1);
          if (f >= 1 && s.landedAt < 0) s.landedAt = el;
          const e = easeIO(f);
          s.x = lerp(s.hx, s.tx, e); s.y = lerp(s.hy, s.ty, e);
          if (f >= 1) { s.x = s.tx + Math.sin(tsec * 2 + s.start * 40) * 0.8; s.y = s.ty + Math.cos(tsec * 1.7 + s.start * 40) * 0.8; }
        }
        ctx.save();
        ctx.strokeStyle = alpha(SPLASH.starLine, 0.85); ctx.lineWidth = 1.4;
        ctx.shadowColor = alpha(SPLASH.starCore, 0.75); ctx.shadowBlur = 6;
        for (const [a, c2] of DLINES) {
          const A = DSTARS[a], B = DSTARS[c2];
          if (A.landedAt < 0 || B.landedAt < 0) continue;
          const lp = clamp((el - Math.max(A.landedAt, B.landedAt)) / 320, 0, 1);
          ctx.beginPath(); ctx.moveTo(A.x, A.y);
          ctx.lineTo(lerp(A.x, B.x, lp), lerp(A.y, B.y, lp)); ctx.stroke();
        }
        for (const s of DSTARS) {
          const inFlight = s.landedAt < 0 && cvP > s.start;
          ctx.fillStyle = SPLASH.starCore; ctx.strokeStyle = SPLASH.starCore;
          if (inFlight) {
            drawStar(s.x, s.y, 3.4, 1, true);
            ctx.globalAlpha = 0.35; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(s.hx, s.hy); ctx.lineTo(s.x, s.y); ctx.stroke();
            ctx.globalAlpha = 1;
          } else if (s.landedAt > 0) {
            const since = (el - s.landedAt) / 520;
            drawStar(s.x, s.y, 3.4 + 0.9 * Math.sin(tsec * 3 + s.tx), 0.95, true);
            if (since < 1) {
              ctx.globalAlpha = (1 - since) * 0.8; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.arc(s.tx, s.ty, 4 + since * 22, 0, 7); ctx.stroke();
              ctx.globalAlpha = 1;
            }
          }
        }
        ctx.restore();
      }

      // background particles
      for (const q of P) {
        if (ph === "starfield") {
          q.x = q.hx + Math.sin(tsec * 0.3 + q.tw) * 2; q.y = q.hy + Math.cos(tsec * 0.25 + q.tw) * 2;
        } else if (ph === "converge") {
          const st = 0.18 + q.oi * 0.62, f = clamp((p - st) / 0.16, 0, 1), e = easeO(f);
          const x = lerp(q.hx, q.bx, e), y = lerp(q.hy, q.by, e);
          const sq = 1 - 0.045 * b * e;
          q.x = BEAR_CX + (x - BEAR_CX) * sq; q.y = BEAR_CY + (y - BEAR_CY) * sq;
        } else if (ph === "bear") {
          const sq = 1 - 0.02 * b;
          q.x = BEAR_CX + (q.bx - BEAR_CX) * sq + Math.sin(tsec * 1.6 + q.tw) * 1.0;
          q.y = BEAR_CY + (q.by - BEAR_CY) * sq + Math.cos(tsec * 1.4 + q.tw) * 1.0;
        } else if (ph === "bigbang") {
          if (!q.boomed) { q.boomed = true; q.vx = Math.cos(q.boomA) * q.boomS; q.vy = Math.sin(q.boomA) * q.boomS; }
          q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.985; q.vy *= 0.985;
        } else if (ph === "draw") {
          if (q.struck < 0) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.99; q.vy *= 0.99; }
          else {
            const since = (el - q.struck) / 1000;
            if (since < 0.28) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; }
            else {
              q.conv = clamp(q.conv + 0.04, 0, 1);
              const k = 0.09 + 0.13 * q.conv;
              q.vx += (q.lx - q.x) * k; q.vy += (q.ly - q.y) * k;
              q.vx *= 0.82; q.vy *= 0.82; q.x += q.vx * 0.14; q.y += q.vy * 0.14;
            }
          }
        } else {
          if (q.struck < 0) { q.struck = el; q.conv = 0.0001; burst(q.x, q.y, `rgb(${q.lcol})`, 1); }
          q.conv = clamp(q.conv + 0.05, 0, 1);
          q.vx += (q.lx - q.x) * 0.2; q.vy += (q.ly - q.y) * 0.2;
          q.vx *= 0.76; q.vy *= 0.76; q.x += q.vx * 0.16; q.y += q.vy * 0.16;
        }
      }

      // constellation stars join the debris after the bang
      if (pi >= 3) {
        for (const s of DSTARS) {
          if (ph === "bigbang") {
            if (!s.boomed) { s.boomed = true; s.vx = Math.cos(s.boomA) * s.boomS; s.vy = Math.sin(s.boomA) * s.boomS; }
            s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.985; s.vy *= 0.985;
          } else if (s.struck < 0) {
            if (ph === "settle") { s.struck = el; s.conv = 0.0001; }
            s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.99; s.vy *= 0.99;
          } else {
            s.conv = clamp(s.conv + 0.04, 0, 1);
            s.vx += (s.lx - s.x) * 0.16; s.vy += (s.ly - s.y) * 0.16;
            s.vx *= 0.8; s.vy *= 0.8; s.x += s.vx * 0.15; s.y += s.vy * 0.15;
          }
          const col = s.struck < 0 ? SPLASH.starCore : `rgb(${s.lcol})`;
          ctx.fillStyle = col; ctx.strokeStyle = col;
          drawStar(s.x, s.y, 3.2, 0.95, true);
        }
      }

      // render background particles
      for (const q of P) {
        const twk = 0.55 + 0.45 * Math.sin(tsec * q.tws + q.tw);
        let col: string, a: number;
        if (q.conv > 0) {
          const c = q.lcol, m = q.conv;
          col = `rgb(${lerp(PB[0], c[0], m) | 0},${lerp(PB[1], c[1], m) | 0},${lerp(PB[2], c[2], m) | 0})`;
          a = 0.55 + 0.45 * m;
        } else {
          col = `rgb(${STAR_RGB[0]},${STAR_RGB[1]},${STAR_RGB[2]})`;
          a = 0.35 + 0.5 * twk;
        }
        ctx.fillStyle = col;
        drawStar(q.x, q.y, q.r * (q.conv > 0 ? 1.3 : 1), a, false);
      }

      // sparks
      for (let i = SPARKS.length - 1; i >= 0; i--) {
        const s = SPARKS[i];
        s.life -= dt * 2.1;
        if (s.life <= 0) { SPARKS.splice(i, 1); continue; }
        s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.94; s.vy *= 0.94;
        ctx.fillStyle = s.col; ctx.globalAlpha = s.life;
        ctx.beginPath(); ctx.arc(s.x, s.y, 1.6 * s.life + 0.4, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // big-bang flash (a light blowout, not a brand color)
      if (ph === "bigbang" && p < 0.5) {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.fillStyle = `rgba(255,255,255,${(1 - p * 2) * 0.9})`; ctx.fillRect(0, 0, W, H);
        ctx.setTransform(S * DPR, 0, 0, S * DPR, OX * DPR, OY * DPR);
      }

      // the Droplet reveals the mark
      if (ph === "draw" || ph === "settle") {
        const drawP = ph === "draw" ? easeIO(p) : 1;
        const idx = Math.min(ROUTE.length - 1, Math.floor(drawP * (ROUTE.length - 1)));

        stampTo(idx); drawReveal();

        if (ph === "draw") {
          const head = ROUTE[idx];
          while (eventCursor < EVENTS.length && idx >= EVENTS[eventCursor].idx) {
            if (EVENTS[eventCursor].type === "dot") {
              // the dot is punched into the mask early, then burst-lit
              stampBrush(QA.dotX, QA.dotY, 46);
              burst(QA.dotX, QA.dotY, SPLASH.dot, 8);
              burst(QA.dotX, QA.dotY, SPLASH.starCore, 5);
            }
            eventCursor++;
          }
          const R2 = 36 * 36;
          const hit = (o: Particle | DStar) => {
            const dx = o.x - head.x, dy = o.y - head.y;
            if (dx * dx + dy * dy < R2) {
              o.struck = el; o.conv = 0.0001;
              o.vx = rand(-120, 120); o.vy = rand(-120, 120);
              burst(o.x, o.y, `rgb(${o.lcol})`, 3);
              burst(o.x, o.y, SPLASH.sparkWarm, 2);
            }
          };
          for (const q of P) if (q.struck < 0) hit(q);
          for (const s of DSTARS) if (s.struck < 0) hit(s);

          TRAIL.push({ x: head.x, y: head.y });
          if (TRAIL.length > 36) TRAIL.shift();
          ctx.save(); ctx.lineCap = "round";
          for (let i = 1; i < TRAIL.length; i++) {
            const f = i / TRAIL.length;
            ctx.strokeStyle = alpha(SPLASH.trail, f * 0.65); ctx.lineWidth = 0.5 + f * 3.4;
            ctx.shadowColor = alpha(SPLASH.trailHalo, 0.8); ctx.shadowBlur = 8 * f;
            ctx.beginPath(); ctx.moveTo(TRAIL[i - 1].x, TRAIL[i - 1].y);
            ctx.lineTo(TRAIL[i].x, TRAIL[i].y); ctx.stroke();
          }
          ctx.restore();

          const prev = ROUTE[Math.max(0, idx - 3)];
          const ang = Math.atan2(head.y - prev.y, head.x - prev.x);
          ctx.save();
          ctx.translate(head.x, head.y); ctx.rotate(ang + Math.PI / 2);
          const dg = ctx.createRadialGradient(-4, 4, 2, 0, 0, 28);
          dg.addColorStop(0, SPLASH.probeHot); dg.addColorStop(0.35, SPLASH.probeMid);
          dg.addColorStop(0.75, SPLASH.probeCool); dg.addColorStop(1, SPLASH.probeDeep);
          ctx.fillStyle = dg;
          ctx.beginPath();
          ctx.moveTo(0, -40);
          ctx.bezierCurveTo(13, -14, 15, 0, 15, 8);
          ctx.arc(0, 8, 15, 0, Math.PI);
          ctx.bezierCurveTo(-15, 0, -13, -14, 0, -40);
          ctx.fill();
          ctx.fillStyle = alpha(SPLASH.probeHot, 0.9);
          ctx.beginPath(); ctx.ellipse(-5, -2, 2.4, 7, -0.35, 0, 7); ctx.fill();
          ctx.restore();
        } else {
          TRAIL = [];
          const la = easeO(clamp(p / 0.7, 0, 1));
          drawLogoImage(ctx, la);
          if (p > 0.3 && wordmarkRef.current) wordmarkRef.current.style.opacity = "1";
          if (p >= 1 && !done) { done = true; if (captionRef.current) captionRef.current.style.opacity = "0"; }
        }
      }

      if (!(done && el > TOTAL + 600)) raf = requestAnimationFrame(frame);
      else { drawFinal(); finish(); }
    };

    const start = () => {
      if (!initWorld()) { finish(); return; }
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
    };

    // The probe can be skipped at any point: freeze on the final mark and exit.
    skipRef.current = () => {
      if (cancelled) return;
      cancelAnimationFrame(raf);
      cancelled = true;
      if (imgOk) drawFinal();
      finish();
    };

    LIMG.onload = () => { if (cancelled) return; imgOk = true; start(); };
    LIMG.onerror = () => { if (cancelled) return; finish(); }; // never block on a missing mark
    LIMG.src = variant === "ai" ? markAiUrl : markQuantUrl;

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      LIMG.onload = null; LIMG.onerror = null;
      skipRef.current = null;
    };
  }, [visible, variant, finish]);

  if (!visible) return null;

  const sublabel =
    variant === "ai"
      ? (<>AI &amp; <em style={{ fontStyle: "normal", background: `linear-gradient(90deg, ${BRAND.coral}, ${BRAND.magenta})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>DATA SCIENCE</em></>)
      : (<>QUANTITATIVE <em style={{ fontStyle: "normal", color: BRAND.coral }}>ANALYSIS</em></>);

  return (
    <div
      role="status"
      aria-label="Loading Akribeia"
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: SPLASH.bg,
        opacity: exiting ? 0 : 1,
        transition: "opacity 500ms ease",
        fontFamily: '"Avenir Next","Segoe UI",system-ui,sans-serif',
      }}
    >
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, display: "block" }} />

      <div
        ref={wordmarkRef}
        style={{
          position: "fixed", left: "50%", top: "50%",
          transform: "translate(-50%,-50%) translateY(180px)",
          textAlign: "center", opacity: 0, transition: "opacity 1.6s ease",
          pointerEvents: "none",
        }}
      >
        <h1 style={{ color: BRAND.wordmark, fontWeight: 500, fontSize: "clamp(24px,3.6vw,36px)", letterSpacing: ".42em", textIndent: ".42em", margin: 0 }}>
          AKRIBEIA
        </h1>
        <p style={{ color: "#5B6675", fontWeight: 500, fontSize: "clamp(10px,1.2vw,13px)", letterSpacing: ".5em", textIndent: ".5em", marginTop: 10 }}>
          {sublabel}
        </p>
      </div>

      <div
        ref={captionRef}
        style={{
          position: "fixed", left: "50%", bottom: "calc(7vh + 14px)", transform: "translateX(-50%)",
          color: "#5B6675", fontSize: 10, letterSpacing: ".32em", textIndent: ".32em",
          textTransform: "uppercase", whiteSpace: "nowrap", transition: "opacity .5s",
        }}
      >
        INITIALIZING
      </div>

      <div
        style={{
          position: "fixed", left: "50%", bottom: "7vh", transform: "translateX(-50%)",
          width: "min(320px,70vw)", height: 2, background: "rgba(255,255,255,.07)",
          borderRadius: 2, overflow: "hidden",
        }}
      >
        <div ref={barRef} style={{ display: "block", height: "100%", width: "0%", background: `linear-gradient(90deg, ${BRAND.coral}, ${BRAND.magenta})`, transition: "width .3s linear" }} />
      </div>

      <button
        type="button"
        onClick={() => skipRef.current?.()}
        style={{
          position: "fixed", left: "50%", bottom: "3vh", transform: "translateX(-50%)",
          color: "#5B6675", fontSize: 10, letterSpacing: ".28em", textTransform: "uppercase",
          background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
          opacity: showSkip && !exiting ? 0.8 : 0,
          pointerEvents: showSkip && !exiting ? "auto" : "none",
          transition: "opacity .8s",
        }}
      >
        Skip
      </button>
    </div>
  );
}
