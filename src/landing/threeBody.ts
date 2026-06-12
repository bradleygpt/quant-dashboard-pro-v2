// A real damped three-body gravitational simulation for the three suns.
// Velocity-Verlet integration of softened Newtonian gravity, with light
// velocity damping and a weak centering spring so the system never ejects a
// body off-screen. Two regimes (Stable / Chaotic) are blended by a single
// chaos parameter in [0,1] — we do NOT keyframe; the unpredictability is real.

import * as THREE from "three";

export interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  acc: THREE.Vector3;
  mass: number;
}

export interface SimParams {
  G: number;
  damping: number;
  spring: number;
  softening: number;
  timeScale: number;
}

const lerp = THREE.MathUtils.lerp;

/**
 * Blend the Stable Era (chaos≈0: wide, slow, almost-periodic) into the
 * Chaotic Era (chaos≈1: tighter, faster, visibly erratic). The centering
 * spring and damping never reach zero, which is what keeps the suns on-screen.
 */
export function paramsForChaos(chaos: number): SimParams {
  const t = THREE.MathUtils.clamp(chaos, 0, 1);
  return {
    G: lerp(0.55, 1.9, t),
    damping: lerp(0.05, 0.012, t),
    spring: lerp(0.062, 0.022, t),
    softening: lerp(1.35, 0.62, t),
    timeScale: lerp(0.55, 1.18, t),
  };
}

export function initBodies(masses: number[]): Body[] {
  // Equilateral-ish triangle with tangential velocities for orbital motion,
  // plus a tiny asymmetry so the chaotic regime has something to amplify.
  const R = 3.0;
  const v0 = 0.62;
  const seeds = [
    { a: Math.PI * 0.5, jitter: 0.0 },
    { a: Math.PI * (0.5 + 2 / 3), jitter: 0.04 },
    { a: Math.PI * (0.5 + 4 / 3), jitter: -0.03 },
  ];
  return seeds.map((s, i) => {
    const pos = new THREE.Vector3(Math.cos(s.a) * R, Math.sin(s.a) * R * 0.92, Math.sin(s.a * 1.7) * 0.6);
    // tangential direction (perpendicular to radius in the orbital plane)
    const tang = new THREE.Vector3(-Math.sin(s.a), Math.cos(s.a), 0).multiplyScalar(v0 + s.jitter);
    tang.z += (i - 1) * 0.05;
    return { pos, vel: tang, acc: new THREE.Vector3(), mass: masses[i] ?? 1 };
  });
}

function computeAccelerations(bodies: Body[], p: SimParams): void {
  for (const b of bodies) b.acc.set(0, 0, 0);
  const soft2 = p.softening * p.softening;
  const d = new THREE.Vector3();
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      d.subVectors(bodies[j].pos, bodies[i].pos);
      const r2 = d.lengthSq() + soft2;
      const invR3 = 1 / (r2 * Math.sqrt(r2));
      const fi = p.G * bodies[j].mass * invR3;
      const fj = p.G * bodies[i].mass * invR3;
      bodies[i].acc.addScaledVector(d, fi);
      bodies[j].acc.addScaledVector(d, -fj);
    }
  }
  // weak centering spring toward the origin (system barycenter anchor)
  for (const b of bodies) b.acc.addScaledVector(b.pos, -p.spring);
}

const MAX_SPEED = 4.5;

/** One velocity-Verlet step with post-step exponential velocity damping. */
export function step(bodies: Body[], p: SimParams, dt: number): void {
  computeAccelerations(bodies, p);
  for (const b of bodies) {
    // x += v dt + 0.5 a dt^2
    b.pos.addScaledVector(b.vel, dt).addScaledVector(b.acc, 0.5 * dt * dt);
  }
  // stash old accelerations, recompute at new positions
  const oldAcc = bodies.map((b) => b.acc.clone());
  computeAccelerations(bodies, p);
  const damp = Math.max(0, 1 - p.damping * dt);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    // v += 0.5 (a_old + a_new) dt
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
