import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LIGHTING, type MarketStateKey, type PlanetDef } from "./mockData";
import { makeSimState, makeLiveLighting, type LiveLighting } from "./runtime";
import Suns from "./Suns";
import Planets from "./Planets";
import Stars from "./Stars";
import PostFX from "./PostFX";

interface Props {
  chaos: number;
  marketStateKey: MarketStateKey;
  hoveredId: string | null;
  onHover: (def: PlanetDef | null, x: number, y: number) => void;
  onSelect: (def: PlanetDef) => void;
}

// Smoothly eases the live lighting toward the active market-clock state, so the
// four states cross-fade rather than snap.
function LightingController({
  marketStateKey,
  lightingRef,
}: {
  marketStateKey: MarketStateKey;
  lightingRef: React.MutableRefObject<LiveLighting>;
}) {
  useFrame((_, delta) => {
    const T = LIGHTING[marketStateKey];
    const L = lightingRef.current;
    const k = Math.min(1, delta * 1.7);
    L.sunIntensity += (T.sunIntensity - L.sunIntensity) * k;
    L.rim += (T.rim - L.rim) * k;
    L.starOpacity += (T.starOpacity - L.starOpacity) * k;
    L.bloom += (T.bloom - L.bloom) * k;
    L.ember += (T.ember - L.ember) * k;
    L.ambient += (T.ambient - L.ambient) * k;
    L.exposure += (T.exposure - L.exposure) * k;
  });
  return null;
}

// Slow parallax drift on mouse plus a perpetual idle sway — nothing snaps,
// nothing spins linearly. In every state the camera keeps a gentle drift.
function CameraRig() {
  const cam = useThree((s) => s.camera);
  useFrame((state, delta) => {
    const px = state.pointer.x;
    const py = state.pointer.y;
    const t = state.clock.elapsedTime;
    const idleX = Math.sin(t * 0.05) * 0.9;
    const idleY = Math.cos(t * 0.043) * 0.55;
    const tx = px * 2.3 + idleX;
    const ty = 2.0 + py * 1.5 + idleY;
    const tz = 27 + Math.sin(t * 0.03) * 0.8;
    const k = Math.min(1, delta * 1.4);
    cam.position.x += (tx - cam.position.x) * k;
    cam.position.y += (ty - cam.position.y) * k;
    cam.position.z += (tz - cam.position.z) * k;
    cam.lookAt(0, 0, 0);
  });
  return null;
}

export default function Scene({ chaos, marketStateKey, hoveredId, onHover, onSelect }: Props) {
  const simRef = useRef(makeSimState());
  const lightingRef = useRef(makeLiveLighting());
  const frozen = LIGHTING[marketStateKey].frozen;
  const bg = useMemo(() => new THREE.Color("#04060b"), []);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 2, 27], fov: 42, near: 0.1, far: 600 }}
      gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={() => onHover(null, 0, 0)}
    >
      <color attach="background" args={[bg.r, bg.g, bg.b]} />
      <fog attach="fog" args={["#04060b", 60, 320]} />

      <LightingController marketStateKey={marketStateKey} lightingRef={lightingRef} />
      <CameraRig />

      <Stars lightingRef={lightingRef} />
      <Suns simRef={simRef} lightingRef={lightingRef} chaos={chaos} frozen={frozen} />
      <Planets
        simRef={simRef}
        lightingRef={lightingRef}
        frozen={frozen}
        hoveredId={hoveredId}
        onHover={onHover}
        onSelect={onSelect}
      />

      <PostFX lightingRef={lightingRef} />
    </Canvas>
  );
}
