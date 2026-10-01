import { useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette, ToneMapping, SMAA } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import Terrain from './world/Terrain.jsx'
import Water from './world/Water.jsx'
import Sky from './world/Sky.jsx'
import City from './world/City.jsx'
import Plane from './Plane.jsx'
import Rings from './Rings.jsx'
import Lights from './Lights.jsx'
import HUD from './ui/HUD.jsx'
import { updateAudio } from './audio.js'

function AudioTick() {
  useFrame(() => updateAudio())
  return null
}

function MobileCamera() {
  const { camera, size } = useThree()
  useEffect(() => {
    const touch = window.matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0
    // Crop a little of the peripheral view on wide phone screens.
    camera.zoom = touch && size.width > size.height ? 1.08 : 1
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  return null
}

export default function App() {
  useEffect(() => {
    let frame
    const refreshViewport = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const viewport = document.querySelector('meta[name="viewport"]')
        // Reassert cover after rotation/tab restoration so iOS browsers
        // that observe viewport mutations refresh their native safe-area layout.
        if (viewport) viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
      })
    }
    const visible = () => { if (!document.hidden) refreshViewport() }
    const landscape = window.matchMedia('(orientation: landscape)')
    refreshViewport()
    landscape.addEventListener('change', refreshViewport)
    window.addEventListener('pageshow', refreshViewport)
    document.addEventListener('visibilitychange', visible)
    return () => {
      cancelAnimationFrame(frame)
      landscape.removeEventListener('change', refreshViewport)
      window.removeEventListener('pageshow', refreshViewport)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])

  return (
    <>
      <Canvas
        className="game-canvas"
        style={{ position: 'fixed', inset: 0 }}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={[1, 1.75]}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 60, near: 0.5, far: 12000, position: [0, 400, 1500] }}
      >
        <MobileCamera />
        <Sky />
        <Lights />
        <Terrain />
        <Water />
        <City />
        <Rings />
        <Plane />
        <AudioTick />
        <EffectComposer multisampling={0} disableNormalPass>
          <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
          <Vignette offset={0.25} darkness={0.55} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <SMAA />
        </EffectComposer>
      </Canvas>
      <HUD />
    </>
  )
}
