import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@whissle/live-assist-core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks: {
          "pdf-worker": ["pdfjs-dist"],
        },
      },
    },
  },
});
