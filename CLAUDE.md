# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`live_assist_js_sdk` is a monorepo containing Whissle's JavaScript/TypeScript SDK for real-time voice AI — ASR streaming, emotion detection, TTS, behavioral profiling, and session analytics. It includes reusable packages and several example applications.

## Build & Dev Commands

```bash
# Build all packages (from repo root)
npm run build

# Build just the core package
cd packages/core && npm run build

# Voice-agent example app (Whissle Studio — studio.whissle.ai)
cd examples/voice-agent
npm run dev          # Vite dev server
npm run build        # Production build
npx tsc --noEmit --project tsconfig.json   # Typecheck only

# Docker build for voice-agent (context must be SDK root)
./examples/voice-agent/docker-build.sh \
  -t us-central1-docker.pkg.dev/deepvoice-468015/cloud-run-source-deploy/whissle-studio:latest \
  --build-arg VITE_GATEWAY_URL=https://api.whissle.ai \
  --build-arg VITE_CARTESIA_API_KEY=<key>

# Full ASR + SDK Docker stack (from parent live_assist/ root)
./live_assist_js_sdk/scripts/build-docker.sh
GEMINI_API_KEY=<key> docker compose -f live_assist_js_sdk/docker/docker-compose.yml up -d
```

## Architecture

### Packages (npm workspaces)

- **`packages/core`** (`@whissle/live-assist-core`) — Framework-agnostic TypeScript library. Provides `AsrStreamClient` (WebSocket ASR), `MicCapture`/`TabCapture` (audio input), `AudioRecorder`, `createBehavioralProfileManager` (emotion/intent aggregation), `streamLiveAssistWithFeedback` (LLM coaching stream), `computeRmsWindows` (amplitude analysis), and session storage utilities.

- **`packages/react`** (`@whissle/live-assist-react`) — React component library wrapping core. `LiveAssistWidget` is the main entry point — a full-featured coaching UI with transcript, emotion timeline, personality sidebar, agenda tracker, and session controls. Uses `LiveAssistProvider` for context.

- **`packages/server`** — Python FastAPI server for the agent/LLM backend (routes for live-assist graph, vector memory).

### Voice-Agent Example App (Whissle Studio)

`examples/voice-agent/` is a standalone React SPA (Vite, no framework) deployed to Cloud Run as `voice-agents` service. It's the primary development target in this repo.

**Key architectural patterns:**

- **Hash router in `App.tsx`** — All routing is `window.location.hash`-based with a `navigate()` helper. No React Router.
- **`AppShell.tsx`** — Sidebar layout wrapper with nav items. All pages render inside `<AppShell>`.
- **State pattern** — Session state uses `useRef` + `useState` pair (`sessionRef` + `session`) to avoid stale closures in WebSocket callbacks. The ref is the source of truth; state drives re-renders.
- **`useAsrSession` hook** — Manages WebSocket connection to ASR, processes `metadata_probs_timeline` for per-second emotion data, flushes transcript segments with emotion probabilities.
- **`useVoiceAgent` hook** — Orchestrates full voice agent sessions: ASR → LLM (via `agent-stream.ts`) → TTS (Cartesia WebSocket). Handles barge-in, turn management, audio recording.
- **`session-store.ts` / `audio-store.ts`** — localStorage for session metadata, IndexedDB for audio blobs.
- **`EmotionTimelineBar`** (`components/live-assist/`) — Canvas-based emotion spectrogram visualization with amplitude overlay, zoom, drag scrolling, and tooltip. Used in both live sessions and session analysis. Supports `ScrollSyncGroup` for synchronized scrolling across multiple strips.
- **`Icon.tsx`** — Inline SVG icon system (Lucide-style paths, no dependencies). All UI icons go through this component.
- **CSS design system** (`styles/index.css`) — Single CSS file with custom properties (`--color-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--font-*`). Forest green brand (#124e3f), Plus Jakarta Sans display font. Notion/Linear aesthetic.

**Data flow for emotion detection:**
ASR WebSocket → `metadata_probs_timeline` (per-second) → stored in `session.emotionTimeline` as `EmotionTimelineEntry[]` → saved to localStorage → rendered by `EmotionTimelineBar` using canvas.

### Deployment

- **Cloud Run service:** `voice-agents` in project `deepvoice-468015`, region `us-central1`
- **Image registry:** `us-central1-docker.pkg.dev/deepvoice-468015/cloud-run-source-deploy/whissle-studio`
- **Dockerfile:** Multi-stage — `node:20-slim` builder (builds core package first, then voice-agent SPA) → `nginx:1.27-alpine` serving static files on port 8080
- **Gateway:** Production gateway at `https://api.whissle.ai` (Vite env var `VITE_GATEWAY_URL`)
- Deploy: `gcloud run deploy voice-agents --image <registry>/whissle-studio:latest --region us-central1 --project deepvoice-468015 --port 8080 --allow-unauthenticated`

## Pre-existing TypeScript Errors

`KidView.tsx`, `AgentRuntime.tsx`, and `agent-stream.ts` have pre-existing type errors (mismatched speaker types, missing session state fields, AgentConfig casting). These are known and do not block the Vite build — only `tsc --noEmit` reports them.
