import { ASSET, ENTITY, SEM } from "../theme";
// AI Bubble Watch graph engine — dependency-free. Deterministic force-directed
// layout + directed-cycle detection over the curated deal set. Renders ONLY from
// ai_deals.json; an edge without source_url AND date is rejected upstream.

export type DealType = "hardware_software" | "investment" | "services" | "venture_capital";
export interface Deal {
  id: string; from: string; to: string; type: DealType; value_usd_bn: number;
  date: string; source_url: string; note: string; value_approx?: boolean;
}
export interface AiDealsFile {
  as_of: string; market_values_usd_bn?: Record<string, number>; market_values_note?: string; deals: Deal[];
}

export const TYPE_META: Record<DealType, { label: string; color: string }> = {
  hardware_software: { label: "Hardware / Software", color: ASSET.btc },
  investment: { label: "Investment", color: SEM.pos },
  services: { label: "Services (cloud)", color: SEM.link },
  venture_capital: { label: "Venture Capital", color: ENTITY.auxo },
};

// Integrity gate: only deals with BOTH a source_url and a date may render.
export function validDeals(deals: Deal[]): Deal[] {
  return (deals ?? []).filter((d) => d.from && d.to && d.source_url && /^https?:\/\//.test(d.source_url) && d.date && d.type in TYPE_META);
}

export interface GraphNode { id: string; mv: number; degree: number; x: number; y: number; r: number }

// ── Directed-cycle detection ────────────────────────────────────────────────
// An edge u→v is "in a cycle" iff v can reach u via directed edges.
export function cycleEdgeIds(deals: Deal[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const d of deals) { if (!adj.has(d.from)) adj.set(d.from, []); adj.get(d.from)!.push(d.to); }
  const reaches = (start: string, target: string): boolean => {
    const seen = new Set<string>([start]); const stack = [...(adj.get(start) ?? [])];
    while (stack.length) { const n = stack.pop()!; if (n === target) return true; if (!seen.has(n)) { seen.add(n); for (const m of adj.get(n) ?? []) stack.push(m); } }
    return false;
  };
  const out = new Set<string>();
  for (const d of deals) if (reaches(d.to, d.from)) out.add(d.id);
  return out;
}

// Enumerate elementary directed cycles (node-name paths), bounded length, for display.
export function enumerateCycles(deals: Deal[], maxLen = 6): string[][] {
  const adj = new Map<string, string[]>();
  for (const d of deals) { if (!adj.has(d.from)) adj.set(d.from, []); adj.get(d.from)!.push(d.to); }
  const nodes = [...new Set(deals.flatMap((d) => [d.from, d.to]))];
  const found: string[][] = []; const seenKeys = new Set<string>();
  const canon = (cyc: string[]) => { // rotation-invariant key
    let best = cyc.join(">"); for (let i = 0; i < cyc.length; i++) { const r = [...cyc.slice(i), ...cyc.slice(0, i)].join(">"); if (r < best) best = r; } return best;
  };
  for (const start of nodes) {
    const stack: { node: string; path: string[] }[] = [{ node: start, path: [start] }];
    while (stack.length) {
      const { node, path } = stack.pop()!;
      if (path.length > maxLen) continue;
      for (const nxt of adj.get(node) ?? []) {
        if (nxt === start && path.length >= 2) {
          const key = canon(path); if (!seenKeys.has(key)) { seenKeys.add(key); found.push([...path]); }
        } else if (!path.includes(nxt) && nxt > start) { // nxt>start prunes rotations/dupes
          stack.push({ node: nxt, path: [...path, nxt] });
        }
      }
    }
  }
  return found.sort((a, b) => a.length - b.length);
}

// ── Deterministic force-directed layout ─────────────────────────────────────
export function forceLayout(deals: Deal[], mvLookup: Record<string, number>, W: number, H: number): GraphNode[] {
  const names = [...new Set(deals.flatMap((d) => [d.from, d.to]))];
  const degree = new Map<string, number>();
  for (const d of deals) { degree.set(d.from, (degree.get(d.from) ?? 0) + 1); degree.set(d.to, (degree.get(d.to) ?? 0) + 1); }
  const mvs = names.map((n) => mvLookup[n] ?? 0);
  const maxMv = Math.max(1, ...mvs);
  const radius = (mv: number) => 16 + 30 * Math.sqrt(mv / maxMv); // sqrt scale, 16–46px

  const cx = W / 2, cy = H / 2;
  // init on a circle (deterministic)
  const nodes: GraphNode[] = names.map((id, i) => {
    const a = (2 * Math.PI * i) / names.length;
    return { id, mv: mvLookup[id] ?? 0, degree: degree.get(id) ?? 0, x: cx + Math.cos(a) * H * 0.34, y: cy + Math.sin(a) * H * 0.34, r: radius(mvLookup[id] ?? 0) };
  });
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const edges = deals.map((d) => [idx.get(d.from)!, idx.get(d.to)!] as const);

  const REP = 42000, SPRING = 0.02, LEN = 165, GRAV = 0.015, DAMP = 0.85, STEP = 0.85;
  const vx = new Array(nodes.length).fill(0), vy = new Array(nodes.length).fill(0);
  for (let it = 0; it < 480; it++) {
    const fx = new Array(nodes.length).fill(0), fy = new Array(nodes.length).fill(0);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        let d2 = dx * dx + dy * dy; if (d2 < 1) d2 = 1; const d = Math.sqrt(d2);
        const f = REP / d2; fx[i] += (dx / d) * f; fy[i] += (dy / d) * f; fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f;
      }
      fx[i] += (cx - nodes[i].x) * GRAV; fy[i] += (cy - nodes[i].y) * GRAV;
    }
    for (const [a, b] of edges) {
      const dx = nodes[b].x - nodes[a].x, dy = nodes[b].y - nodes[a].y; const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = SPRING * (d - LEN); fx[a] += (dx / d) * f; fy[a] += (dy / d) * f; fx[b] -= (dx / d) * f; fy[b] -= (dy / d) * f;
    }
    for (let i = 0; i < nodes.length; i++) {
      vx[i] = (vx[i] + fx[i] * STEP) * DAMP; vy[i] = (vy[i] + fy[i] * STEP) * DAMP;
      nodes[i].x += vx[i]; nodes[i].y += vy[i];
      const pad = nodes[i].r + 8;
      nodes[i].x = Math.max(pad, Math.min(W - pad, nodes[i].x));
      nodes[i].y = Math.max(pad, Math.min(H - pad, nodes[i].y));
    }
  }
  return nodes;
}
