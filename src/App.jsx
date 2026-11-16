import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
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

// Resolution is the biggest GPU cost: every pixel goes through lighting, soft
// shadows, bloom and SMAA. Start at up to 1.25x and step down (never back up, so
// it can't oscillate) whenever the machine can't hold ~50 fps.
const MAX_DPR = 1.25
const MIN_DPR = 1

function AdaptiveResolution({ composer, onDecline }) {
  const dpr = useThree((s) => s.viewport.dpr)
  // The post-processing buffers only follow canvas size, not pixel ratio.
  useEffect(() => { composer.current?.setSize() }, [composer, dpr])
  return <PerformanceMonitor bounds={() => [50, Infinity]} onDecline={onDecline} />
}

export default function App() {
  const composer = useRef()
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, MAX_DPR))
  const lowerDpr = () => setDpr((d) => Math.max(MIN_DPR, d - 0.25))

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
        dpr={dpr}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 60, near: 0.5, far: 12000, position: [0, 400, 1500] }}
      >
        <MobileCamera />
        <AdaptiveResolution composer={composer} onDecline={lowerDpr} />
        <Sky />
        <Lights />
        <Terrain />
        <Water />
        <City />
        <Rings />
        <Plane />
        <AudioTick />
        <EffectComposer ref={composer} multisampling={0} disableNormalPass>
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
