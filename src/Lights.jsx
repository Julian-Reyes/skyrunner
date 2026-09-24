import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SUN_DIR, SUN_COLOR, FOG_COLOR, FOG_NEAR, FOG_FAR } from './world/env.js'
import { game } from './game.js'

export default function Lights() {
  const sun = useRef()
  const { scene } = useThree()
  useEffect(() => {
    scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR)
    scene.add(sun.current.target)
  }, [scene])

  // shadow frustum follows the player (or the title camera's focus)
  useFrame(({ camera }) => {
    const focus = game.phase === 'title' ? new THREE.Vector3(0, 0, -300) : game.pos
    const s = sun.current
    s.target.position.copy(focus)
    s.position.copy(focus).addScaledVector(SUN_DIR, 1500)
    const big = game.phase === 'title'
    const cam = s.shadow.camera
    const size = big ? 2200 : 450
    if (cam.right !== size) {
      cam.left = -size
      cam.right = size
      cam.top = size
      cam.bottom = -size
      cam.updateProjectionMatrix()
    }
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
