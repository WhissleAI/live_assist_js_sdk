import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    minify: "esbuild",
    target: "es2020",
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor": ["react", "react-dom"],
        },
      },
    },
  },
  esbuild: {
    // Strip console.log/warn/info/debug in production but keep console.error
    drop: mode === "production" ? ["debugger"] : [],
    pure: mode === "production" ? ["console.log", "console.warn", "console.info", "console.debug"] : [],
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
}));
