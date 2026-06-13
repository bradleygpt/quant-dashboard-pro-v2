import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { LiveLighting } from "./runtime";

// A large inward-facing gradient sky dome. In trading hours it is a lit
// high-altitude sky (deep-blue zenith → pale horizon haze); off-hours it eases
// through dawn/dusk; Closed collapses to the deep-space void. Colors are driven
// every frame by the live (interpolated) lighting, so the day/night cycle
// cross-fades smoothly. Drawn first, behind the stars and bodies.
export default function SkyDome({ lightingRef }: { lightingRef: React.MutableRefObject<LiveLighting> }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: new THREE.Color("#2E6FB7") },
          uBottom: { value: new THREE.Color("#CFE7F6") },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main(){
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uBottom;
          varying vec3 vDir;
          void main(){
            float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
            float t = pow(h, 0.7); // atmospheric falloff toward the horizon
            gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0);
          }
        `,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  useFrame(() => {
    const L = lightingRef.current;
    (mat.uniforms.uTop.value as THREE.Color).copy(L.skyTop);
    (mat.uniforms.uBottom.value as THREE.Color).copy(L.skyBottom);
  });

  return (
    <mesh material={mat} scale={400} renderOrder={-1}>
      <sphereGeometry args={[1, 32, 24]} />
    </mesh>
  );
}
