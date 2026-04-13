/**
 * Single-command startup: OpenCode server + Vite dev server.
 *
 * OpenCode supports multi-user via the `directory` query parameter —
 * each browser gets a unique device ID stored in localStorage,
 * which maps to a workspace directory under WORKSPACES_ROOT.
 *
 * Usage: npm run dev
 */

import { spawn } from "child_process"
import { existsSync, mkdirSync } from "fs"
import path from "path"

const OPENCODE_PORT = 4096
const OPENCODE_HOST = "0.0.0.0"
const VITE_PORT = 3000

// Each browser user gets a workspace directory under this root.
// OpenCode routes requests to the right workspace via `?directory=` param.
const WORKSPACES_ROOT = path.resolve(
  import.meta.dirname ?? __dirname,
  ".workspaces",
)

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

async function startOpenCode() {
  console.log(`[meta-aware-coding] Starting OpenCode server on :${OPENCODE_PORT}...`)
  console.log(`[meta-aware-coding] Workspaces root: ${WORKSPACES_ROOT}`)

  ensureDir(WORKSPACES_ROOT)

  // Start opencode in "serve" mode as a child process.
  // Mirrors the "dev" script from opencode-w/package.json:
  //   bun run --cwd packages/opencode --conditions=browser src/index.ts
  const opencodeRoot = path.resolve(
    import.meta.dirname ?? __dirname,
    "../../../opencode-w",
  )

  const proc = spawn(
    "bun",
    [
      "run",
      "--cwd", path.join(opencodeRoot, "packages/opencode"),
      "--conditions=browser",
      "src/index.ts",
      "serve",
      "--port", String(OPENCODE_PORT),
      "--hostname", OPENCODE_HOST,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: opencodeRoot,
      env: {
        ...process.env,
        OPENCODE_SERVER_PORT: String(OPENCODE_PORT),
        OPENCODE_SERVER_HOSTNAME: OPENCODE_HOST,
      },
    },
  )

  proc.stdout?.on("data", (data: Buffer) => {
    process.stdout.write(`[opencode] ${data}`)
  })

  proc.stderr?.on("data", (data: Buffer) => {
    process.stderr.write(`[opencode] ${data}`)
  })

  proc.on("error", (err) => {
    console.error(`[meta-aware-coding] Failed to start OpenCode:`, err.message)
    console.error(`[meta-aware-coding] Make sure opencode-w is set up: cd ../../../opencode-w && bun install`)
  })

  proc.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[meta-aware-coding] OpenCode server exited with code ${code}`)
    }
  })

  // Wait for the server to start
  await new Promise((resolve) => setTimeout(resolve, 3000))
  console.log(`[meta-aware-coding] OpenCode server should be running on http://localhost:${OPENCODE_PORT}`)

  return proc
}

async function startVite() {
  console.log(`[meta-aware-coding] Starting Vite dev server on :${VITE_PORT}...`)

  const proc = spawn("npx", ["vite", "--port", String(VITE_PORT), "--host"], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: import.meta.dirname ?? __dirname,
    env: {
      ...process.env,
      VITE_OPENCODE_URL: `http://localhost:${OPENCODE_PORT}`,
      VITE_WORKSPACES_ROOT: WORKSPACES_ROOT,
    },
  })

  proc.stdout?.on("data", (data: Buffer) => {
    process.stdout.write(`[vite] ${data}`)
  })

  proc.stderr?.on("data", (data: Buffer) => {
    process.stderr.write(`[vite] ${data}`)
  })

  return proc
}

async function main() {
  console.log("[meta-aware-coding] Starting Meta-Aware Coding...")
  console.log("")

  const opencode = await startOpenCode()
  const vite = await startVite()

  // Handle shutdown
  const cleanup = () => {
    console.log("\n[meta-aware-coding] Shutting down...")
    vite.kill("SIGTERM")
    opencode.kill("SIGTERM")
    process.exit(0)
  }

  process.on("SIGINT", cleanup)
  process.on("SIGTERM", cleanup)
}

main().catch((err) => {
  console.error("[meta-aware-coding] Fatal error:", err)
  process.exit(1)
})
