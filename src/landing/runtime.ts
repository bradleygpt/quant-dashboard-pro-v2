// Shared mutable runtime state passed by ref between the scene components, so
// the physics step and the per-frame lighting interpolation happen exactly
// once and everyone else just reads the latest values.

import * as THREE from "three";

export interface SimState {
  /** live world positions of the three suns. */
  positions: THREE.Vector3[];
  /** mass-weighted barycenter the planets orbit. */
  bary: THREE.Vector3;
}

export interface LiveLighting {
  sunIntensity: number;
  rim: number;
  starOpacity: number;
  bloom: number;
  ember: number;
  ambient: number;
  exposure: number;
  /** live (interpolated) background haze color — also the fog color. */
  bg: THREE.Color;
  /** live gradient-sky-dome colors (zenith + horizon). */
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
}

export function makeSimState(): SimState {
  return {
    positions: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    bary: new THREE.Vector3(),
  };
}

export function makeLiveLighting(): LiveLighting {
  return {
    sunIntensity: 1, rim: 1, starOpacity: 0.5, bloom: 1.15, ember: 0, ambient: 0.18, exposure: 1,
    bg: new THREE.Color("#8EC0E6"), skyTop: new THREE.Color("#2E6FB7"), skyBottom: new THREE.Color("#CFE7F6"),
  };
}

/** deep amber-red the suns decay toward in the Closed / Holiday "embers" state. */
export const EMBER_COLOR = new THREE.Color("#ff5a28");
