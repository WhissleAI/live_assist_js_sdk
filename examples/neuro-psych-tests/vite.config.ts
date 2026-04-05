import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const gateway = process.env.VITE_GATEWAY_URL || "https://api.whissle.ai";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    proxy: {
      "/asr/stream": {
        target: gateway,
        ws: true,
        changeOrigin: true,
        secure: true,
      },
      "/route/stream": {
        target: gateway,
        changeOrigin: true,
        secure: true,
      },
      "/agent": {
        target: gateway,
        changeOrigin: true,
        secure: true,
      },
      "/neuropsych": {
        target: gateway,
        changeOrigin: true,
        secure: true,
      },
      "/live-assist": {
        target: gateway,
        changeOrigin: true,
        secure: true,
      },
      "/session": {
        target: gateway,
        changeOrigin: true,
        secure: true,
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
