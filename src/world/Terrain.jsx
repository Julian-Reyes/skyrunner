import { useMemo } from 'react'
import * as THREE from 'three'
import { heightAt, coastZ, favelaAt, lagoaE, fbm, MAP_SIZE } from './terrain.js'

const SEG = 420

const C = (hex) => new THREE.Color(hex)
const SAND = C('#ecd6a2'), WET = C('#b9a47a'), SEABED = C('#6f7f6a')
const CITY = C('#9a9387'), DIRT = C('#9b5f3c')
const ROCK = C('#6f675f'), GRANITE = C('#a09486')
const FOREST1 = C('#2f5d2a'), FOREST2 = C('#4f7f36'), FOREST3 = C('#244a24')

export default function Terrain() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, SEG, SEG)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const col = new THREE.Color()
    const tmp = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      const y = heightAt(x, z)
      pos.setY(i, y)
    }
    // slope from grid neighbours
    const W = SEG + 1
    const cell = MAP_SIZE / SEG
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i)
      const r = Math.floor(i / W), c = i % W
      const yl = pos.getY(r * W + Math.max(0, c - 1)), yr = pos.getY(r * W + Math.min(W - 1, c + 1))
      const yu = pos.getY(Math.max(0, r - 1) * W + c), yd = pos.getY(Math.min(W - 1, r + 1) * W + c)
      const slope = Math.hypot(yr - yl, yd - yu) / (2 * cell)
      const d = coastZ(x) - z
      const n = fbm(x * 0.01, z * 0.01, 2)

      if (y < -1) {
        col.copy(WET).lerp(SEABED, Math.min(1, -y / 20))
      } else if (d < 75 && y < 5 && lagoaE(x, z) > 1.1) {
        col.copy(SAND).lerp(WET, y < 0 ? 0.6 : 0)
      } else if (slope > 1.2) {
        col.copy(GRANITE).lerp(ROCK, 0.5 + 0.5 * n)
      } else if (slope > 0.75) {
        col.copy(ROCK).lerp(FOREST3, 0.35 + 0.3 * n)
      } else if (favelaAt(x, z) && y > 5) {
        col.copy(DIRT).lerp(FOREST2, 0.25 + 0.25 * n)
      } else if (y < 22 && d > 60) {
        col.copy(CITY).offsetHSL(0, 0, n * 0.04)
      } else {
        col.copy(FOREST1).lerp(FOREST2, 0.5 + 0.5 * n)
        tmp.copy(FOREST3)
        col.lerp(tmp, Math.min(0.6, y / 900))
      }
      colors[i * 3] = col.r
      colors[i * 3 + 1] = col.g
      colors[i * 3 + 2] = col.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.95} metalness={0} />
    </mesh>
  )
}
