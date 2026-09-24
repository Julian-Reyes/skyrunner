# Céu do Rio

A low-poly flight game over Rio de Janeiro, built with three.js and React Three Fiber. Fly a 16-ring tour past Pão de Açúcar, Corcovado, Dois Irmãos, Rocinha, Vidigal and the beaches of Leblon, Ipanema and Copacabana, or just fly freely.

```bash
npm install
npm run dev     # play locally
npm run build   # dist/index.html, a single self-contained file
```

**Controls:** W/S pitch (S pulls up, I inverts), A/D roll and bank, Q/E rudder, Space boost, C air brake, R restart, M mute, Esc menu.

Terrain, city, water and sky are all procedural (no asset files). The ocean and sky are custom GLSL shaders.
