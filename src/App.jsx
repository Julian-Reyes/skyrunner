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
import { QUALITY_LEVELS, AUTO_START, AUTO_FALLBACK, loadQuality, saveQuality } from './quality.js'

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

// Applies the parts of a quality level that R3F doesn't handle by itself, and
// reports when the machine can't hold ~50 fps (used by the Auto setting).
function QualitySync({ composer, shadowType, onDecline }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  // The post-processing buffers only follow canvas size, not pixel ratio.
  useEffect(() => { composer.current?.setSize() }, [composer, dpr])
  // The shadow filter is compiled into every lit material's shader.
  useEffect(() => {
    gl.shadowMap.type = shadowType
    gl.shadowMap.needsUpdate = true
    scene.traverse((o) => {
      if (!o.material) return
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true
    })
  }, [gl, scene, shadowType])
  return <PerformanceMonitor bounds={() => [50, Infinity]} onDecline={onDecline} />
}

export default function App() {
  const composer = useRef()
  // `quality` is the player's choice; `level` is what is actually running
  // (they differ only on Auto, which starts at medium and can fall back to low).
  const [quality, setQuality] = useState(loadQuality)
  const [autoLevel, setAutoLevel] = useState(AUTO_START)
  const level = quality === 'auto' ? autoLevel : quality
  const q = QUALITY_LEVELS[level]
  const dpr = Math.min(window.devicePixelRatio || 1, q.maxDpr)
  const chooseQuality = (choice) => {
    saveQuality(choice)
    setQuality(choice)
    setAutoLevel(AUTO_START) // re-measure when switching back to Auto
  }

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
        shadows={{ type: q.shadowType }}
        dpr={dpr}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 60, near: 0.5, far: 12000, position: [0, 400, 1500] }}
      >
        <MobileCamera />
        <QualitySync composer={composer} shadowType={q.shadowType} onDecline={() => setAutoLevel(AUTO_FALLBACK)} />
        <Sky />
        <Lights shadowMapSize={q.shadowMap} />
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
          <SMAA preset={q.smaa} />
        </EffectComposer>
      </Canvas>
      <HUD quality={quality} level={level} onQuality={chooseQuality} />
    </>
  )
}
