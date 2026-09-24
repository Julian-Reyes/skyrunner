# Céu do Rio

A low-poly browser flight game over Rio de Janeiro's South Zone at golden hour. Portfolio piece: three.js with React Three Fiber, custom GLSL shaders, and procedural terrain. Everything is generated in code, with no model files yet.

## Commands
- `npm install`, then `npm run dev` for local dev (Vite, http://localhost:5173)
- `npm run build` outputs `dist/index.html`, one self-contained file (vite-plugin-singlefile) you can host anywhere
- Debug in the browser console with `window.__game`, the live game state (`__game.pos.set(x,y,z)` teleports)

## World coordinates
- +x = east, -z = north (inland/mountains), +z = south (Atlantic). Units are about 1 m vertically; horizontal distances are compressed about 2x versus the real city.
- The map is 7000 × 7000, centred on the origin. Arpoador is near x≈-120, Pão de Açúcar at (2060, -70), Corcovado at (340, -1480), Dois Irmãos around (-1800, -200), Pedra da Gávea at (-2950, -760).

## Architecture
- `src/world/terrain.js` is the single source of truth for geography. `heightAt(x,z)` is analytic: coastline curve + peaks + noise. It also holds the favela zones, landmark names, the city grid, and `groundAt()` for collision. Change geography here and everything else follows (mesh, water depth, minimap, collision).
- `src/world/Terrain.jsx` builds a 420×420 flat-shaded mesh with vertex colours chosen by height, slope, and zone.
- `src/world/Water.jsx` is a custom ShaderMaterial ocean: vertex waves, faceted normals via dFdx/dFdy, bathymetry baked to a DataTexture for depth colour and shore foam, fresnel, sun glint, and three.js fog chunks.
- `src/world/Sky.jsx` is a gradient sky dome whose horizon colour equals the fog colour (see `env.js`) so the fog blends seamlessly.
- `src/world/City.jsx` builds everything instanced: tower blocks (which also fill `cityTop` for collision), favela houses with blue water tanks, palms, beach umbrellas, clouds, boats, the Pão de Açúcar cable car, hang gliders over São Conrado, and the Corcovado summit beacon.
- `src/Plane.jsx` holds the plane model, the arcade flight model (bank-to-turn, energy/gravity along the flight path, stall), collision, and the chase camera.
- `src/Rings.jsx` has the ring course, pass detection, and the guide arrow. The course itself is defined in `src/game.js` (`COURSE_DEF`).
- `src/ui/HUD.jsx` is a DOM overlay (title, timer, gauges, minimap canvas, landmark toasts). It reads the mutable `game` object on rAF, so there's no React state in the hot path.
- `src/audio.js` is procedural WebAudio (engine drone, wind, blips). It starts on the first button click.
- Post-processing lives in `App.jsx`: Bloom, Vignette, ACES tone mapping, SMAA. Materials that should glow use `toneMapped={false}` and emissive values above 1.

## Conventions
- Game state is one mutable object (`game` in `game.js`). Don't put per-frame values in React state.
- New scenery goes through `makeInstanced()` in City.jsx; don't add thousands of meshes.
- Keep the low-poly look: `flatShading`, low segment counts, no textures unless deliberate.
- Seeded RNG (`mulberry32`) keeps the city identical on every load.

## Ideas / next steps
- Touch controls (virtual stick + boost button) so it plays on phones
- Night mode: emissive windows in the favelas and along Avenida Atlântica, beach lights; this is where the bloom will shine
- Swap the box plane for a CC0 low-poly model (Kenney / Quaternius / Poly Pizza, loaded with drei `useGLTF`)
- Copacabana's wave-pattern promenade as a shader stripe; Maracanã; Niterói across the bay
- Ghost replay of your best run; leaderboard
- Deploy: Vercel, or a subpath of julianreyes.dev; record a 20–30 s clip for social
