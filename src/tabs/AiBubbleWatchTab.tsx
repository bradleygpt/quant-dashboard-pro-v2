import { ASSET, ENTITY, INK, LINE, SEM, SURFACE, alpha } from "../theme";
import { useEffect, useMemo, useState } from "react";
import { Card, Spinner, Unavailable } from "../components/ui";
import {
  TYPE_META, validDeals, forceLayout, cycleEdgeIds, enumerateCycles,
  type AiDealsFile, type Deal, type DealType,
} from "../lib/aiGraph";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Legend, Cell,
} from "recharts";

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
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-3">
          The AI buildout's financing rhymes with late-1990s telecom <em>vendor financing</em>: a small set of interdependent
          companies commit capital to one another in circles, so headline deal totals may overstate how much <em>independent</em>
          money is really flowing in. The graph below makes that circularity visible — follow the loops.
        </p>
      </div>

      {/* top disclaimer */}
      <div className="rounded-md border border-warn/25 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-paper">
        ⚠ Illustrative · figures are analyst tallies &amp; point-in-time estimates · as of ~mid-2026 · not a live feed.
      </div>

      {/* headline */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-panel px-4 py-3">
        <div>
          <div className="text-2xl font-bold text-white">{fmtBn(Math.round(total))}</div>
          <div className="text-xs text-mute">in announced deals across the {deals.length} largest AI transactions tracked</div>
        </div>
        <div className="flex-1 text-xs leading-relaxed text-ink-3">
          Note how value circulates between interdependent parties — the same dollars appear in multiple headline figures
          (e.g. <span className="text-ink-2">Nvidia → OpenAI → Oracle → Nvidia</span>). The structure is shown; no
          "net-of-circularity" figure is asserted — that's unprovable. <span className="text-mute">Nvidia disputes the
          "circular" framing, arguing the commitments reflect genuine end-demand for compute.</span>
        </div>
      </div>

      {/* controls + legend */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-3">
          <input type="checkbox" checked={showCycles} onChange={(e) => setShowCycles(e.target.checked)} className="accent-warn" />
          Highlight circular paths
        </label>
        <span className="text-line-2">|</span>
        {TYPES.map((t) => (
          <button key={t} onClick={() => toggleType(t)}
            className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${active.has(t) ? "border-line-2 text-ink-2" : "border-transparent text-dim line-through"}`}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_META[t].color, opacity: active.has(t) ? 1 : 0.3 }} />
            {TYPE_META[t].label}
          </button>
        ))}
        <span className="text-[10px] text-dim">Hover a company to focus its deals · hover/click an edge for the source.</span>
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
              <marker id="arr-cycle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={SEM.warn} /></marker>
              <marker id="arr-dim" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={LINE.strong} /></marker>
            </defs>

            {/* edges */}
            {deals.map((d) => {
              const g = edgeGeom(d);
              const lit = edgeLit(d);
              const isCycle = showCycles && cycleIds.has(d.id);
              const dim = !lit;
              const color = dim ? LINE.line : isCycle ? SEM.warn : TYPE_META[d.type].color;
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
                  <circle cx={n.x} cy={n.y} r={n.r} fill={SURFACE.head} stroke={inCycle ? SEM.warn : LINE.strong} strokeWidth={inCycle ? 2.5 : 1.5} />
                  <circle cx={n.x} cy={n.y} r={n.r} fill={hoverNode === n.id ? alpha(SEM.link, 0.13) : alpha(SEM.link, 0.07)} />
                  <text x={n.x} y={n.y - 1} textAnchor="middle" fontSize={Math.max(10, Math.min(13, n.r / 2.6))} fontWeight={700} fill={INK.ink}>{n.id}</text>
                  <text x={n.x} y={n.y + 12} textAnchor="middle" fontSize={9} fill={INK.mute}>{n.mv >= 1000 ? `~$${(n.mv / 1000).toFixed(1)}T` : `~$${n.mv}bn`}</text>
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
                <div className="text-base font-semibold text-white">{selEdge.from} <span className="text-mute">→</span> {selEdge.to}</div>
                <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold" style={{ color: TYPE_META[selEdge.type].color, background: `${TYPE_META[selEdge.type].color}22` }}>{TYPE_META[selEdge.type].label}</span>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <div><span className="text-mute">Value: </span><span className="font-semibold text-ink">{fmtBn(selEdge.value_usd_bn)}{selEdge.value_approx ? " (approx.)" : ""}</span></div>
                  <div><span className="text-mute">Reported: </span><span className="text-ink-2">{selEdge.date}</span></div>
                </div>
                <p className="text-xs leading-relaxed text-ink-3">{selEdge.note}</p>
                <a href={selEdge.source_url} target="_blank" rel="noreferrer" className="inline-block break-all text-xs text-link hover:underline">Source ↗ {selEdge.source_url}</a>
                {cycleIds.has(selEdge.id) && <div className="text-[11px] text-warn">◆ This deal is part of a circular path.</div>}
              </div>
            ) : <div className="text-sm text-mute">Hover or click an edge to see the deal — value, date, type, and the (clickable) source link. Every edge is reported/announced, not verified-paid.</div>}
          </Card>

          <Card title={`Circular paths found (${cycles.length})`} sub="Directed loops where money returns to its source.">
            {cycles.length ? (
              <ul className="space-y-1 text-sm">
                {cycles.map((c, i) => (
                  <li key={i} className="text-ink-2"><span className="text-warn">↻</span> {c.join(" → ")} → {c[0]}</li>
                ))}
              </ul>
            ) : <div className="text-sm text-mute">No directed cycles in the current dataset.</div>}
          </Card>
        </div>
      </div>

      {/* ── The other 7 research findings ── */}
      <div className="pt-2">
        <h3 className="text-base font-bold text-white">Is it a bubble? Seven more lenses</h3>
        <p className="text-xs text-mute">Each lens is tagged by whether it <em>rhymes</em> with a past bubble, <em>diverges</em> from one, is <em>novel</em>, or is a <em>mixed signal</em>. All figures illustrative / as-of ~mid-2026.</p>
      </div>
      <Findings />

      {/* synthesis banner */}
      <div className="rounded-lg border border-line-2 bg-head p-4">
        <div className="text-sm font-bold text-white">Honest synthesis</div>
        <p className="mt-1 text-xs leading-relaxed text-ink-2">
          Equity-valuation risk looks <strong>moderate</strong> — the index is concentrated and richly priced, but the leaders are
          cheaper and more cash-generative than 2000's. The sharper risk is in the <strong>financing structure</strong>: genuine
          end-demand, but increasingly <strong>circular and concentrated</strong> commitments (see the network above) plus an
          overbuild risk if utilization disappoints. Net: a <strong>telecom-shaped financing/overbuild risk</strong> sitting on a
          <strong> railway-and-electrification-scale real economy</strong> of compute and power. Not a verdict that it is — or isn't — a bubble; a map of where the risk actually lives.
        </p>
      </div>

      <p className="text-[10px] leading-relaxed text-dim">
        Every deal figure is the <em>reported / announced</em> amount, not verified-paid; multi-year commitments and options are included at their headline value. Market-value node sizes are approximate (public market cap or last reported private valuation, mixed as-of). Findings figures are analyst tallies / point-in-time estimates as of ~mid-2026, not a live feed. The contested GPU-depreciation thesis is intentionally excluded as unresolved. Dataset is curated in <code>ai_deals.json</code>; proposed additions are staged in <code>ai_deals_proposed.json</code> for human review and never rendered automatically.
      </p>
    </div>
  );
}

// ── Findings (7 research lenses) ─────────────────────────────────────────────
const VERDICT: Record<string, string> = { Divergence: SEM.pos, Rhyme: SEM.warnHot, Novel: ENTITY.auxo, "Mixed signal": SEM.warn };
function Tag({ kind, label }: { kind: keyof typeof VERDICT | string; label: string }) {
  const c = VERDICT[kind] ?? INK.ink3;
  return <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: c, background: `${c}22`, border: `1px solid ${c}55` }}>{kind} · {label}</span>;
}
function FindingCard({ title, tagKind, tagLabel, source, children, wide }: { title: string; tagKind: string; tagLabel: string; source: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-line bg-panel p-4 ${wide ? "lg:col-span-2" : ""}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <Tag kind={tagKind} label={tagLabel} />
      </div>
      {children}
      <div className="mt-2 text-[10px] text-dim">{source}</div>
    </div>
  );
}
const AX = { fill: INK.mute, fontSize: 11 };
const TT = { background: SURFACE.head, border: `1px solid ${LINE.line}`, borderRadius: 8 };

function Findings() {
  // All figures illustrative analyst tallies / point-in-time estimates, as-of ~mid-2026.
  const capex = [
    { co: "Microsoft", y2025: 80, y2026: 120 }, { co: "Amazon", y2025: 105, y2026: 125 },
    { co: "Alphabet", y2025: 85, y2026: 175 }, { co: "Meta", y2025: 70, y2026: 115 },
    { co: "Oracle", y2025: 35, y2026: 65 },
  ];
  const valuations = [
    { label: "Top-10 forward P/E", now: 31, then: 43 },
    { label: "Lead chipmaker (× sales)", now: 22, then: 31 },
  ];
  const concentration = [
    { year: 2015, pct: 12 }, { year: 2017, pct: 16 }, { year: 2019, pct: 17 },
    { year: 2021, pct: 23 }, { year: 2023, pct: 28 }, { year: 2024, pct: 32 }, { year: 2025, pct: 34.5 },
  ];
  const rates = [
    { m: 0, ai: 5.3, dot: 4.75 }, { m: 6, ai: 5.0, dot: 5.5 }, { m: 12, ai: 4.5, dot: 6.0 },
    { m: 18, ai: 4.1, dot: 6.5 }, { m: 24, ai: 3.8, dot: 6.5 }, { m: 30, ai: 3.6, dot: 6.5 },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* 2. Valuations vs 2000 — most decision-relevant, given prominence */}
      <FindingCard wide title="Valuations vs 2000" tagKind="Divergence" tagLabel="cheaper than 2000"
        source="Illustrative: top-10 S&P forward P/E now ~31× vs dot-com peak ~43×; lead chipmaker Nvidia ~22× sales vs Cisco 2000 ~31×. Analyst estimates, as-of ~mid-2026.">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={valuations} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={SURFACE.raised} vertical={false} />
            <XAxis dataKey="label" tick={AX} /><YAxis tick={AX} width={36} />
            <RTooltip contentStyle={TT} formatter={(v: number, n) => [`${v}×`, n === "now" ? "Now (~2026)" : "2000 peak"]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="now" name="Now (~2026)" fill={SEM.link} />
            <Bar dataKey="then" name="2000 peak" fill={INK.mute} />
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-1 text-[11px] text-ink-3">The most decision-relevant chart: today's AI leaders are richly valued but <strong>cheaper and far more cash-generative</strong> than the 2000 peak — valuation risk is real but not 2000-extreme.</p>
      </FindingCard>

      {/* 1. Capex */}
      <FindingCard title="Hyperscaler capex — 2025 → 2026" tagKind="Divergence" tagLabel="incumbent-funded"
        source="Illustrative analyst tallies / company guidance, capex $bn, as-of ~mid-2026. Funded largely from operating cash flow (not vendor debt / IPO equity as in 2000).">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={capex} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={SURFACE.raised} vertical={false} />
            <XAxis dataKey="co" tick={AX} interval={0} /><YAxis tick={AX} width={40} tickFormatter={(v) => `$${v}b`} />
            <RTooltip contentStyle={TT} formatter={(v: number, n) => [`$${v}bn`, n === "y2025" ? "2025" : "2026 (est.)"]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="y2025" name="2025" fill={INK.mute} />
            <Bar dataKey="y2026" name="2026 (est.)" fill={ASSET.btc} />
          </BarChart>
        </ResponsiveContainer>
      </FindingCard>

      {/* 3. Concentration */}
      <FindingCard title="Mag-7 share of S&P 500 market cap" tagKind="Rhyme" tagLabel="50-yr extreme"
        source="Illustrative: Magnificent-7 ≈ 12% (2015) → ~34.5% (2025); dashed line = 2000 top-cohort peak ~27%. A half-century concentration extreme.">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={concentration} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={SURFACE.raised} vertical={false} />
            <XAxis dataKey="year" tick={AX} /><YAxis tick={AX} width={36} tickFormatter={(v) => `${v}%`} domain={[0, 40]} />
            <RTooltip contentStyle={TT} formatter={(v: number) => [`${v}%`, "Mag-7 share"]} />
            <ReferenceLine y={27} stroke={SEM.warnHot} strokeDasharray="4 3" label={{ value: "2000 peak ~27%", fill: SEM.warnHot, fontSize: 9, position: "insideTopRight" }} />
            <Line type="monotone" dataKey="pct" stroke={SEM.link} strokeWidth={2} dot={{ r: 2 }} name="Mag-7 share" />
          </LineChart>
        </ResponsiveContainer>
      </FindingCard>

      {/* 4. Rates inversion */}
      <FindingCard title="Rates backdrop — opposite of dot-com" tagKind="Divergence" tagLabel="easing not tightening"
        source="Illustrative Fed funds paths from each cycle's start: AI-era easing toward ~3.6% vs dot-com tightening to 6.5%. Schematic, monthly, as-of ~mid-2026.">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rates} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={SURFACE.raised} vertical={false} />
            <XAxis dataKey="m" tick={AX} tickFormatter={(v) => `${v}mo`} /><YAxis tick={AX} width={40} tickFormatter={(v) => `${v}%`} domain={[3, 7]} />
            <RTooltip contentStyle={TT} formatter={(v: number, n) => [`${v}%`, n === "ai" ? "AI era (2024→)" : "Dot-com (1999→)"]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="ai" name="AI era (2024→)" stroke={SEM.pos} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="dot" name="Dot-com (1999→)" stroke={SEM.neg} strokeWidth={2} strokeDasharray="4 2" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </FindingCard>

      {/* 5. Macro reliance — stat callouts */}
      <FindingCard title="Macro reliance on the buildout" tagKind="Rhyme" tagLabel="railway-scale dependence"
        source="Illustrative: ~92% of H1-2025 US GDP growth attributed to information-processing investment; AI capex ~2% of GDP ≈ ~20% of the late-1800s railway peak. Point-in-time estimates.">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-line bg-head p-3 text-center"><div className="text-3xl font-bold text-warn-hot">~92%</div><div className="text-[11px] text-ink-3">of H1-2025 US GDP growth from info-processing investment</div></div>
          <div className="rounded-md border border-line bg-head p-3 text-center"><div className="text-3xl font-bold text-warn-hot">~2%</div><div className="text-[11px] text-ink-3">AI capex as share of GDP — ≈20% of the railway-era peak</div></div>
        </div>
      </FindingCard>

      {/* 6. Demand — two-sided panel */}
      <FindingCard wide title="Demand — real, but how durable?" tagKind="Mixed signal" tagLabel="bull vs bear"
        source="Illustrative, as-of ~mid-2026. Run-rates annualized from short windows are caveated. The contested GPU-depreciation thesis is excluded as unresolved.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-pos">🟢 Bull</div>
            <ul className="list-disc space-y-1 pl-4 text-xs text-ink-3">
              <li>Nvidia record Q3 revenue ~$57bn, +66% YoY.</li>
              <li>Anthropic run-rate reportedly ~$1bn → ~$30bn.</li>
              <li>Generative-AI adoption ~54.6% faster than the PC or internet at the same stage.</li>
            </ul>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-neg">🔴 Bear</div>
            <ul className="list-disc space-y-1 pl-4 text-xs text-ink-3">
              <li>MIT: ~95% of enterprise AI pilots show no measurable P&L impact.</li>
              <li>OpenAI reportedly burning ~$17bn/yr.</li>
              <li>Many headline run-rates are <em>annualized from a single month</em> — treat with caution.</li>
            </ul>
          </div>
        </div>
      </FindingCard>

      {/* 7. Power — stat callouts */}
      <FindingCard title="Power & the grid" tagKind="Novel" tagLabel="no clean historical analog"
        source="Illustrative: US grid-interconnection queues running 5–7+ years; data centers projected at ~6.7–12% of US electricity by 2030 (range; 'up to' ceiling). Point-in-time estimates.">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-line bg-head p-3 text-center"><div className="text-3xl font-bold" style={{ color: ENTITY.auxo }}>5–7+ yr</div><div className="text-[11px] text-ink-3">grid interconnection queues</div></div>
          <div className="rounded-md border border-line bg-head p-3 text-center"><div className="text-3xl font-bold" style={{ color: ENTITY.auxo }}>6.7–12%</div><div className="text-[11px] text-ink-3">projected US electricity from data centers by 2030</div></div>
        </div>
      </FindingCard>
    </div>
  );
}
