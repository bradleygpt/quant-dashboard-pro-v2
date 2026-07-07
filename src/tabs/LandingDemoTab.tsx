import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { probeHealth } from "../lib/markets";
import Hud from "../landing/Hud";
import {
  computeChaos,
  ERA,
  buildSuns,
  buildPlanets,
  loadSystemStatus,
  liveMarketState,
  type MarketStateKey,
  type PlanetDef,
  type SunDef,
  type SystemStatus,
} from "../landing/mockData";

// The whole three.js scene + post chain is code-split so it only loads when the
// demo is opened — no regression to the initial bundle of the other tabs.
const Scene = lazy(() => import("../landing/Scene"));

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

export default function LandingDemoTab() {
  const { setActiveTab } = useStore();
  // Live system status from the bake (web/public/data/system_status.json). Null
  // until loaded; we gate the scene on it so every sun/planet/HUD value is built
  // from real data — never the old hardcoded PPI 55 / +2.3% mock.
  const [status, setStatus] = useState<SystemStatus | null>(null);
  // Day/night default tracks the live US market session; the toggle overrides it.
  const [marketKey, setMarketKey] = useState<MarketStateKey>(() => liveMarketState());
  const [chaos, setChaos] = useState<number>(0.5);
  const userChaos = useRef(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [sunHover, setSunHover] = useState<SunHoverState | null>(null);
  const [flying, setFlying] = useState(false);
  const flyTimer = useRef<number | null>(null);

  // THESIS sun health: ONE probe on landing load (no polling storm). Null until the
  // probe answers; the sun stays dim until proven reachable — never lit while down.
  const [thesisUp, setThesisUp] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    loadSystemStatus().then((s) => {
      if (!alive) return;
      setStatus(s);
      if (!userChaos.current) setChaos(computeChaos(s));
    });
    probeHealth().then((h) => {
      if (alive) setThesisUp(h.up);
    });
    return () => {
      alive = false;
    };
  }, []);

  const suns = useMemo(() => (status ? buildSuns(status, thesisUp) : []), [status, thesisUp]);
  const planets = useMemo(() => (status ? buildPlanets(status) : []), [status]);

  const onHover = (def: PlanetDef | null, x: number, y: number) =>
    setHover(def ? { def, x, y } : null);
  const onSunHover = (def: SunDef | null, x: number, y: number) =>
    setSunHover(def ? { def, x, y } : null);

  // click = camera fly-toward + fade, then REAL navigation to that planet's tab.
  // Each planet's tabId is a real registry id (verified), so this routes to the
  // actual working tab — no mock overlay.
  const onSelect = (def: PlanetDef) => {
    setHover(null);
    setFlying(true);
    if (flyTimer.current) window.clearTimeout(flyTimer.current);
    flyTimer.current = window.setTimeout(() => setActiveTab(def.tabId), 620);
  };

  const onChaos = (v: number) => {
    userChaos.current = true;
    setChaos(v);
  };
  const resetChaos = () => {
    if (status) setChaos(computeChaos(status));
    userChaos.current = false;
  };

  const initializing = (
    <div className="flex h-full w-full items-center justify-center">
      <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#7C879B]">
        initializing system…
      </span>
    </div>
  );

  return (
    // fixed full-bleed so the experience reads cinematic, not boxed in a tab pane.
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#04060b]">
      <div
        className="h-full w-full transition-all duration-[620ms] ease-in"
        style={{
          transform: flying ? "scale(1.22)" : "scale(1)",
          opacity: flying ? 0 : 1,
          filter: flying ? "blur(3px)" : "none",
        }}
      >
        {/* Gate the scene on the live status so the suns/planets are built from
            real data on first paint (no mock→live flash, no material rebuild). */}
        {status ? (
          <Suspense fallback={initializing}>
            <Scene
              chaos={chaos}
              marketStateKey={marketKey}
              hoveredId={hover?.def.tabId ?? null}
              suns={suns}
              planets={planets}
              onHover={onHover}
              onSelect={onSelect}
              onSunHover={onSunHover}
            />
          </Suspense>
        ) : (
          initializing
        )}
      </div>

      {status && (
        <Hud
          chaos={chaos}
          setChaos={onChaos}
          resetChaos={resetChaos}
          marketKey={marketKey}
          setMarketKey={setMarketKey}
          era={ERA(chaos)}
          status={status}
          suns={suns}
          hover={hover}
          sunHover={sunHover}
          onExit={() => setActiveTab("overview")}
        />
      )}
    </div>
  );
}
