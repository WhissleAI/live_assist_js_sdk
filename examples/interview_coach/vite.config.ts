import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    proxy: {
      "/asr/stream": { target: "ws://localhost:8001", ws: true },
      "/voice-agent": { target: "http://localhost:8765" },
    },
  },
  resolve: {
    alias: {
      "@whissle/live-assist-core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
});
