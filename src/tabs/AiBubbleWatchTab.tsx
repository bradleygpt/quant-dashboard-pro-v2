import { useEffect, useMemo, useState } from "react";
import { Card, Spinner, Unavailable } from "../components/ui";
import {
  TYPE_META, validDeals, forceLayout, cycleEdgeIds, enumerateCycles,
  type AiDealsFile, type Deal, type DealType,
} from "../lib/aiGraph";

const BASE = `${import.meta.env.BASE_URL}data`;
const W = 940, H = 580;
const TYPES = Object.keys(TYPE_META) as DealType[];

export default function AiBubbleWatchTab() {
  const [data, setData] = useState<AiDealsFile | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { fetch(`${BASE}/ai_deals.json`).then((r) => r.ok ? r.json() : Promise.reject()).then(setData).catch(() => setErr(true)); }, []);

  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<Deal | null>(null);
  const [showCycles, setShowCycles] = useState(true);
  const [active, setActive] = useState<Set<DealType>>(new Set(TYPES));

  const deals = useMemo(() => (data ? validDeals(data.deals) : []), [data]);
  const mv = data?.market_values_usd_bn ?? {};
  const nodes = useMemo(() => forceLayout(deals, mv, W, H), [deals]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const cycleIds = useMemo(() => cycleEdgeIds(deals), [deals]);
  const cycles = useMemo(() => enumerateCycles(deals), [deals]);
  const cycleNodes = useMemo(() => new Set(cycles.flat()), [cycles]);

  const total = deals.reduce((a, d) => a + d.value_usd_bn, 0);
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const d of deals) { (m.get(d.from) ?? m.set(d.from, new Set()).get(d.from)!).add(d.to); (m.get(d.to) ?? m.set(d.to, new Set()).get(d.to)!).add(d.from); }
    return m;
  }, [deals]);

  if (err) return <div className="space-y-3"><h2 className="text-lg font-bold text-white">AI Bubble Watch</h2><Unavailable what="AI deal data" detail="ai_deals.json could not be loaded." /></div>;
  if (!data) return <Spinner label="Loading AI deal network…" />;

  const toggleType = (t: DealType) => { const n = new Set(active); n.has(t) ? n.delete(t) : n.add(t); setActive(n); };
  const edgeVisible = (d: Deal) => active.has(d.type);
  const edgeLit = (d: Deal) => edgeVisible(d) && (!hoverNode || d.from === hoverNode || d.to === hoverNode);
  const nodeLit = (id: string) => !hoverNode || id === hoverNode || neighbors.get(hoverNode)?.has(id);

  // curved edge geometry, trimmed to node perimeters; reverse pairs curve oppositely
  const edgeGeom = (d: Deal) => {
    const a = pos.get(d.from)!, b = pos.get(d.to)!;
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const sx = a.x + ux * a.r, sy = a.y + uy * a.r;
    const ex = b.x - ux * (b.r + 7), ey = b.y - uy * (b.r + 7); // 7px gap for arrowhead
    const bend = d.from < d.to ? 22 : -22; // separate bidirectional pairs
    const mxp = (sx + ex) / 2 - uy * bend, myp = (sy + ey) / 2 + ux * bend;
    return { sx, sy, ex, ey, mxp, myp };
  };
  const strokeW = (v: number) => Math.max(1.3, Math.min(7, 1.2 + Math.sqrt(v) / 2.4));
  const fmtBn = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}T` : `$${v}bn`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">🫧 AI Bubble Watch</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#9CA7BB]">
          The AI buildout's financing rhymes with late-1990s telecom <em>vendor financing</em>: a small set of interdependent
          companies commit capital to one another in circles, so headline deal totals may overstate how much <em>independent</em>
          money is really flowing in. The graph below makes that circularity visible — follow the loops.
        </p>
      </div>

      {/* headline */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-[#1E2632] bg-[#121723] px-4 py-3">
        <div>
          <div className="text-2xl font-bold text-white">{fmtBn(Math.round(total))}</div>
          <div className="text-xs text-[#7C879B]">in announced deals across the {deals.length} largest AI transactions tracked</div>
        </div>
        <div className="flex-1 text-xs leading-relaxed text-[#9CA7BB]">
          Note how value circulates between interdependent parties — the same dollars appear in multiple headline figures
          (e.g. <span className="text-[#C3CAD7]">Nvidia → OpenAI → Oracle → Nvidia</span>). The structure is shown; no
          "net-of-circularity" figure is asserted — that's unprovable. <span className="text-[#7C879B]">Nvidia disputes the
          "circular" framing, arguing the commitments reflect genuine end-demand for compute.</span>
        </div>
      </div>

      {/* controls + legend */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#9CA7BB]">
          <input type="checkbox" checked={showCycles} onChange={(e) => setShowCycles(e.target.checked)} className="accent-[#FFD54A]" />
          Highlight circular paths
        </label>
        <span className="text-[#2A3242]">|</span>
        {TYPES.map((t) => (
          <button key={t} onClick={() => toggleType(t)}
            className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${active.has(t) ? "border-[#2A3242] text-[#C3CAD7]" : "border-transparent text-[#5C6678] line-through"}`}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_META[t].color, opacity: active.has(t) ? 1 : 0.3 }} />
            {TYPE_META[t].label}
          </button>
        ))}
        <span className="text-[10px] text-[#5C6678]">Hover a company to focus its deals · hover/click an edge for the source.</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* graph */}
        <Card title="The AI deal network" sub={`The ~15 largest reported AI deals · sourced & dated · as-of ${data.as_of}. Node size ≈ market value (approx). Arrows point from payer/investor → recipient.`}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: "62vh" }} onClick={() => setSelEdge(null)}>
            <defs>
              {TYPES.map((t) => (
                <marker key={t} id={`arr-${t}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={TYPE_META[t].color} />
                </marker>
              ))}
              <marker id="arr-cycle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#FFD54A" /></marker>
              <marker id="arr-dim" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#2A3242" /></marker>
            </defs>

            {/* edges */}
            {deals.map((d) => {
              const g = edgeGeom(d);
              const lit = edgeLit(d);
              const isCycle = showCycles && cycleIds.has(d.id);
              const dim = !lit;
              const color = dim ? "#222A38" : isCycle ? "#FFD54A" : TYPE_META[d.type].color;
              const marker = dim ? "url(#arr-dim)" : isCycle ? "url(#arr-cycle)" : `url(#arr-${d.type})`;
              return (
                <path key={d.id} d={`M${g.sx},${g.sy} Q${g.mxp},${g.myp} ${g.ex},${g.ey}`}
                  fill="none" stroke={color} strokeWidth={dim ? 1 : strokeW(d.value_usd_bn) + (isCycle ? 1 : 0)}
                  markerEnd={marker} opacity={dim ? 0.5 : isCycle ? 0.95 : 0.8}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setSelEdge(d)} onClick={(e) => { e.stopPropagation(); setSelEdge(d); }} />
              );
            })}

            {/* nodes */}
            {nodes.map((n) => {
              const lit = nodeLit(n.id);
              const inCycle = showCycles && cycleNodes.has(n.id);
              return (
                <g key={n.id} style={{ cursor: "pointer" }} opacity={lit ? 1 : 0.25}
                  onMouseEnter={() => setHoverNode(n.id)} onMouseLeave={() => setHoverNode(null)}>
                  <circle cx={n.x} cy={n.y} r={n.r} fill="#0F1420" stroke={inCycle ? "#FFD54A" : "#3A4660"} strokeWidth={inCycle ? 2.5 : 1.5} />
                  <circle cx={n.x} cy={n.y} r={n.r} fill={hoverNode === n.id ? "#5BA8FF22" : "#5BA8FF11"} />
                  <text x={n.x} y={n.y - 1} textAnchor="middle" fontSize={Math.max(10, Math.min(13, n.r / 2.6))} fontWeight={700} fill="#E6E9EF">{n.id}</text>
                  <text x={n.x} y={n.y + 12} textAnchor="middle" fontSize={9} fill="#7C879B">{n.mv >= 1000 ? `~$${(n.mv / 1000).toFixed(1)}T` : `~$${n.mv}bn`}</text>
                </g>
              );
            })}
          </svg>
        </Card>

        {/* side panel: detail + cycles */}
        <div className="space-y-4">
          <Card title="Deal detail">
            {selEdge ? (
              <div className="space-y-2 text-sm">
                <div className="text-base font-semibold text-white">{selEdge.from} <span className="text-[#7C879B]">→</span> {selEdge.to}</div>
                <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold" style={{ color: TYPE_META[selEdge.type].color, background: `${TYPE_META[selEdge.type].color}22` }}>{TYPE_META[selEdge.type].label}</span>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <div><span className="text-[#7C879B]">Value: </span><span className="font-semibold text-[#E6E9EF]">{fmtBn(selEdge.value_usd_bn)}{selEdge.value_approx ? " (approx.)" : ""}</span></div>
                  <div><span className="text-[#7C879B]">Reported: </span><span className="text-[#C3CAD7]">{selEdge.date}</span></div>
                </div>
                <p className="text-xs leading-relaxed text-[#9CA7BB]">{selEdge.note}</p>
                <a href={selEdge.source_url} target="_blank" rel="noreferrer" className="inline-block break-all text-xs text-[#5BA8FF] hover:underline">Source ↗ {selEdge.source_url}</a>
                {cycleIds.has(selEdge.id) && <div className="text-[11px] text-[#FFD54A]">◆ This deal is part of a circular path.</div>}
              </div>
            ) : <div className="text-sm text-[#7C879B]">Hover or click an edge to see the deal — value, date, type, and the (clickable) source link. Every edge is reported/announced, not verified-paid.</div>}
          </Card>

          <Card title={`Circular paths found (${cycles.length})`} sub="Directed loops where money returns to its source.">
            {cycles.length ? (
              <ul className="space-y-1 text-sm">
                {cycles.map((c, i) => (
                  <li key={i} className="text-[#C3CAD7]"><span className="text-[#FFD54A]">↻</span> {c.join(" → ")} → {c[0]}</li>
                ))}
              </ul>
            ) : <div className="text-sm text-[#7C879B]">No directed cycles in the current dataset.</div>}
          </Card>
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-[#5C6678]">
        Every figure is the <em>reported / announced</em> amount, not verified-paid; multi-year commitments and options are included at their headline value. Market-value node sizes are approximate (public market cap or last reported private valuation, mixed as-of). Dataset is curated in <code>ai_deals.json</code>; proposed additions are staged in <code>ai_deals_proposed.json</code> for human review and never rendered automatically.
      </p>
    </div>
  );
}
