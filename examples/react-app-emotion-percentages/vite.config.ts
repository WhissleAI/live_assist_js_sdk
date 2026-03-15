import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@whissle/live-assist-react/styles": path.resolve(__dirname, "../../packages/react/styles"),
      "@whissle/live-assist-react": path.resolve(__dirname, "../../packages/react/src/index.ts"),
      "@whissle/live-assist-core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
});
