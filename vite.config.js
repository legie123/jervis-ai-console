import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const hmrPort = Number(process.env.VITE_HMR_PORT || 24700);

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) return "three-vendor";
          return undefined;
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    hmr: {
      port: hmrPort
    }
  }
});
