import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { makeStarMaterial } from "./shaders";
import type { LiveLighting } from "./runtime";

interface Props {
  lightingRef: React.MutableRefObject<LiveLighting>;
}

interface LayerSpec {
  count: number;
  radius: number;
  spread: number;
  sizeMin: number;
  sizeMax: number;
  parallax: number;
  opacityScale: number;
}

function buildLayer(spec: LayerSpec): { geom: THREE.BufferGeometry; mat: THREE.ShaderMaterial } {
  const n = spec.count;
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  const bright = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // shell with depth jitter so layers read as volume, not a sphere wall
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = spec.radius + (Math.random() - 0.5) * spec.spread;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = r * s * Math.cos(theta);
    pos[i * 3 + 1] = r * s * Math.sin(theta) * 0.7;
    pos[i * 3 + 2] = r * u - spec.radius * 0.4;
    size[i] = THREE.MathUtils.lerp(spec.sizeMin, spec.sizeMax, Math.pow(Math.random(), 2.2));
    phase[i] = Math.random();
    bright[i] = 0.35 + 0.65 * Math.pow(Math.random(), 1.6);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geom.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geom.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));
  const mat = makeStarMaterial(spec.opacityScale);
  return { geom, mat };
}

export default function Stars({ lightingRef }: Props) {
  const small = typeof window !== "undefined" && window.innerWidth < 768;
  const half = small ? 0.5 : 1;

  const specs = useMemo<LayerSpec[]>(
    () => [
      { count: Math.round(1100 * half), radius: 60, spread: 30, sizeMin: 0.6, sizeMax: 2.2, parallax: 2.4, opacityScale: 1.0 },
      { count: Math.round(900 * half), radius: 110, spread: 50, sizeMin: 0.5, sizeMax: 1.6, parallax: 1.3, opacityScale: 0.8 },
      { count: Math.round(700 * half), radius: 175, spread: 70, sizeMin: 0.4, sizeMax: 1.2, parallax: 0.6, opacityScale: 0.6 },
    ],
    [half],
  );

  const layers = useMemo(() => specs.map(buildLayer), [specs]);
  const groups = useRef<(THREE.Group | null)[]>([]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const L = lightingRef.current;
    const px = state.pointer.x;
    const py = state.pointer.y;
    for (let i = 0; i < layers.length; i++) {
      const g = groups.current[i];
      if (g) {
        const k = specs[i].parallax;
        g.position.x += (px * k - g.position.x) * Math.min(1, delta * 2);
        g.position.y += (py * k - g.position.y) * Math.min(1, delta * 2);
      }
      const m = layers[i].mat;
      m.uniforms.uTime.value = t;
      m.uniforms.uOpacity.value = L.starOpacity * specs[i].opacityScale;
    }
  });

  return (
    <>
      {layers.map((l, i) => (
        <group key={i} ref={(el) => (groups.current[i] = el)}>
          <points geometry={l.geom} material={l.mat} />
        </group>
      ))}
    </>
  );
}
