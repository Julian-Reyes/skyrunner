import { Canvas, useFrame } from '@react-three/fiber'
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

export default function App() {
  return (
    <>
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={[1, 1.75]}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 60, near: 0.5, far: 12000, position: [0, 400, 1500] }}
      >
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
