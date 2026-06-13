import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { PLANETS, BAND_RADIUS, type PlanetDef } from "./mockData";
import { makePlanetMaterial } from "./shaders";
import type { SimState, LiveLighting } from "./runtime";

interface Props {
  simRef: React.MutableRefObject<SimState>;
  lightingRef: React.MutableRefObject<LiveLighting>;
  frozen: boolean;
  hoveredId: string | null;
  onHover: (def: PlanetDef | null, x: number, y: number) => void;
  onSelect: (def: PlanetDef) => void;
}

const ORBIT_SPEED = 0.16;

interface Orbit {
  a: number;
  b: number;
  focus: number;
  anomaly0: number;
  longitude: number;
  cosI: number;
  sinI: number;
  speed: number;
}

export default function Planets({ simRef, lightingRef, frozen, hoveredId, onHover, onSelect }: Props) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const mats = useRef<THREE.ShaderMaterial[]>([]);
  const elapsed = useRef(0);
  const tmp = useRef(new THREE.Vector3());
  const lightDir = useRef(new THREE.Vector3());

  const orbits = useMemo<Orbit[]>(
    () =>
      PLANETS.map((p) => {
        const a = BAND_RADIUS[p.band];
        const b = a * Math.sqrt(1 - p.ecc * p.ecc);
        return {
          a,
          b,
          focus: a * p.ecc,
          anomaly0: p.phase * 1.3,
          longitude: p.phase,
          cosI: Math.cos(p.incl),
          sinI: Math.sin(p.incl),
          speed: p.speed,
        };
      }),
    [],
  );

  const materials = useMemo(
    () =>
      PLANETS.map((p) => {
        const m = makePlanetMaterial();
        (m.uniforms.uAccent.value as THREE.Color).set(p.accent);
        // c78q is the flagship inner planet — a self-lit accent body that stays
        // the brightest planet (it is downstream of MLPred, not a pillar sun).
        if (p.flagship) {
          (m.uniforms.uBaseColor.value as THREE.Color).set("#0e3a20");
          (m.uniforms.uRimColor.value as THREE.Color).set(p.accent);
        }
        return m;
      }),
    [],
  );
  materials.forEach((m, i) => (mats.current[i] = m));

  useFrame((_, deltaRaw) => {
    const delta = Math.min(deltaRaw, 1 / 30);
    if (!frozen) elapsed.current += delta;
    const t = elapsed.current;
    const L = lightingRef.current;
    const bary = simRef.current.bary;

    for (let i = 0; i < PLANETS.length; i++) {
      const o = orbits[i];
      const theta = o.anomaly0 + t * o.speed * ORBIT_SPEED;
      // parametric ellipse with the barycenter at one focus
      const lx = o.a * Math.cos(theta) - o.focus;
      const ly = o.b * Math.sin(theta);
      // inclination tilt about X, then longitude rotation about Y
      const px = lx;
      const py = ly * o.cosI;
      const pz = ly * o.sinI;
      const cosL = Math.cos(o.longitude);
      const sinL = Math.sin(o.longitude);
      const wx = px * cosL + pz * sinL;
      const wz = -px * sinL + pz * cosL;

      const g = groups.current[i];
      if (g) {
        g.position.set(bary.x + wx, bary.y + py, bary.z + wz);
        g.rotation.y += delta * 0.18 * (frozen ? 0 : 1);
      }

      const m = mats.current[i];
      if (m) {
        // rim catches the suns: light points from planet toward the barycenter
        tmp.current.set(bary.x + wx, bary.y + py, bary.z + wz);
        lightDir.current.subVectors(bary, tmp.current).normalize();
        (m.uniforms.uLightDir.value as THREE.Vector3).copy(lightDir.current);
        m.uniforms.uRimStrength.value = L.rim * (PLANETS[i].flagship ? 1.8 : 1);
        m.uniforms.uAmbient.value = L.ambient * (PLANETS[i].flagship ? 1.6 : 1);
        const target = hoveredId === PLANETS[i].tabId ? 1 : 0;
        m.uniforms.uHover.value += (target - m.uniforms.uHover.value) * Math.min(1, delta * 8);
      }
    }
  });

  return (
    <group>
      {PLANETS.map((p, i) => {
        const handleOver = (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
          onHover(p, e.clientX, e.clientY);
        };
        const handleMove = (e: ThreeEvent<PointerEvent>) => {
          if (hoveredId === p.tabId) onHover(p, e.clientX, e.clientY);
        };
        const handleOut = () => {
          document.body.style.cursor = "auto";
          onHover(null, 0, 0);
        };
        const handleClick = (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect(p);
        };
        return (
          <group key={p.tabId} ref={(el) => (groups.current[i] = el)}>
            <mesh
              material={materials[i]}
              onPointerOver={handleOver}
              onPointerMove={handleMove}
              onPointerOut={handleOut}
              onClick={handleClick}
            >
              {p.ring ? (
                <torusGeometry args={[p.size, p.size * 0.1, 8, 96]} />
              ) : (
                <icosahedronGeometry args={[p.size, 3]} />
              )}
            </mesh>
            {/* slightly larger transparent hit-sphere so small planets stay
                clickable (three.js skips raycasts on visible={false} meshes). */}
            <mesh
              onPointerOver={handleOver}
              onPointerMove={handleMove}
              onPointerOut={handleOut}
              onClick={handleClick}
            >
              <sphereGeometry args={[p.size * 1.7, 10, 10]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
