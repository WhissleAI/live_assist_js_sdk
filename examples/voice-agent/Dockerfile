# Voice Agent — standalone lightweight container
# Builds the Vite app and serves it with nginx.
#
# Build (from live_assist_js_sdk root):
#   docker build -f examples/voice-agent/Dockerfile -t voice-agent .
#
# Run (alongside the existing whissle container for ASR):
#   docker run -d -p 5174:80 --name voice-agent voice-agent

# ── Stage 1: Build ──
FROM node:20-slim AS builder
WORKDIR /build
COPY tsconfig.base.json tsconfig.base.json
COPY packages/core packages/core
COPY examples/voice-agent examples/voice-agent
COPY public public
WORKDIR /build/examples/voice-agent
RUN npm install && npx vite build

# ── Stage 2: Serve with nginx ──
FROM nginx:alpine
COPY --from=builder /build/examples/voice-agent/dist /usr/share/nginx/html
COPY examples/voice-agent/public/audio-capture-processor.js /usr/share/nginx/html/audio-capture-processor.js

# SPA fallback: serve index.html for all non-file routes
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|mjs)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
