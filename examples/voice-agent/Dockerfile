## Context MUST be live_assist_js_sdk (the folder that contains packages/ and examples/).
##
## Option A — cwd = live_assist_js_sdk:
##   docker build --platform linux/amd64 -f examples/voice-agent/Dockerfile -t whissle-studio:local .
##
## Option B — cwd = examples/voice-agent (this folder):
##   docker build --platform linux/amd64 -f Dockerfile -t whissle-studio:local ../..
##
## Wrong (your shell was here): using -f examples/voice-agent/Dockerfile with context "."
## → fails: no "examples" path, and COPY packages/core would be wrong.

FROM node:20-slim AS builder

ARG VITE_GATEWAY_URL=https://api.whissle.ai
ARG VITE_CARTESIA_API_KEY
ARG VITE_CARTESIA_VOICE_ID
ARG VITE_CARTESIA_MODEL_ID
ARG VITE_APP_TITLE="Whissle Studio"

WORKDIR /app

# Core tsconfig extends ../../tsconfig.base.json → /app/tsconfig.base.json
COPY tsconfig.base.json ./

# 1) @whissle/live-assist-core (must have dist/ before voice-agent npm ci)
COPY packages/core ./packages/core
RUN cd packages/core && npm install && npm run build

# 2) voice-agent SPA (lockfile expects ../../packages/core → /app/packages/core)
WORKDIR /app/examples/voice-agent
COPY examples/voice-agent/package.json examples/voice-agent/package-lock.json ./
COPY examples/voice-agent/ ./
RUN VITE_GATEWAY_URL=${VITE_GATEWAY_URL} \
    VITE_CARTESIA_API_KEY=${VITE_CARTESIA_API_KEY} \
    VITE_CARTESIA_VOICE_ID=${VITE_CARTESIA_VOICE_ID} \
    VITE_CARTESIA_MODEL_ID=${VITE_CARTESIA_MODEL_ID} \
    VITE_APP_TITLE=${VITE_APP_TITLE} \
    npm ci && npm run build

## Stage 2: Serve with nginx
FROM nginx:1.27-alpine
COPY examples/voice-agent/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/examples/voice-agent/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
