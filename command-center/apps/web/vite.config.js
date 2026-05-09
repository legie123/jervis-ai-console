import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const operatorOrigin = process.env.JARVIS_OPERATOR_ORIGIN || "http://127.0.0.1:4317";

export default defineConfig({
  root: __dirname,
  appType: "mpa",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      input: path.resolve(__dirname, "index.html")
    }
  },
  server: {
    port: Number(process.env.VITE_DEV_PORT || 5173),
    strictPort: false,
    proxy: {
      "/api": { target: operatorOrigin, changeOrigin: true },
      "/webhooks": { target: operatorOrigin, changeOrigin: true }
    }
  }
});
