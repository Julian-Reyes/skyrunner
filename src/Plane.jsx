import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Trail } from '@react-three/drei'
import * as THREE from 'three'
import { game, keys, respawn } from './game.js'
import { groundAt, landmarkAt } from './world/terrain.js'

const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)
const UP = new THREE.Vector3(0, 1, 0)
const fwd = new THREE.Vector3()
const up = new THREE.Vector3()
const right = new THREE.Vector3()
const qa = new THREE.Quaternion()
const camTarget = new THREE.Vector3()
const lookTarget = new THREE.Vector3()
const camUp = new THREE.Vector3()

const input = { pitch: 0, roll: 0, yaw: 0 }
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt))

function PlaneModel({ propRef }) {
  // Low-poly bush plane in Brazil colours. Nose points to -Z.
  return (
    <group>
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[1.5, 1.5, 7]} />
        <meshStandardMaterial color="#f2c230" flatShading roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0, -4]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.35, 0.95, 1.2, 6]} />
        <meshStandardMaterial color="#1f9d55" flatShading />
      </mesh>
      <mesh position={[0, 0.9, -1.2]}>
        <boxGeometry args={[1.2, 0.6, 1.8]} />
        <meshStandardMaterial color="#1b2a3a" roughness={0.1} metalness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 0.2, -0.8]}>
        <boxGeometry args={[12, 0.22, 2.1]} />
        <meshStandardMaterial color="#1f9d55" flatShading />
      </mesh>
      <mesh position={[0, 0.33, -0.8]}>
        <boxGeometry args={[2.2, 0.05, 2.12]} />
        <meshStandardMaterial color="#2a4fb8" flatShading />
      </mesh>
      <mesh castShadow position={[0, 0.3, 3.4]}>
        <boxGeometry args={[4.2, 0.18, 1.1]} />
        <meshStandardMaterial color="#1f9d55" flatShading />
      </mesh>
      <mesh castShadow position={[0, 1.1, 3.4]}>
        <boxGeometry args={[0.18, 1.9, 1.3]} />
        <meshStandardMaterial color="#2a4fb8" flatShading />
      </mesh>
      <group ref={propRef} position={[0, 0, -4.65]}>
        <mesh>
          <boxGeometry args={[3.4, 0.28, 0.08]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      </group>
    </group>
  )
}

export default function Plane() {
  const group = useRef()
  const propRef = useRef()
  const boom = useRef()
  const { camera } = useThree()
  const tipL = useRef(), tipR = useRef()
  const boomMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, toneMapped: false }), [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const g = game
    const k = keys

    if (g.phase === 'title') {
      group.current.visible = false
      const t = state.clock.elapsedTime * 0.04
      camera.position.set(Math.cos(t) * 1700 - 300, 380 + Math.sin(t * 2) * 60, Math.sin(t) * 1100 + 500)
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 120, -500)
      camera.fov = 55
      camera.updateProjectionMatrix()
      return
    }
    group.current.visible = g.phase !== 'crashed'

    if (g.phase === 'crashed') {
      g.crashT -= dt
      const s = 1 + (1.6 - g.crashT) * 30
      boom.current.scale.setScalar(s)
      boomMat.opacity = Math.max(0, g.crashT / 1.6)
      camera.lookAt(g.pos)
      if (g.crashT <= 0) {
        boom.current.visible = false
        respawn()
      }
      return
    }

    // ---- input -----------------------------------------------------------
    let pitchIn = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0)
    if (g.invert) pitchIn = -pitchIn
    const rollIn = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0)
    const yawIn = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0)
    input.pitch = approach(input.pitch, pitchIn, 7, dt)
    input.roll = approach(input.roll, rollIn, 7, dt)
    input.yaw = approach(input.yaw, yawIn, 5, dt)
    g.boosting = (k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight')) && g.boost > 0.02
    g.braking = k.has('KeyC') || k.has('KeyX')

    // ---- flight model (arcade) --------------------------------------------
    const q = g.quat
    const control = THREE.MathUtils.clamp((g.speed - 18) / 40, 0.25, 1.15) // controls get mushy when slow
    q.multiply(qa.setFromAxisAngle(X, input.pitch * 1.25 * control * dt))
    q.multiply(qa.setFromAxisAngle(Z, input.roll * 2.5 * control * dt))
    q.multiply(qa.setFromAxisAngle(Y, input.yaw * 0.55 * dt))

    fwd.set(0, 0, -1).applyQuaternion(q)
    up.set(0, 1, 0).applyQuaternion(q)
    right.set(1, 0, 0).applyQuaternion(q)

    // bank-to-turn: lift vector tilted sideways swings the heading
    const bank = right.y
    q.premultiply(qa.setFromAxisAngle(UP, bank * 1.05 * dt * control))
    // gentle auto-level when the stick is centred
    if (Math.abs(rollIn) < 0.01) q.multiply(qa.setFromAxisAngle(Z, -bank * 0.9 * dt))
    // stall: nose drops toward the ground
    if (g.speed < 30) {
      const s = (30 - g.speed) / 30
      q.multiply(qa.setFromAxisAngle(X, -s * 0.9 * dt * Math.max(0, up.y)))
    }
    q.normalize()
    fwd.set(0, 0, -1).applyQuaternion(q)
    up.set(0, 1, 0).applyQuaternion(q)

    // energy: gravity along the flight path, thrust/drag toward a target speed
    const target = g.boosting ? 118 : g.braking ? 32 : 64
    g.speed = approach(g.speed, target, g.boosting ? 1.1 : 0.55, dt)
    g.speed += -fwd.y * 16 * dt
    g.speed = THREE.MathUtils.clamp(g.speed, 18, 170)
    if (g.boosting) g.boost = Math.max(0, g.boost - 0.28 * dt)
    else g.boost = Math.min(1, g.boost + 0.1 * dt)

    g.pos.addScaledVector(fwd, g.speed * dt)
    if (g.speed < 30) g.pos.y -= (30 - g.speed) * 0.6 * dt
    if (g.pos.y > 1800) g.pos.y = approach(g.pos.y, 1800, 2, dt)

    // ---- collision ---------------------------------------------------------
    const ground = groundAt(g.pos.x, g.pos.z)
    g.agl = g.pos.y - ground
    const dist = Math.hypot(g.pos.x, g.pos.z + 300)
    if (dist > 3200 && g.messageT <= 0) {
      g.message = 'Turn back toward Rio!'
      g.messageT = 1.5
    }
    if (g.agl < 1.2 || dist > 3600) {
      g.phase = 'crashed'
      g.crashT = 1.6
      g.flash = 1
      g.events.push('crash')
      g.message = dist > 3600 ? 'Out of airspace' : ground <= 0.01 ? 'Splash! Into the Atlantic' : 'Crashed!'
      g.messageT = 1.6
      boom.current.position.copy(g.pos)
      boom.current.visible = true
    }
    if (g.phase === 'flying' && g.mode === 'tour') g.time += dt

    g.landmark = landmarkAt(g.pos.x, g.pos.z)

    // ---- apply to scene ----------------------------------------------------
    group.current.position.copy(g.pos)
    group.current.quaternion.copy(q)
    propRef.current.rotation.z += dt * (30 + g.speed)

    // ---- chase camera ------------------------------------------------------
    const back = g.boosting ? 23 : 20
    camTarget.copy(g.pos).addScaledVector(fwd, -back).addScaledVector(UP, 5.5).addScaledVector(up, 1.2)
    const cg = groundAt(camTarget.x, camTarget.z) + 2
    if (camTarget.y < cg) camTarget.y = cg
    if (g.snapCam) {
      camera.position.copy(camTarget)
      camera.up.copy(UP)
      g.snapCam = false
    } else camera.position.lerp(camTarget, 1 - Math.exp(-7 * dt))
    camUp.copy(up).lerp(UP, 0.55).normalize()
    camera.up.lerp(camUp, 1 - Math.exp(-4 * dt))
    lookTarget.copy(g.pos).addScaledVector(fwd, 45).addScaledVector(UP, 2)
    camera.lookAt(lookTarget)
    const fov = 62 + (g.speed - 64) * 0.22
    camera.fov = approach(camera.fov, fov, 3, dt)
    camera.updateProjectionMatrix()
  })

  return (
    <>
      <group ref={group}>
        <PlaneModel propRef={propRef} />
        <Trail width={1.4} length={5} color="#ffffff" attenuation={(t) => t * t} decay={1}>
          <mesh ref={tipL} position={[-6, 0.2, -0.3]} visible={false}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
          </mesh>
        </Trail>
        <Trail width={1.4} length={5} color="#ffffff" attenuation={(t) => t * t} decay={1}>
          <mesh ref={tipR} position={[6, 0.2, -0.3]} visible={false}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
          </mesh>
        </Trail>
      </group>
      <mesh ref={boom} visible={false} material={boomMat}>
        <icosahedronGeometry args={[1, 1]} />
      </mesh>
    </>
  )
}
