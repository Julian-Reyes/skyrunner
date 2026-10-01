# Céu do Rio

A low-poly flight game over Rio de Janeiro, built with three.js and React Three Fiber. Fly a 16-ring tour past Pão de Açúcar, Corcovado, Dois Irmãos, Rocinha, Vidigal and the beaches of Leblon, Ipanema and Copacabana, or just fly freely.

```bash
npm install
npm run dev     # play locally
npm run build   # dist/index.html, a single self-contained file
```

**Controls:** W/S pitch (S pulls up, I inverts), A/D roll and bank, Q/E rudder, Space boost, C air brake, R restart, M mute, Esc menu.

**Touchscreen:** Open the same game in your phone or tablet browser. Drag the bottom-centre stick down to climb, up to dive, and sideways to bank. Each touch starts neutral, with gentle steering near the centre. Hold Boost or Brake with your other thumb. Speed, altitude and boost gauges sit beneath the controls. Menu, Restart and Mute are available on screen. Portrait and landscape are supported; landscape gives you a wider view.

In landscape, the stick moves to the left and Boost / Brake sit side by side on the bottom right. The mobile landscape camera zooms in slightly, and the game canvas fills the viewport as the phone rotates or the browser bars resize.

To try it on a phone during development, run `npm run dev -- --host 0.0.0.0` and open the displayed network URL on a phone connected to the same Wi-Fi.

Terrain, city, water and sky are all procedural (no asset files). The ocean and sky are custom GLSL shaders.
