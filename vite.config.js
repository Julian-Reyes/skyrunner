import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build` → dist/index.html, a single self-contained file (easy to host anywhere).
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: { chunkSizeWarningLimit: 3000 },
});
