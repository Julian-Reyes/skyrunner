import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SUN_DIR, SUN_COLOR, FOG_COLOR, FOG_NEAR, FOG_FAR } from './world/env.js'
import { game } from './game.js'

// The sun never moves and every shadow caster is static, so the shadow map is
// only re-rendered when the area it covers has to shift: once on the title
// screen, and every REDRAW_DIST metres of flight. The flight frustum is padded
// by that distance so coverage around the plane never drops below ~450 m.
// Moving objects don't cast into it (they would freeze between redraws); the
// plane gets a cheap blob shadow instead (see Plane.jsx).
const SHADOW_MAP = 2048
const TITLE_SIZE = 2200
const FLIGHT_SIZE = 520
const REDRAW_DIST = 64
const SUN_DISTANCE = 1500
const TITLE_FOCUS = new THREE.Vector3(0, 0, -300)

// Shadow camera axes (same basis lookAt() builds), used to snap the map centre
// to whole texels so shadow edges don't crawl each time it is re-centred.
const lightRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize()
const lightUp = new THREE.Vector3().crossVectors(SUN_DIR, lightRight)
const center = new THREE.Vector3()
const snapOffset = (v, texel) => Math.round(v / texel) * texel - v

export default function Lights() {
  const sun = useRef()
  const { scene, gl } = useThree()
  useEffect(() => {
    scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR)
    scene.add(sun.current.target)
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => { gl.shadowMap.autoUpdate = true }
  }, [scene, gl])

  useFrame(() => {
    const title = game.phase === 'title'
    const focus = title ? TITLE_FOCUS : game.pos
    const size = title ? TITLE_SIZE : FLIGHT_SIZE
    const s = sun.current
    const cam = s.shadow.camera
    const resized = cam.right !== size
    if (!resized && focus.distanceToSquared(center) < REDRAW_DIST * REDRAW_DIST) return

    if (resized) {
      cam.left = -size
      cam.right = size
      cam.top = size
      cam.bottom = -size
      cam.updateProjectionMatrix()
    }
    const texel = (2 * size) / SHADOW_MAP
    center.copy(focus)
      .addScaledVector(lightRight, snapOffset(focus.dot(lightRight), texel))
      .addScaledVector(lightUp, snapOffset(focus.dot(lightUp), texel))
    s.target.position.copy(center)
    s.position.copy(center).addScaledVector(SUN_DIR, SUN_DISTANCE)
    gl.shadowMap.needsUpdate = true
  })

  return (
    <>
      <hemisphereLight args={['#c4d8ff', '#9a7a5a', 1.05]} />
      <ambientLight intensity={0.15} />
      <directionalLight
        ref={sun}
        color={SUN_COLOR}
        intensity={3.2}
        castShadow
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-camera-near={10}
        shadow-camera-far={4000}
        shadow-bias={-0.0006}
        shadow-normalBias={0.6}
      />
    </>
  )
}
