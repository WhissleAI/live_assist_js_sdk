import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    proxy: {
      "/asr": {
        target: "ws://localhost:9000",
        ws: true,
      },
      "/agent": {
        target: "http://localhost:9000",
        changeOrigin: true,
      },
      "/tts": {
        target: "ws://localhost:9000",
        ws: true,
      },
      "/health": {
        target: "http://localhost:9000",
        changeOrigin: true,
      },
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
