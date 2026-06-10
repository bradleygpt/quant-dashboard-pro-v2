import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SUNS } from "./mockData";
import { initBodies, paramsForChaos, step, barycenter, type Body } from "./threeBody";
import { makeCoreMaterial, makeCoronaMaterial, makeHaloTexture } from "./shaders";
import { EMBER_COLOR, type SimState, type LiveLighting } from "./runtime";

interface Props {
  simRef: React.MutableRefObject<SimState>;
  lightingRef: React.MutableRefObject<LiveLighting>;
  chaos: number;
  frozen: boolean;
}

const FIXED_DT = 1 / 120;
const MAX_FRAME = 1 / 30;

export default function Suns({ simRef, lightingRef, chaos, frozen }: Props) {
  const halo = useMemo(() => makeHaloTexture(), []);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const halos = useRef<THREE.SpriteMaterial[]>([]);

  // physics state lives in a ref so it survives re-renders / chaos changes
  const bodies = useRef<Body[]>(initBodies(SUNS.map((s) => s.mass)));
  const accum = useRef(0);
  const params = useMemo(() => paramsForChaos(chaos), [chaos]);

  const baseColors = useMemo(() => SUNS.map((s) => new THREE.Color(s.color)), []);
  const liveColor = useMemo(() => new THREE.Color(), []);

  // build the layered shader materials exactly once — they're driven by uniforms
  const cores = useMemo(() => SUNS.map((_, i) => makeCoreMaterial(baseColors[i])), [baseColors]);
  const coronas = useMemo(() => SUNS.map((_, i) => makeCoronaMaterial(baseColors[i])), [baseColors]);

  useFrame((_, deltaRaw) => {
    const delta = Math.min(deltaRaw, MAX_FRAME);
    const L = lightingRef.current;

    // ----- advance the three-body sim (frozen in Closed state) -----
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

      const health = SUNS[i].health;
      const agitation = 1 - health;
      // degraded suns dim and shift toward red; embers state pushes all of them down
      liveColor.copy(baseColors[i]);
      if (health < 1) liveColor.lerp(EMBER_COLOR, 0.45 * agitation);
      liveColor.lerp(EMBER_COLOR, L.ember * 0.85);

      const lum = L.sunIntensity * (0.55 + 0.45 * health);

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

  return (
    <group>
      {SUNS.map((s, i) => {
        return (
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
          </group>
        );
      })}
    </group>
  );
}
