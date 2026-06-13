import { Suspense, lazy, useRef, useState } from "react";
import { useStore } from "../store";
import Hud from "../landing/Hud";
import {
  SYSTEM_STATUS,
  computeChaos,
  ERA,
  type MarketStateKey,
  type PlanetDef,
  type SunDef,
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
  const [marketKey, setMarketKey] = useState<MarketStateKey>(SYSTEM_STATUS.market.state);
  const [chaos, setChaos] = useState<number>(() => computeChaos());
  const [hover, setHover] = useState<HoverState | null>(null);
  const [sunHover, setSunHover] = useState<SunHoverState | null>(null);
  const [nav, setNav] = useState<PlanetDef | null>(null);
  const [flying, setFlying] = useState(false);
  const flyTimer = useRef<number | null>(null);

  const onHover = (def: PlanetDef | null, x: number, y: number) =>
    setHover(def ? { def, x, y } : null);
  const onSunHover = (def: SunDef | null, x: number, y: number) =>
    setSunHover(def ? { def, x, y } : null);

  // click = camera fly-toward + fade, then the mock nav overlay resolves.
  const onSelect = (def: PlanetDef) => {
    setHover(null);
    setFlying(true);
    if (flyTimer.current) window.clearTimeout(flyTimer.current);
    flyTimer.current = window.setTimeout(() => setNav(def), 620);
  };

  const closeNav = () => {
    setNav(null);
    setFlying(false);
  };

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
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center">
              <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#7C879B]">
                initializing system…
              </span>
            </div>
          }
        >
          <Scene
            chaos={chaos}
            marketStateKey={marketKey}
            hoveredId={hover?.def.tabId ?? null}
            onHover={onHover}
            onSelect={onSelect}
            onSunHover={onSunHover}
          />
        </Suspense>
      </div>

      <Hud
        chaos={chaos}
        setChaos={setChaos}
        resetChaos={() => setChaos(computeChaos())}
        marketKey={marketKey}
        setMarketKey={setMarketKey}
        era={ERA(chaos)}
        hover={hover}
        sunHover={sunHover}
        nav={nav}
        onCloseNav={closeNav}
        onExit={() => setActiveTab("home")}
      />
    </div>
  );
}
