import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { existsSync, mkdirSync } from "fs";

const OPENCODE_URL = process.env.VITE_OPENCODE_URL ?? "http://localhost:4096";
const WORKSPACES_ROOT =
  process.env.VITE_WORKSPACES_ROOT ??
  path.resolve(__dirname, ".workspaces");

function getWorkspaceDir(deviceId: string | null): string {
  if (!deviceId) return WORKSPACES_ROOT;
  const dir = path.join(WORKSPACES_ROOT, deviceId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    port: 3000,
    proxy: {
      // Proxy OpenCode API calls (used by useOpenCodeBridge).
      // The iframe loads OpenCode directly at localhost:4096.
      "/opencode-api": {
        target: OPENCODE_URL,
        changeOrigin: true,
        rewrite: (p) => {
          const url = new URL(p, "http://localhost");
          url.searchParams.delete("device_id");
          return url.pathname.replace(/^\/opencode-api/, "") + url.search || "/";
        },
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const url = new URL(req.url ?? "/", "http://localhost");
            const deviceId = url.searchParams.get("device_id");
            const dir = getWorkspaceDir(deviceId);
            proxyReq.setHeader("x-opencode-directory", encodeURIComponent(dir));
          });
        },
        ws: true,
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
});
