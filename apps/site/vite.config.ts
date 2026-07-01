import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "box3d-wasm": fileURLToPath(new URL("../../packages/box3d-wasm/src/index.ts", import.meta.url))
    }
  },
  optimizeDeps: {
    exclude: ["box3d-wasm"]
  },
  server: {
    port: 5173
  }
});
