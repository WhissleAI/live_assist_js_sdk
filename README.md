# Live Assist JS-SDK

Real-time conversation intelligence — transcription, behavioral profiling, agenda tracking, and AI feedback. One Docker image with ASR, models, and agent. You only need a Gemini or Claude API key.

## Quick Start (Docker)

**Option A: Install script** (recommended)

```bash
# Replace with your repo URL when published
curl -fsSL https://raw.githubusercontent.com/WhissleAI/live_assist/main/live_assist_js_sdk/install.sh | bash
```

Or with your API key:

```bash
GEMINI_API_KEY=your_key curl -fsSL .../install.sh | bash
# or for Claude:
ANTHROPIC_API_KEY=your_key LLM_PROVIDER=anthropic curl -fsSL .../install.sh | bash
```

**Option B: Docker Compose**

```bash
# Clone the repo (or just download docker-compose.unified.yml)
git clone https://github.com/WhissleAI/live_assist.git
cd live_assist/live_assist_js_sdk

# Set your API key and run
export GEMINI_API_KEY=your_key_here
docker compose -f docker/docker-compose.unified.yml up -d
```

**Option C: Docker run**

```bash
docker run -d --name live-assist \
  -p 8001:8001 -p 8765:8765 \
  -e GEMINI_API_KEY=your_key_here \
  whissleasr/live-assist:latest
```

### What you get

| Port | Service |
|------|---------|
| 8001 | ASR (WebSocket at `ws://localhost:8001/asr/stream`) |
| 8765 | Agent API (feedback, sessions, health) |

First start takes ~2 minutes while ASR loads models. Check logs: `docker logs -f live-assist`.

---

## Architecture

```
Browser ──WebSocket PCM──► ASR Server (8001)
  │                          │
  │                    transcript + metadata
  │                          │
  ◄──────────────────────────┘
  │
  ├──SSE──► Agent Server (8765)
  │           ├── Memory extraction
  │           ├── Status tracking
  │           ├── LLM feedback (Gemini/Claude)
  │           └── Action item extraction
  │
  ◄──────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@whissle/live-assist-core` | Framework-agnostic JS — ASR client, capture, profiling, session orchestrator |
| `@whissle/live-assist-react` | React components — provider, widget, donut, transcript, agenda tracker |
| `packages/server` | Python FastAPI agent with LangGraph workflow |

## Integration

### 1. React

### 2. React integration

```bash
npm install @whissle/live-assist-core @whissle/live-assist-react
```

```tsx
import { LiveAssistProvider, LiveAssistWidget } from '@whissle/live-assist-react';
import '@whissle/live-assist-react/styles/live-assist.css';

function App() {
  return (
    <LiveAssistProvider config={{
      asrUrl: "ws://localhost:8001/asr/stream",
      agentUrl: "http://localhost:8765",
    }}>
      <LiveAssistWidget
        agenda={[
          { id: "1", title: "Discuss roadmap" },
          { id: "2", title: "Review metrics" },
        ]}
      />
    </LiveAssistProvider>
  );
}
```

### 3. Vanilla JS integration

```js
import { createLiveAssistSession } from '@whissle/live-assist-core';

const session = createLiveAssistSession({
  asrUrl: "ws://localhost:8001/asr/stream",
  agentUrl: "http://localhost:8765",
});

session.on("transcript", (entry) => {
  console.log(`[${entry.channel}] ${entry.text}`);
});

session.on("profile", ({ user, other }) => {
  console.log("User emotion:", user.emotionProfile);
});

session.on("feedback", ({ summary, suggestions }) => {
  console.log("AI says:", summary);
});

await session.start({ includeTab: true });

// ... later
const report = await session.stop();
```

### 4. iframe embed

```html
<iframe
  src="http://localhost:3001/widget?agenda=Discuss+roadmap,Review+metrics"
  width="400" height="600"
  allow="microphone; display-capture"
/>
```

## API Reference

### Core: `LiveAssistSession`

```ts
const session = createLiveAssistSession(config: LiveAssistConfig);

// Events
session.on("transcript", (entry: TranscriptEntry) => void);
session.on("profile", (profiles: { user: BehavioralProfile; other: BehavioralProfile }) => void);
session.on("feedback", (data: { summary: string; suggestions: string[] }) => void);
session.on("action", (data: { items: ActionItem[] }) => void);
session.on("memory", (data: { items: MemoryItem[] }) => void);
session.on("agenda", (items: AgendaItem[]) => void);
session.on("status", (data: { engagementScore; sentimentTrend; keywords }) => void);
session.on("error", (err: Error) => void);

// Lifecycle
await session.start({ includeTab?: boolean; agenda?: AgendaItem[] });
const report: SessionReport = await session.stop();
```

### Core: `AsrStreamClient`

```ts
const asr = new AsrStreamClient("ws://localhost:8001/asr/stream", { metadataProb: true });
asr.onTranscript = (seg: StreamTranscriptSegment) => { ... };
await asr.connect();
asr.sendPcm(int16Array);
asr.setChannel("system");
const finals = await asr.end();
```

### React: Components

| Component | Props |
|-----------|-------|
| `<LiveAssistProvider>` | `config: LiveAssistConfig` |
| `<LiveAssistWidget>` | `agenda?: AgendaItem[]`, `style?: CSSProperties` |
| `<TranscriptView>` | `entries: TranscriptEntry[]`, `maxHeight?: number` |
| `<EmotionDonut>` | `segments: { key; value }[]`, `size?: number` |
| `<InlineProfileChart>` | `profile: BehavioralProfile`, `size?: number` |
| `<AgendaTracker>` | `items: AgendaItem[]`, `compact?: boolean` |
| `<ProfileBadge>` | `profile: BehavioralProfile`, `label: string` |
| `<SessionControls>` | `isCapturing`, `onStart`, `onStop` |

### Server Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/live-assist/process/stream` | SSE streaming feedback |
| POST | `/live-assist/session/start` | Create session |
| POST | `/live-assist/session/end` | End session |
| GET | `/live-assist/sessions` | List sessions |
| GET | `/health` | Health check |

## Configuration

### `LiveAssistConfig`

```ts
{
  asrUrl: string;          // WebSocket URL for ASR server
  agentUrl: string;        // HTTP URL for agent server
  backendUrl?: string;     // Optional external backend
  deviceId?: string;       // Auto-generated if omitted
  llmApiKey?: string;      // LLM API key
  llmProvider?: "gemini" | "anthropic" | "local";
  audioWorkletUrl?: string; // Path to audio-capture-processor.js
}
```

### Environment Variables (Server)

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `gemini` | LLM backend: gemini, anthropic, local |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `LOCAL_LLM_URL` | — | Local LLM endpoint URL |
| `DB_PATH` | `./data/live_assist.db` | SQLite database path |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Sentence transformer model |
| `CORS_ORIGINS` | `*` | Allowed CORS origins |
| `PORT` | `8765` | Server port |

## CSS Theming

Override CSS variables to match your brand:

```css
:root {
  --la-primary: #124e3f;
  --la-bg: #ffffff;
  --la-text: #1a1a1a;
  --la-border: #e5e7eb;
  --la-radius: 12px;
}
```

## Development

```bash
# Build all packages
npm run build

# Build individual packages
cd packages/core && npm run build
cd packages/react && npm run build

# Run the server locally
cd packages/server
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8765
```

## Building & Pushing (Maintainers)

To build the unified image from source (requires ASR models at `models/asr_onnx_export/`):

```bash
# From live_assist repo root
cd /path/to/live_assist
docker compose -f live_assist_js_sdk/docker/docker-compose.build.yml build
```

To push to Docker Hub:

```bash
docker tag whissleasr/live-assist:latest whissleasr/live-assist:latest
docker push whissleasr/live-assist:latest
```

Or use the build script:

```bash
./live_assist_js_sdk/scripts/build-and-push.sh
```

## Directory Structure

```
live_assist_js_sdk/
├── packages/
│   ├── core/            # Headless JS library
│   ├── react/           # React UI components
│   └── server/          # Python FastAPI agent
├── docker/              # Docker images
├── examples/            # Integration demos
├── public/              # AudioWorklet
├── package.json         # Workspace root
└── tsconfig.base.json
```

## License

Proprietary — Whissle Inc.
