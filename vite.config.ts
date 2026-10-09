import { builtinModules } from "node:module";
import { defineConfig } from "vite";

const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

const EXTERNAL_PREFIXES = ["@opencode/"];

export default defineConfig({
  build: {
    ssr: true,
    target: "node20",
    outDir: ".",
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    lib: {
      entry: {
        index: "src/index.ts",
        tui: "src/tui.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: (id: string) =>
        NODE_BUILTINS.has(id) ||
        EXTERNAL_PREFIXES.some((prefix) => id.startsWith(prefix)),
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
  ssr: {
    target: "node",
  },
});
