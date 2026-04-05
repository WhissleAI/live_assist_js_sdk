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
