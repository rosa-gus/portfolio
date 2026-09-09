import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  publicDir: resolve(import.meta.dirname, "web/assets"),
  build: {
    outDir: resolve(import.meta.dirname, "web/dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, "web/scripts/main.ts"),
      output: {
        entryFileNames: "assets/app.js",
        assetFileNames: (assetInfo) =>
          assetInfo.names?.some((name) => name.endsWith(".css"))
            ? "assets/app.css"
            : "assets/[name][extname]",
      },
    },
  },
});
