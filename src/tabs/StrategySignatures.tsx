import { useEffect, useRef, useState } from "react";
import { Card, Spinner } from "../components/ui";

// The five strategies as LIVING, animated signatures — each motif built from the Greek meaning of
// the name, driven by the strategy's REAL data (posteriors / equity curve / holdings). Canvas + rAF,
// paused off-screen via IntersectionObserver so the page stays light.
const BASE = `${import.meta.env.BASE_URL}data`;

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function bez(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, u: number) {
  const m = 1 - u;
  const a = m * m * m, b = 3 * m * m * u, c = 3 * m * u * u, d = u * u * u;
  return { x: a * x0 + b * x1 + c * x2 + d * x3, y: a * y0 + b * y1 + c * y2 + d * y3 };
}

type Motif = "focus" | "ridge" | "living" | "inflow" | "foresight";
interface Theme {
  key: string; label: string; greek: string; meaning: string;
  accent: string; bright: string; rgb: [number, number, number]; file: string; kind: "c78q" | "quant"; motif: Motif;
}
const THEMES: Theme[] = [
  { key: "katalepsis", label: "Katalepsis", greek: "κατάληψις", meaning: "the certain grasp", accent: "#6FD6E8", bright: "#BFF0FF", rgb: [111, 214, 232], file: "c78q.json", kind: "c78q", motif: "focus" },
  { key: "aristeia", label: "Aristeia", greek: "ἀριστεία", meaning: "the heroic peak", accent: "#F0C46A", bright: "#FFE3A6", rgb: [240, 196, 106], file: "aristeia_strategy.json", kind: "quant", motif: "ridge" },
  { key: "auxo", label: "Auxo", greek: "Αὐξώ", meaning: "growth, increase", accent: "#5FD38A", bright: "#A6F0C4", rgb: [95, 211, 138], file: "auxo_strategy.json", kind: "quant", motif: "living" },
  { key: "prosodos", label: "Prosodos", greek: "πρόσοδος", meaning: "the inflow", accent: "#46C7B8", bright: "#86E6D8", rgb: [70, 199, 184], file: "prosodos_strategy.json", kind: "quant", motif: "inflow" },
  { key: "pronoia", label: "Pronoia", greek: "πρόνοια", meaning: "foresight", accent: "#9B8CFF", bright: "#C7BCFF", rgb: [155, 140, 255], file: "pronoia_strategy.json", kind: "quant", motif: "foresight" },
];

interface SData { values: number[]; holdings: { t: string; w: number }[]; cagr: number; sharpe: number }

function extract(theme: Theme, d: any): SData | null {
  try {
    if (theme.kind === "c78q") {
      const s = (d.backtest?.summary ?? []) as any[];
      const values = s.map((r) => r.cum_strat).filter((v: any) => typeof v === "number");
      const holdings = ((d.target?.rows ?? []) as any[]).map((r) => ({ t: r.ticker, w: r.posterior_prob ?? 0.5 }));
      const bt = d.metrics?.backtest ?? {};
      return { values, holdings, cagr: (bt.net_cagr ?? NaN) * 100, sharpe: bt.sharpe ?? NaN };
    }
    const ec = (d.equity_curve ?? []) as any[];
    const values = ec.map((r) => r.equity).filter((v: any) => typeof v === "number");
    const holdings = ((d.current_holdings?.tickers ?? []) as string[]).map((t) => ({ t, w: 1 }));
    const m = d.metrics?.in_sample ?? {};
    return { values, holdings, cagr: m.cagr ?? NaN, sharpe: m.sharpe ?? NaN };
  } catch {
    return null;
  }
}

const PAD = { l: 10, r: 10, t: 16, b: 14 };

function AnimatedSignature({ theme, data }: { theme: Theme; data: SData }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvsRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = cvsRef.current, wrap = wrapRef.current;
    if (!cvs || !wrap) return;
    const ctx = cvs.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const H = 104;
    let W = wrap.clientWidth || 320;
    const resize = () => {
      W = wrap.clientWidth || 320;
      cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + "px"; cvs.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrap);
    const [r, g, b] = theme.rgb;
    const A = (a: number) => `rgba(${r},${g},${b},${a})`;

    // ── normalized curve geometry (log equity) ──
    const v = data.values.length ? data.values.map((z) => Math.max(1e-6, z)) : [1, 1];
    const L = v.map((z) => Math.log10(z));
    const lo = Math.min(...L), hi = Math.max(...L), rng = hi - lo || 1, N = L.length;
    const norm = L.map((z, i) => ({ fx: N > 1 ? i / (N - 1) : 0, fy: (z - lo) / rng }));
    const xEndF = theme.motif === "foresight" ? 0.72 : 1;
    const px = () => norm.map((p) => ({ x: PAD.l + (W - PAD.l - PAD.r) * xEndF * p.fx, y: H - PAD.b - (H - PAD.t - PAD.b) * p.fy }));
    // apex indices (peak per quarter of the series)
    const apex: number[] = [];
    const bk = Math.max(1, Math.floor(N / 4));
    for (let k = 0; k < 4; k++) {
      let bi = k * bk, bv = -1;
      for (let i = k * bk; i < (k === 3 ? N : (k + 1) * bk); i++) if (norm[i] && norm[i].fy > bv) { bv = norm[i].fy; bi = i; }
      apex.push(bi);
    }
    const leafI = [0.2, 0.4, 0.6, 0.78, 0.92].map((f) => Math.round(f * (N - 1)));

    // focus motif: conviction normalization + drifting uncertainty cloud
    const ws = data.holdings.map((h) => h.w);
    const wmin = Math.min(...ws, 0), wmax = Math.max(...ws, 1);
    const rnd = mulberry32(theme.key.length * 911 + 17);
    const cloud = Array.from({ length: 16 }, () => ({ a: rnd() * 6.2832, r: 0.45 + rnd() * 0.6, sp: 0.15 + rnd() * 0.5 }));

    let raf = 0;
    const t0 = performance.now();

    const line = (pts: { x: number; y: number }[], alpha: number, lw: number) => {
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = A(alpha); ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
    };
    const fillArea = (pts: { x: number; y: number }[], alpha: number) => {
      ctx.beginPath(); ctx.moveTo(pts[0].x, H - PAD.b); pts.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts[pts.length - 1].x, H - PAD.b); ctx.closePath(); ctx.fillStyle = A(alpha); ctx.fill();
    };
    const glow = (x: number, y: number, rad: number, a: number) => {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, A(a)); gr.addColorStop(1, A(0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832); ctx.fill();
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      try {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);

      if (theme.motif === "focus") {
        const cx = W * 0.5, cy = H * 0.5 + 1;
        [33, 21, 11].forEach((rr, i) => { ctx.strokeStyle = A(0.08 + i * 0.05); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.2832); ctx.stroke(); });
        ctx.strokeStyle = A(0.07); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 42, cy); ctx.lineTo(cx + 42, cy); ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy + 30); ctx.stroke();
        const pp = (t % 3) / 3, pr = 4 + pp * 42;
        ctx.strokeStyle = A(0.45 * (1 - pp)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, pr, 0, 6.2832); ctx.stroke();
        cloud.forEach((c) => { const ang = c.a + t * c.sp * 0.35; const R = 20 + c.r * 22; const x = cx + Math.cos(ang) * R * 1.5, y = cy + Math.sin(ang) * R; ctx.fillStyle = A(0.13); ctx.beginPath(); ctx.arc(x, y, 1.2, 0, 6.2832); ctx.fill(); });
        data.holdings.slice(0, 6).forEach((h, i) => {
          const conv = Math.max(0, Math.min(1, (h.w - wmin) / (wmax - wmin || 1)));
          const tr = 8 + (1 - conv) * 30, ang = (i / Math.max(1, data.holdings.length)) * 6.2832 + t * 0.22;
          const x = cx + Math.cos(ang) * tr * 1.45, y = cy + Math.sin(ang) * tr;
          const near = 1 - Math.min(1, Math.abs(pr - Math.hypot(x - cx, y - cy)) / 9);
          const sz = 2.2 + conv * 2.4;
          glow(x, y, 7, 0.22 * near); ctx.fillStyle = A(0.55 + 0.45 * near); ctx.beginPath(); ctx.arc(x, y, sz, 0, 6.2832); ctx.fill();
          if (i < 3) { ctx.fillStyle = `rgba(230,234,240,${0.55 + 0.4 * near})`; ctx.font = "600 9px ui-sans-serif,system-ui"; ctx.textAlign = "left"; ctx.fillText(h.t, x + sz + 3, y + 3); }
        });
        ctx.fillStyle = theme.bright; ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, 6.2832); ctx.fill();
      } else if (theme.motif === "inflow") {
        const pts2 = px(); void pts2;
        const bx = W - PAD.r - 8, by = H * 0.5;
        const src = data.holdings.slice(0, 6);
        const sy = (i: number) => PAD.t + (H - PAD.t - PAD.b) * (src.length > 1 ? i / (src.length - 1) : 0.5);
        src.forEach((h, i) => {
          const y0 = sy(i);
          ctx.strokeStyle = A(0.2); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(PAD.l + 2, y0); ctx.bezierCurveTo(W * 0.42, y0, W * 0.5, by, bx, by); ctx.stroke();
          for (let k = 0; k < 3; k++) { const u = ((t * 0.4) + i * 0.13 + k / 3) % 1; const p = bez(PAD.l + 2, y0, W * 0.42, y0, W * 0.5, by, bx, by, u); ctx.fillStyle = A(0.4 + 0.5 * (1 - Math.abs(u - 0.5) * 2)); ctx.beginPath(); ctx.arc(p.x, p.y, 1.7, 0, 6.2832); ctx.fill(); }
          ctx.fillStyle = "rgba(200,207,218,0.65)"; ctx.font = "600 8px ui-sans-serif,system-ui"; ctx.textAlign = "left"; ctx.fillText(h.t, PAD.l + 2, y0 - 3);
        });
        const pulse = 0.5 + 0.5 * Math.sin(t * 3);
        glow(bx, by, 14 + pulse * 3, 0.4); ctx.strokeStyle = A(0.85); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(bx, by, 7, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = theme.bright; ctx.beginPath(); ctx.arc(bx, by, 2.4, 0, 6.2832); ctx.fill();
      } else {
        const pts = px();
        fillArea(pts, theme.motif === "ridge" ? 0.11 : 0.08);
        line(pts, 0.85, 1.7);
        const last = pts[pts.length - 1];
        if (theme.motif === "ridge") {
          const tp = (t % 4) / 4, gi = Math.floor(tp * (pts.length - 1)), gp = pts[gi];
          glow(gp.x, gp.y, 11, 0.7); ctx.fillStyle = theme.bright; ctx.beginPath(); ctx.arc(gp.x, gp.y, 2.4, 0, 6.2832); ctx.fill();
          apex.forEach((ai, k) => { const p = pts[ai]; const fl = Math.max(0, 1 - ((t * 0.6 + k * 0.5) % 1) * 2); ctx.fillStyle = A(0.3 + 0.55 * fl); ctx.beginPath(); ctx.arc(p.x, p.y, 2 + 2.4 * fl, 0, 6.2832); ctx.fill(); });
        } else if (theme.motif === "living") {
          leafI.forEach((li, i) => { const base = pts[li]; if (!base) return; const sway = Math.sin(t * 1.2 + i) * 2; const x = base.x + (i % 2 ? 9 : -9) + sway, y = base.y - 9; const grow = 0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.3); ctx.strokeStyle = A(0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(x, y); ctx.stroke(); ctx.fillStyle = theme.bright; ctx.beginPath(); ctx.arc(x, y, 1.5 + 1.5 * grow, 0, 6.2832); ctx.fill(); });
          const sp = (t % 3) / 3, si = Math.floor(sp * (pts.length - 1)), spp = pts[si]; glow(spp.x, spp.y, 8, 0.4); ctx.fillStyle = theme.bright; ctx.beginPath(); ctx.arc(spp.x, spp.y, 2, 0, 6.2832); ctx.fill();
        } else if (theme.motif === "foresight") {
          const xR = W - PAD.r, xMid = last.x, yMid = last.y;
          const k = Math.max(2, Math.round(N / 4)); const sl = (pts[N - 1].y - pts[N - 1 - k].y) / ((pts[N - 1].x - pts[N - 1 - k].x) || 1);
          const med = Math.max(PAD.t, Math.min(H - PAD.b, yMid + sl * (xR - xMid)));
          ctx.beginPath(); ctx.moveTo(xMid, yMid); ctx.lineTo(xR, med - 22); ctx.lineTo(xR, med + 20); ctx.closePath(); ctx.fillStyle = A(0.12); ctx.fill();
          ctx.strokeStyle = A(0.28); ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xMid, PAD.t - 2); ctx.lineTo(xMid, H - PAD.b); ctx.stroke(); ctx.setLineDash([]);
          const period = 4, ph = (t % period) / period;
          if (ph < 0.58) { const sx = PAD.l + (xMid - PAD.l) * (ph / 0.58); ctx.strokeStyle = A(0.5); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx, PAD.t - 2); ctx.lineTo(sx, H - PAD.b); ctx.stroke(); glow(sx, yMid, 6, 0.3); }
          else { const fp = (ph - 0.58) / 0.42; ctx.strokeStyle = theme.bright; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(xMid, yMid); ctx.lineTo(xMid + (xR - xMid) * fp, yMid + (med - yMid) * fp); ctx.stroke(); ctx.setLineDash([]); [0.45, 0.72, 1].forEach((f) => { if (fp >= f - 0.05) { const x = xMid + (xR - xMid) * f, y = yMid + (med - yMid) * f; glow(x, y, 6, 0.5); ctx.fillStyle = theme.bright; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 6.2832); ctx.fill(); } }); }
          ctx.fillStyle = A(0.9); ctx.font = "600 8px ui-sans-serif,system-ui"; ctx.textAlign = "end"; ctx.fillText("+12mo ↗", xR, med - 6);
        }
      }
      } catch (e) { console.error("SIGERR", theme.key, (e as any)?.message, (e as any)?.stack?.split("\n")[1]); cancelAnimationFrame(raf); }
    };
    draw(performance.now()); // paint an immediate first frame (rAF is throttled when the tab is hidden)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [data, theme]);

  return <div ref={wrapRef} className="mt-1 w-full"><canvas ref={cvsRef} /></div>;
}

function SignatureCard({ theme, data }: { theme: Theme; data: SData }) {
  const cagr = isNaN(data.cagr) ? "—" : `${data.cagr.toFixed(1)}%`;
  const sharpe = isNaN(data.sharpe) ? "—" : data.sharpe.toFixed(2);
  return (
    <div className="overflow-hidden rounded-lg border bg-[#0A0E16] p-3" style={{ borderColor: `${theme.accent}40` }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-[#E6EAF0]">{theme.label} <span className="ml-1 text-[11px] font-normal" style={{ color: theme.accent }}>{theme.greek}</span></div>
          <div className="text-[10px]" style={{ color: theme.accent }}>{theme.meaning}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-base font-bold" style={{ color: theme.accent }}>{cagr}</div>
          <div className="text-[10px] text-[#7C879B]">Sharpe {sharpe}</div>
        </div>
      </div>
      <AnimatedSignature theme={theme} data={data} />
    </div>
  );
}

export default function StrategySignatures() {
  const [sigs, setSigs] = useState<Record<string, SData> | null>(null);
  useEffect(() => {
    Promise.all(
      THEMES.map((t) => fetch(`${BASE}/${t.file}`).then((r) => (r.ok ? r.json() : null)).then((d) => [t.key, d ? extract(t, d) : null] as const).catch(() => [t.key, null] as const))
    ).then((pairs) => {
      const out: Record<string, SData> = {};
      pairs.forEach(([k, s]) => { if (s) out[k] = s; });
      setSigs(out);
    });
  }, []);

  return (
    <Card title="✦ Strategy signatures" sub="Each strategy as a living motif built from the Greek meaning of its name — driven by its real data (posteriors / equity curve / holdings). CAGR & Sharpe from the backtest.">
      {!sigs ? (
        <Spinner label="Loading signatures…" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {THEMES.filter((t) => sigs[t.key]).map((t) => <SignatureCard key={t.key} theme={t} data={sigs[t.key]} />)}
        </div>
      )}
    </Card>
  );
}
