import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    minify: "esbuild",
    // Strip console.log/warn/debug in production to avoid leaking data
    target: "es2020",
  },
  esbuild: {
    drop: process.env.NODE_ENV === "production" ? ["console", "debugger"] : [],
  },
  server: {
    proxy: {
      "/asr": {
        target: "ws://localhost:9000",
        ws: true,
      },
      "/agent": {
        target: "http://localhost:9000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:9000",
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
});
