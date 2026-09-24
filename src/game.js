import * as THREE from 'three'
import { heightAt } from './world/terrain.js'

// Ring course: a tour of the South Zone. off = metres above ground (or absolute y if abs).
const COURSE_DEF = [
  { name: 'Ipanema', x: -800, z: 10, off: 22 },
  { name: 'Pedra do Arpoador', x: -60, z: 190, off: 45 },
  { name: 'Copacabana', x: 450, z: -110, off: 28 },
  { name: 'Copacabana · Posto 2', x: 1100, z: -60, off: 30 },
  { name: 'Pão de Açúcar · mar', x: 2230, z: 150, abs: 120 },
  { name: 'Pão de Açúcar · topo', x: 2060, z: -70, off: 38 },
  { name: 'Botafogo', x: 1100, z: -800, abs: 300 },
  { name: 'Corcovado', x: 340, z: -1480, off: 55 },
  { name: 'Lagoa', x: -380, z: -800, abs: 30 },
  { name: 'Cantagalo', x: -160, z: -390, off: 40 },
  { name: 'Leblon', x: -1350, z: -90, off: 24 },
  { name: 'Entre os Dois Irmãos', x: -1790, z: -200, off: 40 },
  { name: 'Vidigal', x: -1990, z: 60, off: 40 },
  { name: 'Rocinha', x: -2250, z: -560, off: 45 },
  { name: 'Pedra da Gávea', x: -2950, z: -760, off: 50 },
  { name: 'São Conrado · chegada', x: -2700, z: -40, abs: 25 },
]

export const RING_RADIUS = 20

export function buildCourse() {
  return COURSE_DEF.map((r) => {
    const y = r.abs !== undefined ? Math.max(r.abs, heightAt(r.x, r.z) + 25) : heightAt(r.x, r.z) + r.off
    return { ...r, pos: new THREE.Vector3(r.x, y, r.z) }
  })
}

let best = null
try {
  const v = localStorage.getItem('ceu-do-rio-best')
  if (v) best = parseFloat(v)
} catch (e) {}

export const game = {
  phase: 'title', // title | flying | crashed | finished
  mode: 'tour', // tour | free
  course: buildCourse(),
  ringIndex: 0,
  time: 0,
  best,
  lastTime: null,
  newBest: false,
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  speed: 60,
  boost: 1,
  boosting: false,
  braking: false,
  agl: 0,
  landmark: '',
  crashT: 0,
  flash: 0,
  ringFlash: 0,
  message: '',
  messageT: 0,
  invert: false,
  muted: false,
  checkpoint: 0,
  snapCam: false,
  events: [], // one-shot sound events: 'ring' | 'crash' | 'finish'
}

export function saveBest(t) {
  game.best = t
  try {
    localStorage.setItem('ceu-do-rio-best', String(t))
  } catch (e) {}
}

const tmpM = new THREE.Matrix4()
export function placeAt(from, target) {
  game.pos.copy(from)
  tmpM.lookAt(from, target, new THREE.Vector3(0, 1, 0))
  game.quat.setFromRotationMatrix(tmpM)
}

export function startGame(mode) {
  game.mode = mode
  game.ringIndex = 0
  game.time = 0
  game.newBest = false
  game.speed = 62
  game.boost = 1
  game.checkpoint = -1
  const first = game.course[0].pos
  placeAt(new THREE.Vector3(-1500, 70, 650), first)
  game.phase = 'flying'
  game.snapCam = true
  game.message = mode === 'tour' ? 'Tour do Rio — fly through the rings' : 'Free flight — explore Rio'
  game.messageT = 3.5
}

export function respawn() {
  const c = game.course
  if (game.mode === 'tour' && game.checkpoint >= 0) {
    const from = c[game.checkpoint].pos.clone()
    const to = c[Math.min(game.ringIndex, c.length - 1)].pos
    from.y += 12
    placeAt(from, to)
  } else if (game.mode === 'tour') {
    placeAt(new THREE.Vector3(-1500, 70, 650), c[0].pos)
  } else {
    placeAt(new THREE.Vector3(game.pos.x * 0.6, 260, game.pos.z * 0.6 + 400), new THREE.Vector3(0, 200, -600))
  }
  game.speed = 62
  game.boost = Math.max(game.boost, 0.5)
  game.phase = 'flying'
  game.snapCam = true
}

export const keys = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    keys.add(e.code)
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  window.addEventListener('blur', () => keys.clear())
}

if (typeof window !== 'undefined') window.__game = game // handy for debugging in the console
