// Procedural, stylized height field of Rio de Janeiro's South Zone.
// Axes: +x = east, -z = north (inland / mountains), +z = south (Atlantic).
// 1 unit ≈ 1 metre (horizontal distances compressed ~2x vs. reality).
import { createNoise2D } from 'simplex-noise'

export const MAP_SIZE = 7000
export const HALF = MAP_SIZE / 2

export function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const n2 = createNoise2D(mulberry32(1337))
export const fbm = (x, z, oct = 4) => {
  let a = 1, f = 1, s = 0, t = 0
  for (let i = 0; i < oct; i++) {
    s += a * n2(x * f, z * f)
    t += a
    a *= 0.5
    f *= 2.03
  }
  return s / t
}

const bump = (u) => (Math.abs(u) < 1 ? 0.5 * (1 + Math.cos(Math.PI * u)) : 0)
export const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Shoreline: z of the waterline for a given x
export function coastZ(x) {
  let z = 0
  z -= 90 * bump((x + 950) / 850) // Ipanema–Leblon arc
  z -= 260 * bump((x - 650) / 820) // Copacabana bay
  z += 150 * Math.exp(-(((x + 120) / 90) ** 2)) // Arpoador point
  z += 60 * sstep(-1700, -1850, x) // Vidigal cliffs
  z -= 190 * bump((x + 2750) / 480) // São Conrado beach
  z -= (x - 1450) * 1.4 * sstep(1400, 1600, x) // Guanabara Bay entrance to the east
  return z
}

// Lagoa Rodrigo de Freitas (ellipse metric, <1 inside)
export const lagoaE = (x, z) => ((x + 450) / 430) ** 2 + ((z + 780) / 300) ** 2

function peak(x, z, cx, cz, h, r, p = 2, sx = 1, sz = 1) {
  const dx = (x - cx) / sx, dz = (z - cz) / sz
  const d = Math.sqrt(dx * dx + dz * dz) / r
  return h * Math.exp(-Math.pow(d, p))
}

function sugarloaf(x, z) {
  // bullet-shaped granite dome with near-vertical flanks
  const dx = (x - 2060) / 1.25, dz = (z + 70) / 0.85
  const d = Math.sqrt(dx * dx + dz * dz) / 150
  if (d >= 1) return 0
  return 395 * Math.pow(1 - d * d, 0.42)
}

function tijucaRidge(x, z) {
  const cz = -1750 + 180 * Math.sin(x / 650)
  const w = 380
  const along = sstep(-3300, -2500, x) * (1 - sstep(900, 1500, x))
  return (430 + 170 * fbm(x * 0.0008, 3.1)) * Math.exp(-(((z - cz) / w) ** 2)) * along
}

function mountains(x, z) {
  let m = 0
  m = Math.max(m, sugarloaf(x, z))
  m = Math.max(m, peak(x, z, 1780, -150, 220, 170, 2.2)) // Morro da Urca
  m = Math.max(m, peak(x, z, 1620, -240, 14, 260, 2)) // Urca neck
  m = Math.max(m, peak(x, z, 1440, -170, 190, 190, 2)) // Leme / Babilônia
  m = Math.max(m, peak(x, z, -150, -390, 160, 250, 2)) // Cantagalo / Pavão
  m = Math.max(m, peak(x, z, -120, 55, 38, 70, 2)) // Pedra do Arpoador
  m = Math.max(m, peak(x, z, 340, -1480, 710, 330, 1.35)) // Corcovado (needle)
  m = Math.max(m, peak(x, z, 250, -1080, 150, 330, 2)) // Santa Marta slopes
  m = Math.max(m, tijucaRidge(x, z))
  // Dois Irmãos (two brothers) + base
  m = Math.max(m, peak(x, z, -1890, -170, 530, 150, 2.1))
  m = Math.max(m, peak(x, z, -1690, -230, 440, 125, 2.1))
  m = Math.max(m, peak(x, z, -1820, -330, 270, 330, 2))
  // Rocinha hillside
  m = Math.max(m, peak(x, z, -2330, -700, 380, 430, 2))
  // Pedra da Gávea – flat-topped monolith
  m = Math.max(m, Math.min(840, 1.25 * peak(x, z, -2950, -760, 840, 360, 3)))
  // Ilhas Cagarras
  m = Math.max(m, peak(x, z, -900, 1300, 75, 95, 2.5))
  m = Math.max(m, peak(x, z, -700, 1420, 42, 60, 2.5))
  m = Math.max(m, peak(x, z, -1080, 1400, 30, 50, 2.5))
  if (m > 1) {
    m += fbm(x * 0.004, z * 0.004) * m * 0.1 + fbm(x * 0.02, z * 0.02) * Math.min(m, 60) * 0.15
  }
  return m
}

export function heightAt(x, z) {
  const d = coastZ(x) - z // >0 inland
  let base
  if (d < 0) base = Math.max(-45, -1.2 + d * 0.07)
  else {
    base = Math.min(2.6, -1.2 + d * 0.06)
    base += sstep(250, 1600, d) * 30 * (0.6 + 0.4 * fbm(x * 0.001, z * 0.001))
    base += fbm(x * 0.01, z * 0.01, 2) * 0.6 * sstep(80, 200, d)
  }
  const e = lagoaE(x, z)
  let lagoaMask = 1
  if (e < 1.4) {
    const k = 1 - sstep(0.8, 1.15, e)
    base = base * (1 - k) + -6 * k
    lagoaMask = sstep(0.95, 1.4, e)
  }
  // offset so gaussian tails fall below sea level and never flatten the ocean
  const m = mountains(x, z) * lagoaMask - 3
  return Math.max(base, m)
}

export function slopeAt(x, z) {
  const e = 4
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e)
  const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e)
  return Math.sqrt(gx * gx + gz * gz)
}

// Hillside communities. hMin/hMax: elevation band houses cling to.
export const FAVELAS = [
  { name: 'Vidigal', x: -1960, z: 10, r: 260, hMin: 6, hMax: 210, count: 1100 },
  { name: 'Rocinha', x: -2260, z: -560, r: 400, hMin: 25, hMax: 330, count: 2200 },
  { name: 'Cantagalo', x: -150, z: -380, r: 260, hMin: 12, hMax: 150, count: 800 },
  { name: 'Babilônia', x: 1420, z: -190, r: 220, hMin: 12, hMax: 160, count: 550 },
  { name: 'Santa Marta', x: 230, z: -1060, r: 200, hMin: 15, hMax: 150, count: 450 },
]

export function favelaAt(x, z, pad = 0) {
  for (const f of FAVELAS) {
    const d = Math.hypot(x - f.x, z - f.z)
    if (d < f.r + pad) return f
  }
  return null
}

// City blocks grid (shared with collision)
export const CITY = { cell: 38, x0: -1750, x1: 1500, z0: -1350, z1: 60 }
export const cityCols = Math.ceil((CITY.x1 - CITY.x0) / CITY.cell)
export const cityRows = Math.ceil((CITY.z1 - CITY.z0) / CITY.cell)
export const cityTop = new Float32Array(cityCols * cityRows) // building roof heights (0 = none)
export const cityFoot = new Float32Array(cityCols * cityRows)

export function buildingTopAt(x, z) {
  const c = Math.floor((x - CITY.x0) / CITY.cell)
  const r = Math.floor((z - CITY.z0) / CITY.cell)
  if (c < 0 || r < 0 || c >= cityCols || r >= cityRows) return 0
  const i = r * cityCols + c
  if (!cityTop[i]) return 0
  const cx = CITY.x0 + (c + 0.5) * CITY.cell
  const cz = CITY.z0 + (r + 0.5) * CITY.cell
  const half = cityFoot[i] / 2
  if (Math.abs(x - cx) > half || Math.abs(z - cz) > half) return 0
  return cityTop[i]
}

export const groundAt = (x, z) => Math.max(heightAt(x, z), buildingTopAt(x, z), 0)

export const LANDMARKS = [
  { name: 'Pão de Açúcar', x: 2060, z: -70, r: 330 },
  { name: 'Morro da Urca', x: 1780, z: -150, r: 200 },
  { name: 'Babilônia · Leme', x: 1420, z: -190, r: 200 },
  { name: 'Copacabana', x: 650, z: -150, r: 700 },
  { name: 'Pedra do Arpoador', x: -120, z: 60, r: 170 },
  { name: 'Cantagalo · Pavão-Pavãozinho', x: -150, z: -380, r: 240 },
  { name: 'Ipanema', x: -500, z: -60, r: 450 },
  { name: 'Leblon', x: -1300, z: -60, r: 330 },
  { name: 'Lagoa Rodrigo de Freitas', x: -450, z: -780, r: 450 },
  { name: 'Morro Dois Irmãos', x: -1800, z: -230, r: 230 },
  { name: 'Vidigal', x: -1960, z: 10, r: 230 },
  { name: 'Rocinha', x: -2260, z: -560, r: 380 },
  { name: 'Pedra da Gávea', x: -2950, z: -760, r: 450 },
  { name: 'São Conrado', x: -2750, z: -80, r: 400 },
  { name: 'Corcovado', x: 340, z: -1480, r: 380 },
  { name: 'Santa Marta', x: 230, z: -1060, r: 180 },
  { name: 'Floresta da Tijuca', x: -1000, z: -1750, r: 900 },
  { name: 'Ilhas Cagarras', x: -880, z: 1360, r: 350 },
  { name: 'Oceano Atlântico', x: 0, z: 1600, r: 1600 },
]

export function landmarkAt(x, z) {
  let best = null, bd = Infinity
  for (const l of LANDMARKS) {
    const d = Math.hypot(x - l.x, z - l.z)
    if (d < l.r && d / l.r < bd) {
      bd = d / l.r
      best = l
    }
  }
  return best ? best.name : ''
}
