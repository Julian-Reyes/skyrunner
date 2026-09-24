import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { heightAt, MAP_SIZE } from './terrain.js'
import { SUN_DIR, SUN_COLOR, HORIZON } from './env.js'

// Faceted low-poly ocean: vertex waves, depth-based colour from a baked
// bathymetry texture, animated shore-break foam, fresnel sky reflection, sun glint.
const vert = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float w = sin(wp.x * 0.018 + uTime * 1.1) * 0.7
            + sin(wp.z * 0.025 - uTime * 0.9) * 0.6
            + sin((wp.x + wp.z) * 0.043 + uTime * 1.7) * 0.3;
    wp.y += w;
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
  uniform vec3 uSky;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform sampler2D uDepth;
  uniform float uMapSize;
  varying vec3 vWorld;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (n.y < 0.0) n = -n;
    vec2 uv = vWorld.xz / uMapSize + 0.5;
    float depth = 40.0;
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) depth = texture2D(uDepth, uv).r * 40.0;

    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    vec3 col = mix(uShallow, uDeep, smoothstep(0.5, 16.0, depth));
    col = mix(col, uSky, clamp(fres * 0.75, 0.0, 0.85));

    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(n, H), 0.0), 90.0);
    col += uSunColor * spec * 2.5;

    // shore break: bands travelling toward the beach
    float band = 1.0 - smoothstep(0.0, 3.0, depth);
    float wave = sin(depth * 4.0 - uTime * 2.2 + vWorld.x * 0.015) * 0.5 + 0.5;
    float foam = band * step(0.55, wave) + (1.0 - smoothstep(0.1, 0.7, depth));
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
        uSky: { value: HORIZON.clone().lerp(new THREE.Color('#8fb3d9'), 0.4) },
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
