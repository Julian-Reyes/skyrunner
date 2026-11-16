import { useMemo, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { heightAt, coastZ, favelaAt, lagoaE, fbm, sstep, MAP_SIZE, CITY as CITY_GRID, cityCols, cityRows, cityTop, cityFoot, cityPlaza, lagoaShoreDist, LAGOA, JOCKEY } from './terrain.js'

const SEG = 420

const C = (hex) => new THREE.Color(hex)
const SAND = C('#ecd6a2'), WET = C('#b9a47a'), SEABED = C('#6f7f6a')
const CITY = C('#9a9387'), DIRT = C('#9b5f3c')
const ROCK = C('#6f675f'), GRANITE = C('#a09486')
const FOREST1 = C('#2f5d2a'), FOREST2 = C('#4f7f36'), FOREST3 = C('#244a24')

// Ground detail is drawn in the fragment shader on top of the vertex colours:
//  - streets (asphalt, dashed centre line, pavement) only along block edges that
//    have a tower on one side, a paved plot under each tower, grass on the
//    blocks left as squares
//  - the Jockey Club racetrack west of the lagoon
//  - the lagoon's perimeter: stone edge, park with a cycle path, ring avenue
//  - the black-and-white wave promenade along the beaches
// Per-vertex inputs: `aGround` (x = city mask, y = metres inland from the coast,
// z = promenade mask) and `aLake` (x = metres from the lagoon's waterline,
// y = mask for the flat shore). `uCityMap` has one texel per block: r = tower,
// g = tower footprint / 40 m, b = square.
const MAX_FOOT = 40
const GROUND_FRAG = /* glsl */ `
  float px = max(fwidth(vXZ.x), fwidth(vXZ.y)); // metres per pixel
  float fine = 1.0 - smoothstep(0.4, 1.2, px);  // fades thin markings with distance
  vec3 ASPHALT = vec3(0.085, 0.085, 0.095);
  vec3 PAVING = vec3(0.46, 0.43, 0.38);
  vec3 GRASS = vec3(0.09, 0.22, 0.05);
  float cityMask = smoothstep(0.35, 0.65, vGround.x);

  vec2 cg = (vXZ - uCityOrigin) / uCell;
  vec2 cid = floor(cg);
  if (cityMask > 0.0 && cid.x >= 0.0 && cid.y >= 0.0 && cid.x < uGrid.x && cid.y < uGrid.y) {
    vec2 cf = cg - cid;
    vec2 e = min(cf, 1.0 - cf) * uCell; // metres to the block's edges
    vec4 info = texture2D(uCityMap, (cid + 0.5) / uGrid);
    float built = step(0.5, info.r);
    // a street runs along a block edge only if a tower stands on either side of it
    vec2 side = step(0.5, cf) * 2.0 - 1.0;
    float onX = max(built, step(0.5, texture2D(uCityMap, (cid + vec2(side.x, 0.0) + 0.5) / uGrid).r));
    float onZ = max(built, step(0.5, texture2D(uCityMap, (cid + vec2(0.0, side.y) + 0.5) / uGrid).r));
    vec2 on = vec2(onX, onZ);
    vec2 road = (1.0 - smoothstep(3.6 - px, 3.6 + px, e)) * on;
    vec2 walk = (1.0 - smoothstep(5.6 - px, 5.6 + px, e)) * on;
    vec2 dash = (1.0 - smoothstep(0.18, 0.18 + px, e)) * step(0.5, fract(vXZ.yx / 7.0)) * on;

    vec3 ground = diffuseColor.rgb;
    if (built > 0.5) {
      // paved plot, shaded where it meets the tower
      float rnd = fract(sin(dot(cid, vec2(127.1, 311.7))) * 43758.5453);
      ground = mix(vec3(0.36, 0.33, 0.29), vec3(0.44, 0.41, 0.36), rnd);
      vec2 q = abs(cf - 0.5) * uCell - info.g * ${(MAX_FOOT / 2).toFixed(1)};
      ground *= mix(0.6, 1.0, smoothstep(0.0, 4.0, max(q.x, q.y)));
    } else if (info.b > 0.5) {
      ground = GRASS; // a square among the towers (City.jsx plants trees on it)
    }
    ground = mix(ground, PAVING, max(walk.x, walk.y));
    ground = mix(ground, mix(ASPHALT, vec3(0.6), max(dash.x, dash.y) * fine), max(road.x, road.y));
    diffuseColor.rgb = mix(diffuseColor.rgb, ground, cityMask);
  }

  // Jockey Club: sand course outside, turf course inside, striped infield
  vec2 jq = (vXZ - vec2(${JOCKEY.x.toFixed(1)}, ${JOCKEY.z.toFixed(1)})) / vec2(${JOCKEY.a.toFixed(1)}, ${JOCKEY.b.toFixed(1)});
  float js = length(jq);
  if (cityMask > 0.0 && js < 1.3 && js > 0.001) {
    float jd = (1.0 - js) * js / length(jq / vec2(${JOCKEY.a.toFixed(1)}, ${JOCKEY.b.toFixed(1)})); // metres inside the outer rail
    vec3 jc = vec3(0.10, 0.27, 0.07) * (0.93 + 0.07 * step(0.5, fract(vXZ.x / 14.0)));
    jc = mix(jc, vec3(0.50, 0.38, 0.24), smoothstep(3.0 - px, 3.0 + px, jd) * (1.0 - smoothstep(17.0 - px, 17.0 + px, jd)));
    jc = mix(jc, vec3(0.14, 0.33, 0.09), smoothstep(20.0 - px, 20.0 + px, jd) * (1.0 - smoothstep(32.0 - px, 32.0 + px, jd)));
    float rail = min(min(abs(jd - 3.0), abs(jd - 17.0)), min(abs(jd - 20.0), abs(jd - 32.0)));
    jc = mix(jc, vec3(0.75), (1.0 - smoothstep(0.35, 0.35 + px, rail)) * fine);
    jc = mix(PAVING * 0.9, jc, smoothstep(-px, px, jd));
    diffuseColor.rgb = mix(diffuseColor.rgb, jc, cityMask * smoothstep(-12.0, -9.0, jd));
  }

  // Lagoa perimeter, by distance from the waterline: stone edge, park with a
  // reddish cycle path, the ring avenue, then a pavement where the city starts
  float ld = vLake.x;
  float lakeMask = smoothstep(0.35, 0.65, vLake.y) * smoothstep(-1.5, 0.5, ld) * (1.0 - smoothstep(41.0, 42.5, ld));
  if (lakeMask > 0.0) {
    vec3 lg = GRASS * (0.92 + 0.16 * fract(sin(dot(floor(vXZ / 9.0), vec2(12.9898, 78.233))) * 43758.5453));
    lg = mix(vec3(0.50, 0.47, 0.40), lg, smoothstep(2.5 - px, 3.5 + px, ld));
    lg = mix(lg, vec3(0.42, 0.22, 0.15), 1.0 - smoothstep(1.5 - px, 1.5 + px, abs(ld - 10.5)));
    float avenue = smoothstep(28.0 - px, 28.0 + px, ld) * (1.0 - smoothstep(38.0 - px, 38.0 + px, ld));
    vec2 lc = vXZ - vec2(${LAGOA.x.toFixed(1)}, ${LAGOA.z.toFixed(1)});
    float lap = atan(lc.y, lc.x) * 360.0; // roughly metres around the lake
    float ldash = (1.0 - smoothstep(0.18, 0.18 + px, abs(ld - 33.0))) * step(0.5, fract(lap / 7.0)) * fine;
    lg = mix(lg, mix(ASPHALT, vec3(0.6), ldash), avenue);
    lg = mix(lg, PAVING, smoothstep(38.0 - px, 38.0 + px, ld));
    diffuseColor.rgb = mix(diffuseColor.rgb, lg, lakeMask);
  }

  // calçadão: wavy black-and-white stone stripes running along the beach
  float prom = smoothstep(0.35, 0.65, vGround.z) * smoothstep(61.0 - px, 62.0, vGround.y) * (1.0 - smoothstep(72.0, 73.0 + px, vGround.y));
  if (prom > 0.0) {
    float stripe = step(0.5, fract((vGround.y + 1.1 * sin(vXZ.x * 0.9)) / 2.4));
    vec3 stone = mix(mix(vec3(0.03), vec3(0.75), stripe), vec3(0.36), smoothstep(0.3, 1.0, px));
    diffuseColor.rgb = mix(diffuseColor.rgb, stone, prom);
  }
`

export default function Terrain() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, SEG, SEG)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const ground = new Float32Array(pos.count * 3)
    const lake = new Float32Array(pos.count * 2)
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
        ground[i * 3] = 1
        // parkland around the lagoon, thinning out into the city
        const park = 1 - sstep(70, 150, lagoaShoreDist(x, z))
        if (park > 0) col.lerp(tmp.copy(FOREST2).lerp(FOREST1, 0.5 + 0.5 * n), park * 0.85)
      } else {
        col.copy(FOREST1).lerp(FOREST2, 0.5 + 0.5 * n)
        tmp.copy(FOREST3)
        col.lerp(tmp, Math.min(0.6, y / 900))
      }
      ground[i * 3 + 1] = d
      const ld = lagoaShoreDist(x, z)
      lake[i * 2] = Math.max(-40, Math.min(120, ld))
      if (ld < 75 && y < 5 && y > -5) lake[i * 2 + 1] = 1
      // promenade: Leblon to Leme, skipping the Arpoador rock (same span as the palms)
      if (x > -1720 && x < 1470 && Math.abs(x + 120) > 110 && y > 0.8 && y < 5 && lagoaE(x, z) > 1.1) ground[i * 3 + 2] = 1
      colors[i * 3] = col.r
      colors[i * 3 + 1] = col.g
      colors[i * 3 + 2] = col.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.setAttribute('aGround', new THREE.BufferAttribute(ground, 3))
    g.setAttribute('aLake', new THREE.BufferAttribute(lake, 2))
    g.computeVertexNormals()
    return g
  }, [])

  const { material, cityMap } = useMemo(() => {
    const cityMap = new THREE.DataTexture(new Uint8Array(cityCols * cityRows * 4), cityCols, cityRows, THREE.RGBAFormat)
    cityMap.magFilter = cityMap.minFilter = THREE.NearestFilter
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uCityMap = { value: cityMap }
      shader.uniforms.uCityOrigin = { value: new THREE.Vector2(CITY_GRID.x0, CITY_GRID.z0) }
      shader.uniforms.uCell = { value: CITY_GRID.cell }
      shader.uniforms.uGrid = { value: new THREE.Vector2(cityCols, cityRows) }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aGround;\nattribute vec2 aLake;\nvarying vec3 vGround;\nvarying vec2 vLake;\nvarying vec2 vXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = aGround;\nvLake = aLake;\nvXZ = position.xz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uCityMap;\nuniform vec2 uCityOrigin;\nuniform float uCell;\nuniform vec2 uGrid;\nvarying vec3 vGround;\nvarying vec2 vLake;\nvarying vec2 vXZ;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + GROUND_FRAG)
    }
    return { material, cityMap }
  }, [])

  // City.jsx fills cityTop / cityFoot while it renders, so read them afterwards.
  useLayoutEffect(() => {
    const data = cityMap.image.data
    for (let i = 0; i < cityCols * cityRows; i++) {
      data[i * 4] = cityTop[i] ? 255 : 0
      data[i * 4 + 1] = Math.min(255, (cityFoot[i] / MAX_FOOT) * 255)
      data[i * 4 + 2] = cityPlaza[i] ? 255 : 0
    }
    cityMap.needsUpdate = true
  }, [cityMap])

  return <mesh geometry={geometry} material={material} receiveShadow />
}
