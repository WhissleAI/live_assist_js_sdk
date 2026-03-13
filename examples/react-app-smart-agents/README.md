# Live Assist — Smart Agents Example

Choose an agent to tailor real-time feedback for your conversation:

- **General Assistant** — Default feedback, action items, agenda tracking
- **Commitment Tracker** — Surfaces who said what and when
- **Discovery Coach** — Sales discovery gaps and next questions
- **Interview Coach** — Interview dynamics and balance
- **Silent Partner** — Minimal one-line nudges

## Setup

```bash
# Start the backend (Docker with ASR + Agent)
cd ../../docker
docker compose -f docker-compose.unified.yml up -d

# Or use the install script from repo root
# export GEMINI_API_KEY=xxx && curl -fsSL .../install.sh | bash

# Install and run
npm install
npm run dev
```

Open http://localhost:5173. Select an agent, then start a session.
