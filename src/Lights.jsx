import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SUN_DIR, SUN_COLOR, FOG_COLOR, FOG_NEAR, FOG_FAR } from './world/env.js'
import { game } from './game.js'

const TITLE_FOCUS = new THREE.Vector3(0, 0, -300)

export default function Lights() {
  const sun = useRef()
  const { scene, gl } = useThree()
  const frame = useRef(0)
  useEffect(() => {
    scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR)
    scene.add(sun.current.target)
    // The shadow map is re-rendered on demand (see below) instead of every frame.
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => { gl.shadowMap.autoUpdate = true }
  }, [scene, gl])

  // shadow frustum follows the player (or the title camera's focus)
  useFrame(() => {
    const big = game.phase === 'title'
    const focus = big ? TITLE_FOCUS : game.pos
    const s = sun.current
    s.target.position.copy(focus)
    s.position.copy(focus).addScaledVector(SUN_DIR, 1500)
    // On the title screen the light and nearly all casters are static, so the
    // shadow map only needs an occasional refresh. In flight it follows the plane.
    let redraw = !big || frame.current++ % 10 === 0
    const cam = s.shadow.camera
    const size = big ? 2200 : 450
    if (cam.right !== size) {
      cam.left = -size
      cam.right = size
      cam.top = size
      cam.bottom = -size
      cam.updateProjectionMatrix()
      redraw = true
    }
    if (redraw) gl.shadowMap.needsUpdate = true
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
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={10}
        shadow-camera-far={4000}
        shadow-bias={-0.0006}
        shadow-normalBias={0.6}
      />
    </>
  )
}
