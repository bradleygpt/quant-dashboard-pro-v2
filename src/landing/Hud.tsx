import { LIGHTING, MARKET_ORDER, isDaylight, type MarketStateKey, type PlanetDef, type SunDef, type SystemStatus } from "./mockData";

interface HoverState {
  def: PlanetDef;
  x: number;
  y: number;
}
interface SunHoverState {
  def: SunDef;
  x: number;
  y: number;
}

interface Props {
  chaos: number;
  setChaos: (v: number) => void;
  resetChaos: () => void;
  marketKey: MarketStateKey;
  setMarketKey: (k: MarketStateKey) => void;
  era: string;
  status: SystemStatus;
  suns: SunDef[];
  hover: HoverState | null;
  sunHover: SunHoverState | null;
  onExit: () => void;
}

const micro = "text-[10px] uppercase tracking-[0.22em] text-[#7C879B]";
const rule = "h-px w-full bg-gradient-to-r from-[#1E2632] to-transparent";

export default function Hud(props: Props) {
  const { chaos, setChaos, resetChaos, marketKey, setMarketKey, era, status, suns, hover, sunHover, onExit } = props;
  const s = status;
  const pnl = s.c78q.pnl; // null when no honest live mark exists

  // On the daylight (Market Open) background the light HUD ink would wash out, so
  // each cluster gets a translucent dark scrim that keeps the existing palette
  // legible. Night states keep the bare-on-void look.
  const daylight = isDaylight(marketKey);
  const scrim = daylight ? "rounded-md bg-[#070b12]/55 px-3 py-2.5 backdrop-blur-[2px] ring-1 ring-white/10" : "";

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-mono text-[#C3CAD7]">
      {/* ---------- title + era (top-left) ---------- */}
      <div className={`absolute left-6 top-5 ${scrim}`}>
        <div className="flex items-baseline gap-3">
          <h1 className="text-[22px] font-semibold tracking-[0.42em] text-[#DCE3EE]">AKRIBEIA</h1>
          <span className={micro}>three-sun gravitational system</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span
            className={`text-[11px] tracking-[0.28em] ${era === "CHAOTIC ERA" ? "text-[#FF9800]" : "text-[#5BA8FF]"}`}
          >
            {era}
          </span>
          <span className={micro}>chaos {chaos.toFixed(2)}</span>
        </div>
        <div className="mt-3 w-56">
          <div className={rule} />
        </div>
      </div>

      {/* ---------- status strip (top-right): pipeline/PPI/c78q ---------- */}
      <div className={`absolute right-6 top-5 text-right ${scrim}`}>
        <div className="flex justify-end gap-6 tabular-nums">
          <Stat label="PIPELINE" value={s.bake.fresh ? "FRESH" : "STALE"} tone={s.bake.fresh ? "#00C805" : "#FF5722"} />
          <Stat label="PPI" value={`${s.ppi.score} ${s.ppi.level}`} tone="#FF9800" />
          {pnl == null ? (
            <Stat label="KATALEPSIS" value="DEPLOYED" tone="#9CA7BB" />
          ) : (
            <Stat label="KATALEPSIS P&L" value={`${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}%`} tone={pnl >= 0 ? "#00C805" : "#FF5722"} />
          )}
        </div>
        <div className="mt-3 ml-auto w-56">
          <div className={rule} style={{ transform: "scaleX(-1)" }} />
        </div>
        <button
          onClick={onExit}
          className="pointer-events-auto mt-3 text-[10px] uppercase tracking-[0.22em] text-[#7C879B] transition hover:text-[#C3CAD7]"
        >
          enter dashboard →
        </button>
      </div>

      {/* ---------- legend: the three engines (bottom-left) ---------- */}
      <div className={`absolute bottom-6 left-6 ${scrim}`}>
        <div className={`${micro} mb-2`}>three suns · core engines</div>
        <div className="space-y-1.5">
          {suns.map((sun) => (
            <div key={sun.id} className="flex items-center gap-2.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: sun.color, boxShadow: `0 0 8px ${sun.color}` }}
              />
              <span className="text-[11px] tracking-[0.14em] text-[#C3CAD7]">{sun.name}</span>
              <span className={micro}>{sun.role}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- controls (bottom-right) ---------- */}
      <div className={`pointer-events-auto absolute bottom-6 right-6 w-[260px] ${scrim}`}>
        <div className={`${micro} mb-2`}>market clock</div>
        <div className="grid grid-cols-2 gap-1.5">
          {MARKET_ORDER.map((k) => {
            const active = k === marketKey;
            return (
              <button
                key={k}
                onClick={() => setMarketKey(k)}
                className={`rounded-sm border px-2 py-1.5 text-left text-[10px] uppercase tracking-[0.16em] transition ${
                  active
                    ? "border-[#5BA8FF]/60 bg-[#5BA8FF]/10 text-[#DCE3EE]"
                    : "border-[#1E2632] text-[#7C879B] hover:border-[#2A3545] hover:text-[#9CA7BB]"
                }`}
              >
                {LIGHTING[k].label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className={micro}>chaos</span>
          <button onClick={resetChaos} className={`${micro} transition hover:text-[#C3CAD7]`}>
            reset → {(s.ppi.score / 100).toFixed(2)}
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={chaos}
          onChange={(e) => setChaos(parseFloat(e.target.value))}
          className="mt-1.5 w-full accent-[#5BA8FF]"
        />
        <div className={`${micro} mt-1 flex justify-between`}>
          <span>stable · separated</span>
          <span>chaotic · converged</span>
        </div>
      </div>

      {/* ---------- planet hover tooltip ---------- */}
      {hover && (
        <div
          className="absolute z-10 -translate-y-1/2 rounded-sm border border-[#1E2632] bg-[#05070d]/85 px-3 py-2 backdrop-blur-sm"
          style={{ left: Math.min(hover.x + 18, window.innerWidth - 220), top: hover.y }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: hover.def.accent }} />
            <span className="text-[12px] tracking-[0.12em] text-[#DCE3EE]">{hover.def.name}</span>
          </div>
          <div className="mt-1 text-[10px] tracking-[0.06em] text-[#9CA7BB] tabular-nums">{hover.def.status}</div>
        </div>
      )}

      {/* ---------- sun hover tooltip (ambient status, no navigation) ---------- */}
      {sunHover && (
        <div
          className="absolute z-10 -translate-y-1/2 rounded-sm border border-[#1E2632] bg-[#05070d]/85 px-3 py-2 backdrop-blur-sm"
          style={{ left: Math.min(sunHover.x + 18, window.innerWidth - 240), top: sunHover.y }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: sunHover.def.color, boxShadow: `0 0 8px ${sunHover.def.color}` }} />
            <span className="text-[12px] tracking-[0.16em] text-[#DCE3EE]">{sunHover.def.name}</span>
            <span className={micro}>engine</span>
          </div>
          <div className="mt-1 text-[10px] tracking-[0.06em] text-[#9CA7BB]">{sunHover.def.role}</div>
          <div className="mt-0.5 text-[10px] tracking-[0.06em] text-[#7C879B] tabular-nums">{sunHover.def.status}</div>
        </div>
      )}

    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <div className={micro}>{label}</div>
      <div className="mt-0.5 text-[12px] tracking-[0.08em]" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}
