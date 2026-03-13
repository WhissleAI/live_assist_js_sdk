# Live Assist JS-SDK — Build and Test

**No cloud required** except `GEMINI_API_KEY` for LLM feedback. Everything else runs locally.

## Prerequisites

- Docker and Docker Compose
- ASR models at `models/asr_onnx_export/` (model.onnx, config.json, vocabulary.json, tokenizer_*.model)
- KenLM models at `decoder_onnx/model/kenlm/` (ENGLISH.bin, etc.) — optional but recommended
- Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

## Model Paths

Default paths (from `live_assist` repo root):

```
MODEL_DIR=/Users/karan/Desktop/work/whissle/live_assist/models/asr_onnx_export
LM_DIR=/Users/karan/Desktop/work/whissle/live_assist/decoder_onnx/model/kenlm
```

## Build

From the **live_assist** repo root:

```bash
# Build ASR + SDK images (uses default model paths)
./live_assist_js_sdk/scripts/build-docker.sh

# Or with custom model paths
MODEL_DIR=/path/to/asr_onnx_export LM_DIR=/path/to/kenlm \
  ./live_assist_js_sdk/scripts/build-docker.sh
```

This builds:

- `whissleasr/live-assist-asr:latest` — ASR server with models baked in
- `whissleasr/live-assist-sdk:latest` — Agent server (Python FastAPI)

## Run

```bash
# Set your Gemini API key (required for AI feedback)
export GEMINI_API_KEY=your_key_here

# Start both services
cd /path/to/live_assist
docker compose -f live_assist_js_sdk/docker/docker-compose.yml up -d

# Or with custom model paths (for compose build)
MODEL_DIR=models/asr_onnx_export LM_DIR=decoder_onnx/model/kenlm \
  GEMINI_API_KEY=your_key \
  docker compose -f live_assist_js_sdk/docker/docker-compose.yml up -d
```

## Test

```bash
# ASR health
curl http://localhost:8001/

# Agent health
curl http://localhost:8765/health

# ASR streaming (WebSocket) — use a WebSocket client or the example app
# ws://localhost:8001/asr/stream
```

## Integrate in Your App

1. **React**: Use `@whissle/live-assist-react` with config:
   ```ts
   { asrUrl: "ws://localhost:8001/asr/stream", agentUrl: "http://localhost:8765" }
   ```

2. **Vanilla JS**: Use `@whissle/live-assist-core` and connect to the same URLs.

3. Ensure your frontend is served from a host that can reach `localhost:8001` and `localhost:8765` (or use your server's hostname in production).

## Push to Docker Hub

```bash
# Log in
docker login

# Tag for your registry
docker tag whissleasr/live-assist-asr:latest youruser/live-assist-asr:latest
docker tag whissleasr/live-assist-sdk:latest youruser/live-assist-sdk:latest

# Push
docker push youruser/live-assist-asr:latest
docker push youruser/live-assist-sdk:latest
```

Then update `docker-compose.yml` to use your registry:

```yaml
services:
  asr:
    image: youruser/live-assist-asr:latest
    # build: ...  # remove build section when using pre-built image
```
