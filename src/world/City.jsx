import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  heightAt, coastZ, favelaAt, lagoaE, slopeAt, mulberry32, FAVELAS,
  CITY, cityCols, cityRows, cityTop, cityFoot,
} from './terrain.js'

const rand = mulberry32(42)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const dummy = new THREE.Object3D()
const col = new THREE.Color()

function makeInstanced(geometry, material, items, { cast = true, receive = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length)
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z)
    dummy.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0)
    dummy.scale.set(it.sx, it.sy, it.sz)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    mesh.setColorAt(i, col.set(it.c))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.castShadow = cast
  mesh.receiveShadow = receive
  mesh.computeBoundingSphere()
  return mesh
}

// unit box with its base at y=0
const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const flatMat = () => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 })

const FAVELA_COLORS = ['#b5532d', '#c9713f', '#d9894f', '#a8462a', '#e3a0a4', '#e8c547', '#3fa7a0', '#4a78c2', '#ece3d3', '#7fb069', '#d65f5f', '#c2b280']
const TOWER_COLORS = ['#efe9dc', '#e6dccb', '#f4efe6', '#d8d2c6', '#ecdcc0', '#c9d3d6', '#f0e4d0']

function buildCity() {
  const items = []
  for (let r = 0; r < cityRows; r++) {
    for (let c = 0; c < cityCols; c++) {
      const x = CITY.x0 + (c + 0.5) * CITY.cell
      const z = CITY.z0 + (r + 0.5) * CITY.cell
      const d = coastZ(x) - z
      if (d < 88) continue
      if (lagoaE(x, z) < 1.45) continue
      if (favelaAt(x, z, 40)) continue
      const h = heightAt(x, z)
      if (h < 0.5 || h > 16) continue
      if (slopeAt(x, z) > 0.12) continue
      if (rand() < 0.12) continue // plazas / parks
      const beachfront = d < 175
      const height = beachfront ? 32 + rand() * 42 : rand() < 0.1 ? 40 + rand() * 30 : 9 + rand() * 26
      const foot = 22 + rand() * 9
      const i = r * cityCols + c
      cityTop[i] = h + height
      cityFoot[i] = foot
      items.push({ x, y: h - 1, z, sx: foot, sy: height + 1, sz: foot * (0.8 + rand() * 0.2), c: pick(TOWER_COLORS) })
    }
  }
  return makeInstanced(boxGeo, flatMat(), items)
}

function buildFavelas() {
  const houses = []
  const tanks = []
  for (const f of FAVELAS) {
    let placed = 0, tries = 0
    while (placed < f.count && tries < f.count * 12) {
      tries++
      const a = rand() * Math.PI * 2
      const rr = Math.sqrt(rand()) * f.r
      const x = f.x + Math.cos(a) * rr
      const z = f.z + Math.sin(a) * rr
      const h = heightAt(x, z)
      if (h < f.hMin || h > f.hMax) continue
      if (slopeAt(x, z) > 1.6) continue
      const w = 5 + rand() * 4
      const floors = 1 + Math.floor(rand() * rand() * 4)
      const height = floors * 3 + 0.6
      const ry = Math.round(rand() * 4) * (Math.PI / 2) + (rand() - 0.5) * 0.3
      houses.push({ x, y: h - 2.5, z, ry, sx: w, sy: height + 2.5, sz: w * (0.7 + rand() * 0.5), c: pick(FAVELA_COLORS) })
      if (rand() < 0.35) tanks.push({ x: x + (rand() - 0.5) * 2, y: h + height, z: z + (rand() - 0.5) * 2, sx: 1.1, sy: 1.3, sz: 1.1, c: '#2f6fd0' })
      placed++
    }
  }
  const tankGeo = new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0)
  return [makeInstanced(boxGeo, flatMat(), houses), makeInstanced(tankGeo, flatMat(), tanks, { cast: false })]
}

function buildBeach() {
  const trunks = [], crowns = [], poles = [], umbrellas = []
  // palms on the promenade from Leblon to Leme
  for (let x = -1700; x < 1450; x += 26) {
    if (Math.abs(x + 120) < 110) continue // Arpoador rock
    const z = coastZ(x) - 68 + (rand() - 0.5) * 4
    const h = Math.max(heightAt(x, z), 1.5)
    const th = 9 + rand() * 5
    const lean = (rand() - 0.5) * 0.25
    trunks.push({ x, y: h, z, rz: lean, sx: 0.35, sy: th, sz: 0.35, c: '#7a5a3a' })
    crowns.push({ x: x - Math.sin(lean) * th, y: h + th, z, ry: rand() * 6, sx: 3.8, sy: 1.6, sz: 3.8, c: pick(['#3f8a3a', '#4f9a3e', '#2f7a36']) })
  }
  // beach umbrellas (barracas)
  const UMB = ['#e84a4a', '#f2c230', '#2f9de0', '#f28c28', '#1f9d55', '#ffffff', '#e05aa0']
  for (let i = 0; i < 900; i++) {
    const x = -1680 + rand() * 3100
    if (Math.abs(x + 120) < 130) continue
    const z = coastZ(x) - (14 + rand() * 42)
    const h = heightAt(x, z)
    if (h < 0.3 || h > 4) continue
    poles.push({ x, y: h, z, sx: 0.08, sy: 2.4, sz: 0.08, c: '#dddddd' })
    umbrellas.push({ x, y: h + 2.2, z, ry: rand() * 6, sx: 1.6, sy: 0.7, sz: 1.6, c: pick(UMB) })
  }
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 5).translate(0, 0.5, 0)
  const crownGeo = new THREE.ConeGeometry(1, 1, 7).rotateX(Math.PI)
  const coneGeo = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0)
  return [
    makeInstanced(trunkGeo, flatMat(), trunks),
    makeInstanced(crownGeo, flatMat(), crowns),
    makeInstanced(boxGeo, flatMat(), poles, { cast: false }),
    makeInstanced(coneGeo, flatMat(), umbrellas),
  ]
}

function buildClouds() {
  const puffs = []
  for (let i = 0; i < 38; i++) {
    const cx = -3300 + rand() * 6600
    const cz = -3300 + rand() * 5200
    const cy = 780 + rand() * 520
    const n = 4 + Math.floor(rand() * 5)
    for (let k = 0; k < n; k++) {
      const s = 45 + rand() * 70
      puffs.push({ x: cx + (rand() - 0.5) * 240, y: cy + rand() * 40, z: cz + (rand() - 0.5) * 120, ry: rand() * 6, sx: s * 1.4, sy: s * 0.7, sz: s, c: '#ffffff' })
    }
  }
  // a wisp wrapped around Corcovado
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 1.4
    puffs.push({ x: 340 + Math.cos(a) * 170, y: 560 + rand() * 30, z: -1480 + Math.sin(a) * 170, sx: 70, sy: 30, sz: 55, c: '#ffffff' })
  }
  const geo = new THREE.IcosahedronGeometry(1, 0)
  const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1, emissive: new THREE.Color('#ffb98a'), emissiveIntensity: 0.25, transparent: true, opacity: 0.93 })
  return makeInstanced(geo, mat, puffs, { cast: false, receive: false })
}

function buildBoats() {
  const hulls = [], sails = []
  for (let i = 0; i < 26; i++) {
    const x = -2600 + rand() * 5000
    const z = 250 + rand() * 1600
    if (heightAt(x, z) > -3) continue
    const ry = rand() * 6
    hulls.push({ x, y: 0.2, z, ry, sx: 3, sy: 1.4, sz: 9, c: '#f4f1ea' })
    if (rand() < 0.6) sails.push({ x, y: 1.4, z, ry, sx: 0.2, sy: 11, sz: 4.5, c: '#fffaf0' })
  }
  const sailGeo = new THREE.ConeGeometry(1, 1, 3).translate(0, 0.5, 0)
  return [makeInstanced(boxGeo, flatMat(), hulls), makeInstanced(sailGeo, flatMat(), sails)]
}

function CableCar() {
  const car1 = useRef(), car2 = useRef()
  const pts = useMemo(() => {
    const p = (x, z, o) => new THREE.Vector3(x, heightAt(x, z) + o, z)
    return [p(1600, -250, 12), p(1790, -150, 8), p(2050, -72, 10)]
  }, [])
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(pts)
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#222' }))
  }, [pts])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const k1 = 0.5 + 0.5 * Math.sin(t * 0.12)
    const k2 = 0.5 + 0.5 * Math.sin(t * 0.1 + 2)
    car1.current.position.lerpVectors(pts[0], pts[1], k1).y -= 3
    car2.current.position.lerpVectors(pts[1], pts[2], k2).y -= 3
  })
  return (
    <group>
      <primitive object={line} />
      {[car1, car2].map((r, i) => (
        <mesh key={i} ref={r} castShadow>
          <boxGeometry args={[5, 4, 7]} />
          <meshStandardMaterial color="#e84a2a" flatShading />
        </mesh>
      ))}
    </group>
  )
}

function HangGliders() {
  const ref = useRef()
  const gliders = useMemo(
    () => Array.from({ length: 6 }, (_, i) => ({ r: 120 + i * 45, h: 420 + i * 55, s: 0.12 + rand() * 0.1, p: rand() * 6, c: pick(['#f2c230', '#e84a4a', '#2f9de0', '#e05aa0', '#1f9d55', '#ffffff']) })),
    []
  )
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    ref.current.children.forEach((m, i) => {
      const g = gliders[i]
      const a = t * g.s + g.p
      m.position.set(-2620 + Math.cos(a) * g.r, g.h - (Math.sin(t * 0.05 + i) * 40), -520 + Math.sin(a) * g.r * 0.7)
      m.rotation.set(0, -a, 0.35)
    })
  })
  return (
    <group ref={ref}>
      {gliders.map((g, i) => (
        <mesh key={i} castShadow>
          <coneGeometry args={[5, 1.2, 3]} />
          <meshStandardMaterial color={g.c} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function SummitBeacon() {
  // Glowing marker on the Corcovado summit (lookout point)
  const y = heightAt(340, -1480)
  return (
    <group position={[340, y, -1480]}>
      <mesh position={[0, 6, 0]} castShadow>
        <cylinderGeometry args={[7, 9, 12, 8]} />
        <meshStandardMaterial color="#ddd6c8" flatShading />
      </mesh>
      <mesh position={[0, 18, 0]}>
        <octahedronGeometry args={[4, 0]} />
        <meshStandardMaterial color="#fff2c0" emissive="#ffd27a" emissiveIntensity={6} toneMapped={false} />
      </mesh>
    </group>
  )
}

export default function City() {
  const objects = useMemo(() => {
    const list = [buildCity(), ...buildFavelas(), ...buildBeach(), buildClouds(), ...buildBoats()]
    return list
  }, [])
  return (
    <group>
      {objects.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
      <CableCar />
      <HangGliders />
      <SummitBeacon />
    </group>
  )
}
