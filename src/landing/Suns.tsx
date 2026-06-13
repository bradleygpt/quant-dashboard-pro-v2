import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { type SunDef } from "./mockData";
import { initBodies, paramsForChaos, step, barycenter, type Body } from "./triStarSim";
import { makeCoreMaterial, makeCoronaMaterial, makeHaloTexture } from "./shaders";
import { EMBER_COLOR, type SimState, type LiveLighting } from "./runtime";

interface Props {
  simRef: React.MutableRefObject<SimState>;
  lightingRef: React.MutableRefObject<LiveLighting>;
  chaos: number;
  frozen: boolean;
  suns: SunDef[];
  onSunHover: (def: SunDef | null, x: number, y: number) => void;
}

const FIXED_DT = 1 / 120;
const MAX_FRAME = 1 / 30;

export default function Suns({ simRef, lightingRef, chaos, frozen, suns, onSunHover }: Props) {
  const halo = useMemo(() => makeHaloTexture(), []);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const halos = useRef<THREE.SpriteMaterial[]>([]);

  // physics state lives in a ref so it survives re-renders / chaos changes
  const bodies = useRef<Body[]>(initBodies(suns.map((s) => s.mass)));
  const accum = useRef(0);
  // chaos eased toward the prop so an instant slider/state jump still migrates
  // the stations smoothly (separated ↔ converged) rather than teleporting.
  const liveChaos = useRef(chaos);

  // colors/materials are fixed art (mass+color never change with live data) —
  // built once from the initial suns so live-status updates never rebuild them.
  const baseColors = useMemo(() => suns.map((s) => new THREE.Color(s.color)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const liveColor = useMemo(() => new THREE.Color(), []);

  // build the layered shader materials exactly once — they're driven by uniforms
  const cores = useMemo(() => baseColors.map((c) => makeCoreMaterial(c)), [baseColors]);
  const coronas = useMemo(() => baseColors.map((c) => makeCoronaMaterial(c)), [baseColors]);

  useFrame((_, deltaRaw) => {
    const delta = Math.min(deltaRaw, MAX_FRAME);
    const L = lightingRef.current;

    liveChaos.current += (chaos - liveChaos.current) * Math.min(1, delta * 1.5);
    const params = paramsForChaos(liveChaos.current);

    // ----- advance the tri-star sim (frozen in Closed state) -----
    if (!frozen) {
      accum.current += delta * params.timeScale;
      let guard = 0;
      while (accum.current >= FIXED_DT && guard < 240) {
        step(bodies.current, params, FIXED_DT);
        accum.current -= FIXED_DT;
        guard++;
      }
    }

    // publish positions + barycenter for the planets
    for (let i = 0; i < 3; i++) simRef.current.positions[i].copy(bodies.current[i].pos);
    barycenter(bodies.current, simRef.current.bary);

    const t = performance.now() * 0.001;

    for (let i = 0; i < 3; i++) {
      const g = groups.current[i];
      if (g) g.position.copy(bodies.current[i].pos);

      const sun = suns[i];
      const agitation = sun.agitation;
      // degraded suns (agitation) shift toward red; the embers state pushes all
      // of them down. A nascent-but-healthy sun (THESIS) stays its own amber.
      liveColor.copy(baseColors[i]);
      if (agitation > 0) liveColor.lerp(EMBER_COLOR, 0.45 * agitation);
      liveColor.lerp(EMBER_COLOR, L.ember * 0.85);

      // THESIS reads dimmer (lum 0.58); QUANT/MLPRED full.
      const lum = L.sunIntensity * (0.5 + 0.5 * sun.lum);

      const core = cores[i];
      if (core) {
        (core.uniforms.uColor.value as THREE.Color).copy(liveColor);
        core.uniforms.uBrightness.value = 1.35 * lum;
        core.uniforms.uTime.value = t + i;
      }
      const cor = coronas[i];
      if (cor) {
        (cor.uniforms.uColor.value as THREE.Color).copy(liveColor);
        cor.uniforms.uBrightness.value = 1.15 * lum;
        cor.uniforms.uAgitation.value = agitation + L.ember * 0.4;
        cor.uniforms.uTime.value = t + i * 1.7;
      }
      const h = halos.current[i];
      if (h) {
        h.color.copy(liveColor);
        h.opacity = 0.5 * lum;
      }
    }
  });

  // Suns are ambient state, NOT navigation — no onClick. Hover surfaces the
  // engine's status line via an invisible hit-sphere.
  const hoverHandlers = (i: number) => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = "help";
      onSunHover(suns[i], e.clientX, e.clientY);
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => onSunHover(suns[i], e.clientX, e.clientY),
    onPointerOut: () => {
      document.body.style.cursor = "auto";
      onSunHover(null, 0, 0);
    },
  });

  return (
    <group>
      {suns.map((s, i) => (
        <group key={s.id} ref={(el) => (groups.current[i] = el)}>
          <mesh material={cores[i]}>
            <icosahedronGeometry args={[0.62, 5]} />
          </mesh>
          <mesh material={coronas[i]}>
            <icosahedronGeometry args={[1.5, 4]} />
          </mesh>
          <sprite scale={[7, 7, 7]}>
            <spriteMaterial
              ref={(el) => {
                if (el) halos.current[i] = el;
              }}
              map={halo}
              color={baseColors[i]}
              transparent
              opacity={0.5}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
          {/* invisible hit-sphere for hover-only status (non-navigating) */}
          <mesh {...hoverHandlers(i)}>
            <sphereGeometry args={[1.3, 12, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
