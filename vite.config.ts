import { defineConfig } from "vite";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export default defineConfig({
  base: "./",
  plugins: [{
    name: "project-image-dimensions",
    buildStart() {
      const root = import.meta.dirname;
      const script = resolve(root, "tools/image_dimensions.py");
      const catalog = resolve(root, "internal/portfolio/data/projects.json");
      this.addWatchFile(script);
      this.addWatchFile(catalog);
      execFileSync("python3", [script, "--root", root], { stdio: "inherit" });
      const projects = JSON.parse(readFileSync(catalog, "utf8"));
      for (const project of projects) {
        this.addWatchFile(resolve(root, `web/assets/projects/covers/${project.slug}.webp`));
        for (const image of project.media.items) {
          this.addWatchFile(resolve(root, "web/assets", image.src.slice(1)));
        }
      }
    },
  }],
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
