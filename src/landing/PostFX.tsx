import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, Noise, ToneMapping } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode, type BloomEffect, type NoiseEffect } from "postprocessing";
import type { LiveLighting } from "./runtime";

interface Props {
  lightingRef: React.MutableRefObject<LiveLighting>;
}

// Drives bloom strength, film-grain weight and tone-mapping exposure from the
// live (interpolated) lighting state every frame, so market-state transitions
// flow through the whole post chain — not just the scene lights.
function PostDriver({ lightingRef, bloom, noise }: Props & {
  bloom: React.MutableRefObject<BloomEffect | null>;
  noise: React.MutableRefObject<NoiseEffect | null>;
}) {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    const L = lightingRef.current;
    if (bloom.current) bloom.current.intensity = L.bloom;
    if (noise.current) noise.current.blendMode.opacity.value = 0.05;
    gl.toneMappingExposure = L.exposure;
  });
  return null;
}

export default function PostFX({ lightingRef }: Props) {
  const bloom = useRef<BloomEffect | null>(null);
  const noise = useRef<NoiseEffect | null>(null);

  // very low, fixed film grain — set once, kept subtle
  useEffect(() => {
    if (noise.current) noise.current.blendMode.opacity.value = 0.05;
  }, []);

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        ref={(e) => (bloom.current = (e as unknown as BloomEffect) ?? null)}
        intensity={1.15}
        luminanceThreshold={0.2}
        luminanceSmoothing={0.85}
        mipmapBlur
        radius={0.7}
      />
      <Vignette eskil={false} offset={0.28} darkness={0.62} />
      <Noise
        ref={(e) => (noise.current = (e as unknown as NoiseEffect) ?? null)}
        premultiply
        blendFunction={BlendFunction.SOFT_LIGHT}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <PostDriver lightingRef={lightingRef} bloom={bloom} noise={noise} />
    </EffectComposer>
  );
}
