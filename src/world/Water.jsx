import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { heightAt, MAP_SIZE, LAGOA } from './terrain.js'
import { SUN_DIR, SUN_COLOR, HORIZON, ZENITH } from './env.js'

// Faceted low-poly ocean: vertex waves, depth-based colour from a baked
// bathymetry texture, noise-broken shore-break foam, a fresnel reflection of the
// sky gradient, and a sun glint with twinkling sparkles.
const vert = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float w = sin(wp.x * 0.018 + uTime * 1.1) * 0.7
            + sin(wp.z * 0.025 - uTime * 0.9) * 0.6
            + sin((wp.x + wp.z) * 0.043 + uTime * 1.7) * 0.3;
    // the lagoon is sheltered: barely any swell
    vec2 lq = (wp.xz - vec2(${LAGOA.x.toFixed(1)}, ${LAGOA.z.toFixed(1)})) / vec2(${LAGOA.a.toFixed(1)}, ${LAGOA.b.toFixed(1)});
    wp.y += w * mix(0.1, 1.0, smoothstep(1.15, 1.6, dot(lq, lq)));
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const frag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform sampler2D uDepth;
  uniform float uMapSize;
  varying vec3 vWorld;
  #include <common>
  #include <fog_pars_fragment>

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x), f.y);
  }

  // One travelling wave train: adds its surface slope and (unitless) height.
  // Short waves fade out with distance so they never shimmer.
  void wave(vec2 dir, float len, float steep, float warp, vec2 p, float dist, inout vec2 slope, inout float height) {
    float k = 6.2832 / len;
    float fade = clamp(1.0 - dist / (len * 90.0), 0.0, 1.0);
    float ph = k * dot(dir, p) - sqrt(9.8 * k) * 0.8 * uTime + warp;
    slope += dir * (steep * fade * cos(ph));
    height += steep * fade * sin(ph);
  }

  void main() {
    // faceted base normal from the wave mesh
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (n.y < 0.0) n = -n;
    vec2 xz = vWorld.xz;
    vec2 uv = xz / uMapSize + 0.5;
    float depth = 40.0;
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) depth = texture2D(uDepth, uv).r * 40.0;

    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam);
    vec3 V = toCam / dist;
    float near = 1.0 - smoothstep(500.0, 2200.0, dist);

    // Surface detail: six wave trains rolling in from the open Atlantic toward
    // the coast (-z), from long swell down to chop. They only bend the normal
    // per pixel, so the mesh stays coarse. A slow noise warps their phases so
    // the crests wander instead of forming ruler-straight lines.
    float warp = vnoise(xz * 0.012 + uTime * 0.02) * 6.2832;
    vec2 slope = vec2(0.0);
    float crest = 0.0;
    wave(normalize(vec2(-0.30, -0.95)), 70.0, 0.10, warp, xz, dist, slope, crest);
    wave(normalize(vec2(0.25, -0.97)), 41.0, 0.09, warp * 1.3, xz, dist, slope, crest);
    wave(normalize(vec2(-0.62, -0.78)), 23.0, 0.09, warp * 1.7, xz, dist, slope, crest);
    wave(normalize(vec2(0.55, -0.83)), 13.0, 0.08, warp * 2.3, xz, dist, slope, crest);
    wave(normalize(vec2(-0.10, -1.00)), 7.3, 0.07, warp * 2.9, xz, dist, slope, crest);
    wave(normalize(vec2(0.85, -0.50)), 4.1, 0.06, warp * 3.7, xz, dist, slope, crest);
    float calm = 0.35 + 0.65 * smoothstep(0.3, 6.0, depth); // gentler in the shallows
    // the lagoon: sheltered flat water, darker and greener than the sea, no surf
    vec2 lq = (xz - vec2(${LAGOA.x.toFixed(1)}, ${LAGOA.z.toFixed(1)})) / vec2(${LAGOA.a.toFixed(1)}, ${LAGOA.b.toFixed(1)});
    float lagoon = 1.0 - smoothstep(1.15, 1.5, dot(lq, lq));
    calm *= mix(1.0, 0.3, lagoon);
    slope *= calm;
    crest *= calm / 0.49; // roughly -1..1
    vec3 nw = normalize(n + vec3(-slope.x, 0.0, -slope.y));

    // body colour: turquoise shallows to deep blue, with slow large-scale variation
    vec3 body = mix(uShallow, uDeep, smoothstep(0.5, 16.0, depth));
    body = mix(body, vec3(0.03, 0.20, 0.19), lagoon * 0.75);
    body *= 0.92 + 0.16 * vnoise(xz * 0.0025 + uTime * 0.01);
    // relief: wave faces turned toward the low sun are brighter and warmer, the
    // backs darker; crests are thinner water so they glow a little lighter
    float lit = dot(nw, uSunDir) - uSunDir.y;
    body *= 1.0 + lit * 1.6 + crest * 0.10;
    body += uSunColor * max(lit, 0.0) * 0.10;
    body = mix(body, uShallow * 1.15, clamp(crest, 0.0, 1.0) * 0.22);

    // reflect the same sky gradient Sky.jsx draws, including the sun's glow
    vec3 R = reflect(-V, nw);
    R.y = abs(R.y);
    vec3 sky = mix(uHorizon, uZenith, pow(R.y, 0.55));
    float sr = max(dot(R, uSunDir), 0.0);
    sky += uSunColor * (pow(sr, 8.0) * 0.35 + pow(sr, 60.0) * 0.8);
    float fres = 0.04 + 0.8 * pow(1.0 - max(dot(nw, V), 0.0), 4.0);
    vec3 col = mix(body, sky, fres);

    // sun glint on the wave faces, plus small twinkling sparkles along the sun path
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(nw, H), 0.0), 90.0);
    float ph = hash21(floor(xz / 2.5)) * 6.2832;
    vec3 tilt = vec3(cos(ph), 0.0, sin(ph)) * (0.10 + 0.08 * sin(uTime * 3.0 + ph * 5.0));
    float spark = pow(max(dot(normalize(nw + tilt), H), 0.0), 500.0) * near;
    col += uSunColor * (spec * 1.6 + spark * 5.0);

    // a few whitecaps where the wave trains pile up
    float cap = (1.0 - lagoon) * smoothstep(0.5, 0.8, crest) * smoothstep(0.45, 0.75, vnoise(xz * 0.35 + uTime * 0.15)) * near;
    col = mix(col, vec3(1.0, 0.98, 0.94), cap * 0.7);

    // shore break: uneven foam lines rolling in, sharp at the front and fading
    // behind, with lacy gaps, plus a wash right at the waterline
    float fn = vnoise(xz * 0.06 + vec2(uTime * 0.05, 0.0));
    float band = (1.0 - lagoon) * (1.0 - smoothstep(0.3, 3.2, depth));
    float s = fract((depth * 4.0 + uTime * 2.2 + fn * 1.8) / 6.2832);
    float line = smoothstep(0.0, 0.05, s) * (1.0 - smoothstep(0.1, 0.45, s));
    float lace = smoothstep(0.3, 0.7, vnoise(xz * 0.5 + uTime * 0.2));
    float foam = band * line * (0.5 + 0.4 * lace) + (1.0 - smoothstep(0.1, 0.5 + fn * 0.5, depth));
    col = mix(col, vec3(1.0, 0.98, 0.94), clamp(foam, 0.0, 1.0) * 0.85);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

function bakeDepth() {
  const N = 512
  const data = new Uint8Array(N * N * 4)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1) - 0.5) * MAP_SIZE
      const z = (j / (N - 1) - 0.5) * MAP_SIZE
      const d = Math.min(40, Math.max(0, -heightAt(x, z)))
      const o = (j * N + i) * 4
      data[o] = (d / 40) * 255
      data[o + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

export default function Water() {
  const mat = useRef()
  const { geometry, uniforms } = useMemo(() => {
    const g = new THREE.PlaneGeometry(16000, 16000, 260, 260)
    g.rotateX(-Math.PI / 2)
    const u = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSunDir: { value: SUN_DIR.clone() },
        uSunColor: { value: SUN_COLOR.clone() },
        uHorizon: { value: HORIZON.clone() },
        uZenith: { value: ZENITH.clone() },
        uDeep: { value: new THREE.Color('#0d3f63') },
        uShallow: { value: new THREE.Color('#2fb6ad') },
        uDepth: { value: null },
        uMapSize: { value: MAP_SIZE },
      },
    ])
    u.uDepth.value = bakeDepth()
    return { geometry: g, uniforms: u }
  }, [])

  useFrame((_, dt) => {
    if (mat.current) mat.current.uniforms.uTime.value += dt
  })

  return (
    <mesh geometry={geometry} position={[0, -0.3, 0]} receiveShadow={false}>
      <shaderMaterial ref={mat} vertexShader={vert} fragmentShader={frag} uniforms={uniforms} fog />
    </mesh>
  )
}
