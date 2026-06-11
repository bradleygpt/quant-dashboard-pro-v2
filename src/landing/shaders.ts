// Custom materials for the tri-star landing. Suns are layered ADDITIVE glow
// (bright core + limb corona + far halo) — never MeshBasicMaterial balls.
// Planets are near-silhouettes lit only by a thin Fresnel rim that catches the
// suns. Bloom + ACES tone mapping in the post chain do the heavy lifting.

import * as THREE from "three";

// Cheap animated turbulence — a few stacked sines, NO raymarching, keeps the
// corona shader well inside the perf budget.
const NOISE_GLSL = /* glsl */ `
  float fbm(vec3 p){
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * sin(p.x * 1.3 + p.y * 1.7 + p.z * 1.1 + float(i) * 2.1);
      p *= 1.94;
      a *= 0.5;
    }
    return v * 0.5 + 0.5;
  }
`;

// ----- sun core ---------------------------------------------------------------
// A small, intensely bright body with gentle limb darkening so the centre reads
// hotter than the edge. Additive so overlapping layers accumulate luminance.
export function makeCoreMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uBrightness: { value: 1.0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vView;
      void main(){
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uBrightness;
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vView;
      void main(){
        float facing = max(dot(vN, vView), 0.0);
        // hotter, whiter centre; cooler tinted limb
        float limb = pow(facing, 0.55);
        vec3 hot = mix(uColor, vec3(1.0), 0.55 * limb);
        float flick = 0.96 + 0.04 * sin(uTime * 3.0);
        gl_FragColor = vec4(hot * uBrightness * (0.55 + 0.9 * limb) * flick, 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// ----- sun corona -------------------------------------------------------------
// A larger shell whose alpha is a Fresnel limb-glow modulated by slow
// turbulence. Agitation (1 - health) makes a degraded sun's corona seethe.
export function makeCoronaMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uBrightness: { value: 1.0 },
      uFalloff: { value: 2.6 },
      uAgitation: { value: 0.0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vPos;
      void main(){
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        vPos = position;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uBrightness;
      uniform float uFalloff;
      uniform float uAgitation;
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vPos;
      ${NOISE_GLSL}
      void main(){
        float fres = pow(1.0 - max(dot(vN, vView), 0.0), uFalloff);
        float n = fbm(vPos * 1.6 + vec3(0.0, 0.0, uTime * 0.35));
        float seethe = mix(0.78, 0.4 + 1.1 * n, clamp(uAgitation, 0.0, 1.0));
        float a = fres * uBrightness * seethe;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

// ----- far halo texture -------------------------------------------------------
// A soft radial gradient on a billboarded plane — the diffuse outer glow that
// gives each sun real atmospheric depth before bloom even touches it.
export function makeHaloTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.25, "rgba(255,255,255,0.35)");
  g.addColorStop(0.55, "rgba(255,255,255,0.08)");
  g.addColorStop(1.0, "rgba(255,255,255,0.0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ----- planet (Fresnel-rim silhouette) ----------------------------------------
// Dark body; a thin rim catches the suns. The rim only carries the tab's accent
// colour on hover — otherwise the planets stay near-monochrome silhouettes.
export function makePlanetMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBaseColor: { value: new THREE.Color("#0a0f17") },
      uRimColor: { value: new THREE.Color("#6f7d93") },
      uAccent: { value: new THREE.Color("#5BA8FF") },
      uRimPower: { value: 3.1 },
      uRimStrength: { value: 1.0 },
      uHover: { value: 0.0 },
      uLightDir: { value: new THREE.Vector3(0, 0, 1) },
      uAmbient: { value: 0.16 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vWorldN;
      void main(){
        vN = normalize(normalMatrix * normal);
        vWorldN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBaseColor;
      uniform vec3 uRimColor;
      uniform vec3 uAccent;
      uniform float uRimPower;
      uniform float uRimStrength;
      uniform float uHover;
      uniform vec3 uLightDir;
      uniform float uAmbient;
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vWorldN;
      void main(){
        float fres = pow(1.0 - max(dot(vN, vView), 0.0), uRimPower);
        // rim is brightest where the silhouette faces the suns
        float sunFace = clamp(dot(vWorldN, normalize(uLightDir)), 0.0, 1.0);
        float rimAmt = fres * (0.28 + 0.72 * sunFace) * uRimStrength;
        vec3 rimCol = mix(uRimColor, uAccent, uHover);
        rimAmt *= (1.0 + uHover * 0.9);
        // faint terminator wash on the lit hemisphere keeps it from going pure black
        float wash = uAmbient * (0.35 + 0.65 * sunFace);
        vec3 col = uBaseColor * (1.0 + wash) + rimCol * rimAmt;
        // a whisper of accent fill on hover, never painted-on
        col += uAccent * uHover * 0.06;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    transparent: false,
  });
}

// ----- star field -------------------------------------------------------------
// Points with per-star size/brightness variance and an occasional faint
// twinkle — no uniform white dots.
export function makeStarMaterial(opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute float aBright;
      varying float vBright;
      varying float vTw;
      uniform float uTime;
      uniform float uPixelRatio;
      void main(){
        vBright = aBright;
        vTw = 0.75 + 0.25 * sin(uTime * 1.3 + aPhase * 6.2831);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio * (260.0 / max(-mv.z, 0.001));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vBright;
      varying float vTw;
      void main(){
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        if (r > 0.5) discard;
        float core = smoothstep(0.5, 0.0, r);
        // cool steel-white stars, slight blue bias
        vec3 col = mix(vec3(0.72, 0.78, 0.92), vec3(1.0), vBright);
        gl_FragColor = vec4(col, core * vBright * vTw * uOpacity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}
