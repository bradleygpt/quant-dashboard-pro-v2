// Damped tri-star gravitational simulation for the three suns. Velocity-Verlet
// integration of softened Newtonian gravity with velocity damping and a per-body
// "station" spring. A single chaos parameter in [0,1] blends two regimes — and,
// crucially, drives the STATION SEPARATION so the eras read correctly:
//   chaos≈0  STABLE  : stations wide apart, strong spring, weak mutual gravity
//                      → three calm, near-independent suns, well separated.
//   chaos≈1  CHAOTIC : stations collapse toward the centre, spring loosens, and
//                      mutual gravity dominates → close-range tri-star interplay.
// We never keyframe; the unpredictability in the chaotic regime is real.

import * as THREE from "three";

export interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  acc: THREE.Vector3;
  mass: number;
  /** the sun's wide "home" station; the spring pulls toward home*sep. */
  home: THREE.Vector3;
}

export interface SimParams {
  G: number;
  damping: number;
  spring: number;
  softening: number;
  timeScale: number;
  /** station separation scale: 1 = wide/separated (stable) → ~0.16 = converged (chaotic). */
  sep: number;
}

const lerp = THREE.MathUtils.lerp;

/**
 * Blend the Stable Era (chaos≈0: wide, separated, calm) into the Chaotic Era
 * (chaos≈1: converged, fast, erratic). A smootherstep on chaos eases the regime
 * change so toggling between eras glides rather than ramps. The spring and
 * damping never reach zero, which keeps the suns on-screen even at full chaos.
 */
export function paramsForChaos(chaos: number): SimParams {
  const t = THREE.MathUtils.clamp(chaos, 0, 1);
  const e = t * t * t * (t * (t * 6 - 15) + 10); // smootherstep
  return {
    G: lerp(0.30, 2.15, e),         // weak (stations dominate) → strong (mutual interplay)
    damping: lerp(0.11, 0.014, e),  // calm → lively
    spring: lerp(0.115, 0.026, e),  // firmly stationed → loosely tethered
    softening: lerp(1.25, 0.55, e),
    timeScale: lerp(0.5, 1.25, e),
    sep: lerp(1.0, 0.16, e),        // wide separated → converged to centre
  };
}

const STATION_R = 4.8;

export function initBodies(masses: number[]): Body[] {
  // Equilateral triangle of wide home stations, each with a small tangential
  // velocity and a touch of asymmetry so the chaotic regime has something to
  // amplify once the stations collapse together.
  const seeds = [Math.PI * 0.5, Math.PI * (0.5 + 2 / 3), Math.PI * (0.5 + 4 / 3)];
  const jit = [0.0, 0.05, -0.04];
  return seeds.map((a, i) => {
    const home = new THREE.Vector3(Math.cos(a) * STATION_R, Math.sin(a) * STATION_R * 0.9, Math.sin(a * 1.7) * 0.5);
    const tang = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0).multiplyScalar(0.34 + jit[i]);
    tang.z += (i - 1) * 0.04;
    return { pos: home.clone(), vel: tang, acc: new THREE.Vector3(), mass: masses[i] ?? 1, home };
  });
}

const _d = new THREE.Vector3();
const _tgt = new THREE.Vector3();

function computeAccelerations(bodies: Body[], p: SimParams): void {
  for (const b of bodies) b.acc.set(0, 0, 0);
  const soft2 = p.softening * p.softening;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      _d.subVectors(bodies[j].pos, bodies[i].pos);
      const r2 = _d.lengthSq() + soft2;
      const invR3 = 1 / (r2 * Math.sqrt(r2));
      bodies[i].acc.addScaledVector(_d, p.G * bodies[j].mass * invR3);
      bodies[j].acc.addScaledVector(_d, -p.G * bodies[i].mass * invR3);
    }
  }
  // per-body station spring toward home*sep — chaos pulls every station inward,
  // which is what converges the suns in the chaotic era and separates them in
  // the stable era. Easing `sep` (not teleporting it) makes the migration smooth.
  for (const b of bodies) {
    _tgt.copy(b.home).multiplyScalar(p.sep);
    b.acc.x += -p.spring * (b.pos.x - _tgt.x);
    b.acc.y += -p.spring * (b.pos.y - _tgt.y);
    b.acc.z += -p.spring * (b.pos.z - _tgt.z);
  }
}

const MAX_SPEED = 4.5;

/** One velocity-Verlet step with post-step exponential velocity damping. */
export function step(bodies: Body[], p: SimParams, dt: number): void {
  computeAccelerations(bodies, p);
  for (const b of bodies) {
    b.pos.addScaledVector(b.vel, dt).addScaledVector(b.acc, 0.5 * dt * dt);
  }
  const oldAcc = bodies.map((b) => b.acc.clone());
  computeAccelerations(bodies, p);
  const damp = Math.max(0, 1 - p.damping * dt);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.vel.addScaledVector(oldAcc[i].add(b.acc), 0.5 * dt);
    b.vel.multiplyScalar(damp);
    if (b.vel.lengthSq() > MAX_SPEED * MAX_SPEED) b.vel.setLength(MAX_SPEED);
  }
}

export function barycenter(bodies: Body[], out: THREE.Vector3): THREE.Vector3 {
  out.set(0, 0, 0);
  let m = 0;
  for (const b of bodies) {
    out.addScaledVector(b.pos, b.mass);
    m += b.mass;
  }
  return out.multiplyScalar(1 / Math.max(m, 1e-6));
}
