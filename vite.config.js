import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const hmrPort = Number(process.env.VITE_HMR_PORT || 24700);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    hmr: {
      port: hmrPort
    }
  }
});
