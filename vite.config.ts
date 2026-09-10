import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  publicDir: resolve(import.meta.dirname, "web/assets"),
  build: {
    outDir: resolve(import.meta.dirname, "web/dist"),
    emptyOutDir: true,
    manifest: "vite-manifest.json",
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, "web/scripts/main.ts"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
