import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { game, RING_RADIUS, saveBest } from './game.js'

const tmp = new THREE.Vector3()
const fwd = new THREE.Vector3()
const upv = new THREE.Vector3()
const m4 = new THREE.Matrix4()
const arrowGeo = new THREE.ConeGeometry(0.7, 2.6, 4).rotateX(Math.PI / 2)

export default function Rings() {
  const group = useRef()
  const arrow = useRef()
  const course = game.course

  // orient each ring to face the path from the previous to the next ring
  const orients = useMemo(
    () =>
      course.map((r, i) => {
        const prev = i === 0 ? new THREE.Vector3(-1500, 70, 650) : course[i - 1].pos
        const next = i === course.length - 1 ? r.pos.clone().add(r.pos.clone().sub(prev)) : course[i + 1].pos
        const dir = next.clone().sub(prev).normalize()
        const q = new THREE.Quaternion().setFromRotationMatrix(m4.lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0)))
        return q
      }),
    [course]
  )

  const mats = useMemo(
    () =>
      course.map(
        () => new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffcc33', emissiveIntensity: 2, toneMapped: false, flatShading: true })
      ),
    [course]
  )

  useFrame(({ clock }, dt) => {
    const g = game
    const tour = g.mode === 'tour' && g.phase !== 'title'
    group.current.visible = tour
    arrow.current.visible = tour && g.phase === 'flying' && g.ringIndex < course.length
    if (!tour) return
    const t = clock.elapsedTime

    course.forEach((r, i) => {
      const mesh = group.current.children[i]
      mesh.visible = i >= g.ringIndex
      const mat = mats[i]
      if (i === g.ringIndex) {
        const pulse = 1 + Math.sin(t * 5) * 0.06
        mesh.scale.setScalar(pulse)
        mat.color.set('#fff27a')
        mat.emissive.set(i === course.length - 1 ? '#4dff88' : '#ffd23a')
        mat.emissiveIntensity = 3.2
        mat.opacity = 1
      } else {
        mesh.scale.setScalar(0.9)
        mat.color.set('#ffffff')
        mat.emissive.set('#ff9a3a')
        mat.emissiveIntensity = 0.6
      }
    })

    if (g.phase !== 'flying' || g.ringIndex >= course.length) return
    const target = course[g.ringIndex].pos
    if (g.pos.distanceTo(target) < RING_RADIUS * 1.15) {
      g.checkpoint = g.ringIndex
      g.ringIndex++
      g.ringFlash = 1
      g.boost = Math.min(1, g.boost + 0.2)
      if (g.ringIndex >= course.length) {
        g.phase = 'finished'
        g.lastTime = g.time
        if (g.best === null || g.time < g.best) {
          g.newBest = true
          saveBest(g.time)
        }
        g.events.push('finish')
      } else {
        g.events.push('ring')
        g.message = course[g.ringIndex].name
        g.messageT = 2
      }
    }

    // guide arrow floating ahead of the plane, pointing to the next ring
    if (g.ringIndex < course.length) {
      fwd.set(0, 0, -1).applyQuaternion(g.quat)
      upv.set(0, 1, 0).applyQuaternion(g.quat)
      arrow.current.position.copy(g.pos).addScaledVector(fwd, 12).addScaledVector(upv, 4.5)
      tmp.copy(course[g.ringIndex].pos)
      arrow.current.lookAt(tmp)
    }
  })

  return (
    <>
      <group ref={group}>
        {course.map((r, i) => (
          <mesh key={i} position={r.pos} quaternion={orients[i]} material={mats[i]}>
            <torusGeometry args={[RING_RADIUS, 1.3, 6, 24]} />
          </mesh>
        ))}
      </group>
      <mesh ref={arrow} geometry={arrowGeo}>
        <meshBasicMaterial color="#ffe066" toneMapped={false} />
      </mesh>
    </>
  )
}
