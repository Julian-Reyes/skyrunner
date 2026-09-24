import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SUN_DIR, HORIZON, ZENITH, SUN_COLOR } from './env.js'

// Gradient sky dome whose horizon colour matches the fog, with a sun disc + glow.
const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`
const frag = /* glsl */ `
  uniform vec3 uSunDir, uHorizon, uZenith, uSun;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
    float s = max(dot(d, uSunDir), 0.0);
    col += uSun * pow(s, 8.0) * 0.45;           // wide glow
    col += uSun * pow(s, 60.0) * 0.8;
    col += vec3(1.0, 0.9, 0.75) * smoothstep(0.9993, 0.9997, s) * 6.0; // disc (blooms)
    // warm band just above the horizon
    col = mix(col, vec3(1.0, 0.62, 0.42), (1.0 - smoothstep(0.0, 0.12, h)) * 0.35 * (0.4 + 0.6 * pow(s, 2.0)));
    if (d.y < 0.0) col = uHorizon;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export default function Sky() {
  const ref = useRef()
  const uniforms = useMemo(
    () => ({
      uSunDir: { value: SUN_DIR },
      uHorizon: { value: HORIZON },
      uZenith: { value: ZENITH },
      uSun: { value: SUN_COLOR },
    }),
    []
  )
  useFrame(({ camera }) => ref.current && ref.current.position.copy(camera.position))
  return (
    <mesh ref={ref} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[10000, 32, 16]} />
      <shaderMaterial
        vertexShader={vert}
        fragmentShader={frag}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}
