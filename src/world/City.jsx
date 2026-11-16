import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SUN_DIR, SUN_COLOR } from './env.js'
import {
  heightAt, coastZ, favelaAt, lagoaE, lagoaShoreDist, slopeAt, fbm, mulberry32, FAVELAS,
  CITY, cityCols, cityRows, cityTop, cityFoot, cityPlaza, JOCKEY, jockeyE, LAGOA,
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

const TOWER_FACADE = /* glsl */ `
        float winMask = 0.0;
        float winGlint = 0.0;
        if (abs(vBoxNormal.y) > 0.5) {
          // roof: gravel tone with a lighter parapet around the edge
          vec2 edge = 0.5 * vBoxSize.xz - abs(vBoxPos.xz);
          float parapet = 1.0 - smoothstep(0.9, 1.3, min(edge.x, edge.y));
          diffuseColor.rgb = mix(mix(diffuseColor.rgb, vec3(0.46, 0.45, 0.43), 0.55), diffuseColor.rgb, parapet);
        } else {
          bool xFace = abs(vBoxNormal.x) > 0.5;
          float along = xFace ? vBoxPos.z : vBoxPos.x;
          float wallW = xFace ? vBoxSize.z : vBoxSize.x;
          float h = vBoxPos.y - 1.0; // boxes start 1 m below ground
          float floorH = 3.1 + vSeed * 0.5;
          float bays = max(1.0, floor(wallW / (2.3 + fract(vSeed * 7.0) * 1.2)));
          float floors = floor((vBoxSize.y - 1.8) / floorH);
          vec2 cell = vec2((along / wallW + 0.5) * bays, h / floorH);
          vec2 id = floor(cell);
          vec2 f = cell - id;
          vec2 fw = fwidth(cell);
          float rows = step(1.0, id.y) * step(id.y, floors - 1.0);

          // some towers have ribbon windows instead of punched ones
          float mx = fract(vSeed * 13.0) > 0.72 ? -1.0 : 0.17;
          float wx = smoothstep(mx - fw.x, mx + fw.x, f.x) * (1.0 - smoothstep(1.0 - mx - fw.x, 1.0 - mx + fw.x, f.x));
          float wy = smoothstep(0.30 - fw.y, 0.30 + fw.y, f.y) * (1.0 - smoothstep(0.80 - fw.y, 0.80 + fw.y, f.y));
          float coverX = mx < 0.0 ? 1.0 : 0.66;
          float distFade = smoothstep(0.3, 0.8, max(fw.x, fw.y));
          winMask = rows * mix(wx * wy, coverX * 0.5, distFade);

          // glass: dark blue-grey, a little different in every window (blinds, curtains)
          float r = towerHash(id + vSeed * 91.0);
          vec3 glass = mix(vec3(0.07, 0.10, 0.15), vec3(0.20, 0.24, 0.30), mix(r, 0.5, distFade));

          // ground floor reads as shopfronts; walls darken toward the street
          float street = 1.0 - step(1.0, id.y);
          diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 14.0, h)) * mix(1.0, 0.82, street);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, winMask);

          // sunset caught in upper windows facing the sun
          float facing = smoothstep(0.15, 0.7, dot(vBoxNormal, uSunDir));
          float high = smoothstep(0.35, 0.95, h / vBoxSize.y);
          float chance = 0.16 * high;
          winGlint = winMask * facing * mix(step(1.0 - chance, towerHash(id.yx + vSeed * 37.0)), chance, distFade);
        }`

// How far favela houses are sunk into the hillside, so the downhill wall still
// reaches the ground on steep slopes, and the steepest slope they are built on.
const FAVELA_SINK = 4
const FAVELA_MAX_SLOPE = 1.05

// Favela houses: stacked storeys in paint, bare brick or render, slab edges,
// small windows with the odd light on, and concrete or corrugated roofs.
const FAVELA_FACADE = /* glsl */ `
        float winMask = 0.0;
        float winGlint = 0.0;
        float h = vBoxPos.y - ${FAVELA_SINK.toFixed(1)}; // houses are sunk into the slope
        float floorH = 3.0;
        if (abs(vBoxNormal.y) > 0.5) {
          // roof: mostly bare concrete slabs with a low wall-coloured rim,
          // the rest corrugated sheet in grey-blue or rust
          vec2 edge = 0.5 * vBoxSize.xz - abs(vBoxPos.xz);
          float rim = 1.0 - smoothstep(0.3, 0.45, min(edge.x, edge.y));
          float kind = fract(vSeed * 5.0);
          vec3 slab = vec3(0.60, 0.58, 0.55) * (0.88 + 0.24 * fract(vSeed * 17.0));
          float ridge = vBoxPos.x * 2.2;
          float ridges = mix(0.9 + 0.1 * step(0.5, fract(ridge)), 0.95, smoothstep(0.3, 0.8, fwidth(ridge)));
          vec3 sheet = mix(vec3(0.52, 0.56, 0.60), vec3(0.50, 0.33, 0.24), step(0.5, fract(vSeed * 29.0))) * ridges;
          diffuseColor.rgb = kind < 0.62 ? mix(slab, diffuseColor.rgb * 0.9, rim) : sheet;
        } else {
          bool xFace = abs(vBoxNormal.x) > 0.5;
          float along = xFace ? vBoxPos.z : vBoxPos.x;
          float wallW = xFace ? vBoxSize.z : vBoxSize.x;
          float storey = floor(max(h, 0.0) / floorH);
          float floors = floor((vBoxSize.y - ${FAVELA_SINK.toFixed(1)}) / floorH + 0.01);

          // every storey was built at a different time: upper ones are often
          // still bare brick or grey render instead of the ground floor's paint
          float fr = towerHash(vec2(storey, vSeed * 53.0));
          vec3 wall = diffuseColor.rgb;
          if (storey > 0.5) {
            vec3 brick = vec3(0.62, 0.34, 0.22) * (0.85 + 0.3 * fract(fr * 7.0));
            wall = fr < 0.4 ? brick : (fr < 0.55 ? vec3(0.60, 0.58, 0.54) : wall);
          }
          // concrete slab edge between storeys
          float fy = h / floorH;
          float fwy = fwidth(fy);
          float slabEdge = (1.0 - smoothstep(0.08, 0.08 + fwy, fy - storey)) * step(0.5, storey) * (1.0 - smoothstep(0.25, 0.6, fwy));
          wall = mix(wall, vec3(0.66, 0.64, 0.60), slabEdge * 0.8);
          // exposed foundation on the downhill side
          if (h < 0.0) wall = vec3(0.42, 0.36, 0.32);
          wall *= mix(0.72, 1.0, smoothstep(0.0, 3.0, h));

          // small windows, not in every bay
          float bays = max(1.0, floor(wallW / 2.6));
          vec2 cell = vec2((along / wallW + 0.5) * bays, fy);
          vec2 id = floor(cell);
          vec2 f = cell - id;
          vec2 fw = fwidth(cell);
          float has = step(towerHash(id + vSeed * 71.0 + (xFace ? 3.0 : 0.0)), 0.72) * step(0.0, h) * step(id.y, floors - 1.0);
          float wx = smoothstep(0.28 - fw.x, 0.28 + fw.x, f.x) * (1.0 - smoothstep(0.72 - fw.x, 0.72 + fw.x, f.x));
          float wy = smoothstep(0.38 - fw.y, 0.38 + fw.y, f.y) * (1.0 - smoothstep(0.78 - fw.y, 0.78 + fw.y, f.y));
          float distFade = smoothstep(0.3, 0.8, max(fw.x, fw.y));
          winMask = has * mix(wx * wy, 0.18, distFade);
          diffuseColor.rgb = mix(wall, vec3(0.07, 0.08, 0.11), winMask);

          // a few lights already on at dusk
          winGlint = winMask * mix(step(0.92, towerHash(id.yx + vSeed * 19.0)), 0.08, distFade) * 0.6;
        }
`

// Tower facades: windows, ground-floor band, base shading and roof tone are all
// drawn in the fragment shader from the wall position, so the towers stay plain
// instanced boxes. Windows fade to their average tone with distance (no moire),
// and some upper windows on sun-facing walls catch the sunset and bloom.
function towerMat() {
  return facadeMat('tower-facade', TOWER_FACADE)
}

// Shared plumbing for box facades drawn in the fragment shader. `facade` is
// GLSL that runs after the instance colour is read; it edits diffuseColor and
// sets winMask (glass, 0-1) and winGlint (glowing glass, 0-1). It can use
// vBoxPos (metres from the box's base centre), vBoxSize, vBoxNormal (object
// space) and vSeed (0-1, one value per building).
function facadeMat(key, facade) {
  const mat = flatMat()
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = { value: SUN_DIR }
    shader.uniforms.uSunColor = { value: SUN_COLOR }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
        varying vec3 vBoxPos;
        varying vec3 vBoxSize;
        varying vec3 vBoxNormal;
        varying float vSeed;`)
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        vBoxSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vBoxPos = position * vBoxSize;
        vBoxNormal = normal;
        vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec3 vBoxPos;
        varying vec3 vBoxSize;
        varying vec3 vBoxNormal;
        varying float vSeed;
        float towerHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + facade)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.5, winMask);`)
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance += uSunColor * winGlint * 1.8;`)
  }
  mat.customProgramCacheKey = () => key
  return mat
}

const FAVELA_COLORS = ['#b5532d', '#c9713f', '#d9894f', '#a8462a', '#e3a0a4', '#e8c547', '#3fa7a0', '#4a78c2', '#ece3d3', '#7fb069', '#d65f5f', '#c2b280']
const TOWER_COLORS = ['#efe9dc', '#e6dccb', '#f4efe6', '#d8d2c6', '#ecdcc0', '#c9d3d6', '#f0e4d0']

// The first tower layout drew this many numbers from the shared `rand` stream.
// Towers now use their own per-block stream (so editing the terrain can't
// reshuffle them); burning the old count keeps the scenery built later
// (umbrellas, palms, clouds, boats) exactly where it was.
const LEGACY_CITY_RAND_CALLS = 4465

function buildCity() {
  for (let i = 0; i < LEGACY_CITY_RAND_CALLS; i++) rand()
  const items = []
  for (let r = 0; r < cityRows; r++) {
    for (let c = 0; c < cityCols; c++) {
      const x = CITY.x0 + (c + 0.5) * CITY.cell
      const z = CITY.z0 + (r + 0.5) * CITY.cell
      const d = coastZ(x) - z
      if (d < 88) continue
      if (lagoaE(x, z) < 1.45) continue
      if (jockeyE(x, z) < 1.5) continue
      if (favelaAt(x, z, 40)) continue
      const h = heightAt(x, z)
      if (h < 0.5 || h > 16) continue
      if (slopeAt(x, z) > 0.12) continue
      const cr = mulberry32(r * 7919 + c * 104729 + 17) // one stream per block
      const i = r * cityCols + c
      if (cr() < 0.12) { // a leafy square instead of a tower
        cityPlaza[i] = 1
        continue
      }
      const beachfront = d < 175
      const height = beachfront ? 32 + cr() * 42 : cr() < 0.1 ? 40 + cr() * 30 : 9 + cr() * 26
      const foot = 22 + cr() * 9
      cityTop[i] = h + height
      cityFoot[i] = foot
      items.push({ x, y: h - 1, z, sx: foot, sy: height + 1, sz: foot * (0.8 + cr() * 0.2), c: TOWER_COLORS[Math.floor(cr() * TOWER_COLORS.length)] })
    }
  }
  return makeInstanced(boxGeo, towerMat(), items)
}

// Trees: a row or two around the lagoon's park, and a handful in each city square.
function buildTrees() {
  const tr = mulberry32(77)
  const trunks = [], crowns = []
  const GREENS = ['#2f6b2c', '#3d7d33', '#4c8a3a', '#2a5f2f']
  const add = (x, z) => {
    const h = heightAt(x, z)
    const th = 2.6 + tr() * 2.2
    const cr = 3 + tr() * 2
    trunks.push({ x, y: h - 0.3, z, sx: 0.32, sy: th + 0.8, sz: 0.32, c: '#5b4632' })
    crowns.push({ x, y: h + th + cr * 0.55, z, ry: tr() * 6, sx: cr, sy: cr * (0.75 + tr() * 0.3), sz: cr, c: GREENS[Math.floor(tr() * GREENS.length)] })
  }
  // lagoon: jittered grid over its bounding box, kept where it falls in the tree band
  const STEP = 10
  for (let z = LAGOA.z - LAGOA.b - 60; z < LAGOA.z + LAGOA.b + 60; z += STEP) {
    for (let x = LAGOA.x - LAGOA.a - 60; x < LAGOA.x + LAGOA.a + 60; x += STEP) {
      const px = x + (tr() - 0.5) * STEP, pz = z + (tr() - 0.5) * STEP
      const d = lagoaShoreDist(px, pz)
      if (d < 15 || d > 25 || tr() < 0.3 || heightAt(px, pz) > 4) continue
      add(px, pz)
    }
  }
  // city squares
  for (let i = 0; i < cityPlaza.length; i++) {
    if (!cityPlaza[i]) continue
    const cx = CITY.x0 + ((i % cityCols) + 0.5) * CITY.cell
    const cz = CITY.z0 + (Math.floor(i / cityCols) + 0.5) * CITY.cell
    const n = 5 + Math.floor(tr() * 4)
    for (let k = 0; k < n; k++) add(cx + (tr() - 0.5) * 22, cz + (tr() - 0.5) * 22)
  }
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 5).translate(0, 0.5, 0)
  return [makeInstanced(trunkGeo, flatMat(), trunks), makeInstanced(new THREE.IcosahedronGeometry(1, 0), flatMat(), crowns)]
}

// The scattered favela layout this replaced drew this many numbers from the
// shared `rand` stream. Burning the same amount keeps everything built after
// the favelas (umbrellas, palms, clouds, boats) exactly where it was.
const LEGACY_FAVELA_RAND_CALLS = 58764

function buildFavelas() {
  for (let i = 0; i < LEGACY_FAVELA_RAND_CALLS; i++) rand()
  const fr = mulberry32(101)
  const houses = []
  const tanks = []
  // Houses sit on a jittered grid a little tighter than a house is wide, so
  // they touch and overlap wall to wall, and each one is turned to face
  // downhill so rows follow the contours like terraces.
  const STEP = 6.6
  for (const f of FAVELAS) {
    for (let gz = -f.r; gz <= f.r; gz += STEP) {
      for (let gx = -f.r; gx <= f.r; gx += STEP) {
        const x = f.x + gx + (fr() - 0.5) * STEP * 0.5
        const z = f.z + gz + (fr() - 0.5) * STEP * 0.5
        // ragged outline instead of a clean circle, plus the odd gap for alleys
        const edge = Math.hypot(x - f.x, z - f.z) / f.r + fbm(x * 0.012, z * 0.012, 2) * 0.22
        if (edge > 0.93 || fr() < 0.06) continue
        const h = heightAt(x, z)
        if (h < f.hMin || h > f.hMax) continue
        const e = 4
        const sx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e)
        const sz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e)
        const slope = Math.hypot(sx, sz)
        if (slope > FAVELA_MAX_SLOPE) continue // bare rock stays bare
        const w = 5 + fr() * 3.5
        const d = w * (0.75 + fr() * 0.4)
        const floors = Math.min(4, 1 + Math.floor(fr() * fr() * 4.5))
        const height = floors * 3 + 0.6
        // local +z points downhill; on flat ground fall back to the street grid
        const ry = (slope > 0.06 ? Math.atan2(-sx, -sz) : Math.round(fr() * 4) * (Math.PI / 2)) + (fr() - 0.5) * 0.3
        const c = () => FAVELA_COLORS[Math.floor(fr() * FAVELA_COLORS.length)]
        houses.push({ x, y: h - FAVELA_SINK, z, ry, sx: w, sy: height + FAVELA_SINK, sz: d, c: c() })
        // "puxadinho": a smaller room added on the roof later, in its own colour.
        // Like the houses it is sunk (into the house below) so the shader's
        // storey maths is the same for both.
        let tx = x, tz = z, ty = h + height
        if (fr() < 0.4) {
          const aw = w * (0.5 + fr() * 0.3), ad = d * (0.5 + fr() * 0.3)
          const ox = (fr() - 0.5) * (w - aw), oz = (fr() - 0.5) * (d - ad)
          tx = x + Math.cos(ry) * ox + Math.sin(ry) * oz
          tz = z - Math.sin(ry) * ox + Math.cos(ry) * oz
          houses.push({ x: tx, y: ty - FAVELA_SINK, z: tz, ry, sx: aw, sy: 3.6 + FAVELA_SINK, sz: ad, c: c() })
          ty += 3.6
        }
        if (fr() < 0.35) tanks.push({ x: tx + (fr() - 0.5), y: ty, z: tz + (fr() - 0.5), sx: 1.1, sy: 1.3, sz: 1.1, c: '#2f6fd0' })
      }
    }
  }
  const tankGeo = new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0)
  return [makeInstanced(boxGeo, facadeMat('favela-facade', FAVELA_FACADE), houses), makeInstanced(tankGeo, flatMat(), tanks, { cast: false })]
}

// Palm trunk: a thin tapered cylinder of unit height that curves toward +x.
// Instances scale x for how far it leans and y for height.
const PALM_BEND = 0.18
function palmTrunkGeo() {
  const g = new THREE.CylinderGeometry(0.022, 0.036, 1, 5, 5).translate(0, 0.5, 0)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + PALM_BEND * p.getY(i) ** 2)
  g.computeVertexNormals()
  return g
}

// Palm crown: arching fronds of unit length, each folded along its midrib so
// the two halves catch the light differently. About 130 triangles per palm.
function palmCrownGeo() {
  const jitter = mulberry32(11)
  const pos = []
  const frond = (angle, len, rise, droop, width) => {
    const ca = Math.cos(angle), sa = Math.sin(angle)
    // midrib as [distance out, height], arching up then hanging down at the tip
    const rib = [[0, 0], [0.35 * len, rise], [0.72 * len, rise * 0.9 - droop * 0.35], [len, rise * 0.3 - droop]]
    const half = [width * 0.6, width, width * 0.75, 0]
    const P = (i, side) => {
      const [d, h] = rib[i]
      const o = half[i] * side
      return [ca * d - sa * o, h - Math.abs(o) * 0.45, sa * d + ca * o]
    }
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        if (half[i + 1] > 0) pos.push(...P(i, 0), ...P(i + 1, 0), ...P(i + 1, side))
        pos.push(...P(i, 0), ...P(i + 1, side), ...P(i, side))
      }
    }
  }
  const OUTER = 9, INNER = 5
  for (let k = 0; k < OUTER; k++) frond((k + jitter() * 0.6) * ((Math.PI * 2) / OUTER), 0.85 + jitter() * 0.15, 0.2, 0.45 + jitter() * 0.2, 0.2)
  for (let k = 0; k < INNER; k++) frond((k + jitter() * 0.6) * ((Math.PI * 2) / INNER) + 0.3, 0.55 + jitter() * 0.1, 0.42, 0.05, 0.15)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

function buildBeach() {
  const trunks = [], crowns = [], poles = [], umbrellas = []
  const palmRand = mulberry32(7) // separate stream so the rest of the city keeps its layout
  // palms on the promenade from Leblon to Leme
  for (let x = -1700; x < 1450; x += 26) {
    if (Math.abs(x + 120) < 110) continue // Arpoador rock
    const z = coastZ(x) - 68 + (rand() - 0.5) * 4
    const h = Math.max(heightAt(x, z), 1.5)
    const th = 9 + rand() * 5
    const lean = (rand() - 0.5) * 0.25
    // trunks curve mostly toward the sea (+z), each by a different amount
    const ry = -Math.PI / 2 + lean * 6 + (palmRand() - 0.5) * 0.8
    const bend = th * (0.5 + palmRand() * 1.1)
    const top = PALM_BEND * bend
    const tilt = Math.atan((2 * top) / th) * 0.8
    const size = 4.2 + palmRand() * 1.6
    rand() // (was the old crown's rotation; keeps the shared sequence aligned)
    trunks.push({ x, y: h - 0.3, z, ry, sx: bend, sy: th + 0.3, sz: th, c: ['#8a745a', '#7d6a52', '#96806a'][Math.floor(palmRand() * 3)] })
    crowns.push({ x: x + Math.cos(ry) * top, y: h + th, z: z - Math.sin(ry) * top, ry, rz: -tilt, sx: size, sy: size, sz: size, c: pick(['#3f8a3a', '#4f9a3e', '#2f7a36']) })
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
  const frondMat = flatMat()
  frondMat.side = THREE.DoubleSide
  const coneGeo = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0)
  return [
    makeInstanced(palmTrunkGeo(), flatMat(), trunks),
    makeInstanced(palmCrownGeo(), frondMat, crowns),
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
        <mesh key={i} ref={r}>
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
        <mesh key={i}>
          <coneGeometry args={[5, 1.2, 3]} />
          <meshStandardMaterial color={g.c} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function CristoRedentor() {
  // Christ the Redeemer on the Corcovado summit: a few flat-shaded primitives,
  // arms spread north-south, facing east toward Pão de Açúcar. Drawn at about
  // twice true size so it reads from across the city; the top is ~55 m above the
  // summit, and the Corcovado ring in game.js (88 m up, radius 20) clears it.
  const y = heightAt(340, -1480)
  return (
    <group position={[340, y, -1480]} rotation={[0, Math.PI / 2, 0]}>
      {/* lookout platform, sunk into the peak so its rim never floats */}
      <mesh position={[0, -1, 0]} castShadow>
        <cylinderGeometry args={[7, 9, 14, 8]} />
        <meshStandardMaterial color="#ddd6c8" flatShading />
      </mesh>
      {/* pedestal + figure, scaled up from the platform top (y = 6) */}
      <group position={[0, 6, 0]} scale={1.9}>
      <group position={[0, -6, 0]}>
      <mesh position={[0, 9, 0]} castShadow>
        <cylinderGeometry args={[2.6, 3.4, 6, 6]} />
        <meshStandardMaterial color="#cfc8ba" flatShading />
      </mesh>
        {/* robe */}
        <mesh position={[0, 20.5, 0]} castShadow>
          <cylinderGeometry args={[1.5, 2.7, 17, 6]} />
          <meshStandardMaterial color="#f1ede2" emissive="#ffd9a8" emissiveIntensity={0.3} flatShading />
        </mesh>
        {/* outstretched arms */}
        <mesh position={[0, 26.4, 0]} castShadow>
          <boxGeometry args={[21, 1.5, 1.6]} />
          <meshStandardMaterial color="#f1ede2" emissive="#ffd9a8" emissiveIntensity={0.3} flatShading />
        </mesh>
        {/* head */}
        <mesh position={[0, 30.4, 0.1]} castShadow>
          <icosahedronGeometry args={[1.35, 0]} />
          <meshStandardMaterial color="#f1ede2" emissive="#ffd9a8" emissiveIntensity={0.3} flatShading />
        </mesh>
      </group>
      </group>
    </group>
  )
}

function JockeyStands() {
  // grandstands along the south straight of the racetrack, facing the course
  const z = JOCKEY.z + JOCKEY.b + 20
  return (
    <group>
      {[-48, 48].map((dx) => {
        const x = JOCKEY.x + dx
        const y = heightAt(x, z)
        return (
          <group key={dx} position={[x, y, z]}>
            <mesh position={[0, 5, 2]} castShadow>
              <boxGeometry args={[80, 12, 12]} />
              <meshStandardMaterial color="#e9e2d2" flatShading />
            </mesh>
            {/* tiered seating stepping down toward the track */}
            <mesh position={[0, 2.5, -8]} castShadow>
              <boxGeometry args={[80, 7, 8]} />
              <meshStandardMaterial color="#cfc6b4" flatShading />
            </mesh>
            {/* roof canopy */}
            <mesh position={[0, 12.5, -2]} castShadow>
              <boxGeometry args={[82, 0.8, 18]} />
              <meshStandardMaterial color="#8f9a8c" flatShading />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

export default function City() {
  const objects = useMemo(() => {
    const list = [buildCity(), ...buildFavelas(), ...buildBeach(), buildClouds(), ...buildBoats(), ...buildTrees()]
    return list
  }, [])
  return (
    <group>
      {objects.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
      <CableCar />
      <HangGliders />
      <CristoRedentor />
      <JockeyStands />
    </group>
  )
}
