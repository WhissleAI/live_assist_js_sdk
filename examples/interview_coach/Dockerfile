## Context MUST be live_assist_js_sdk (the folder that contains packages/ and examples/).
##
## Build:
##   docker build --platform linux/amd64 \
##     -f examples/interview_coach/Dockerfile \
##     --build-arg VITE_GATEWAY_URL=https://api.whissle.ai \
##     --build-arg VITE_CARTESIA_API_KEY=sk_car_... \
##     -t interview-coach:latest .
##
## Run locally:
##   docker run -p 8080:8080 interview-coach:latest

FROM node:20-slim AS builder

ARG VITE_GATEWAY_URL=https://api.whissle.ai
ARG VITE_CARTESIA_API_KEY

WORKDIR /app

# Core tsconfig extends ../../tsconfig.base.json
COPY tsconfig.base.json ./

# 1) Build @whissle/live-assist-core (interview_coach depends on it)
COPY packages/core ./packages/core
RUN cd packages/core && npm install && npm run build

# 2) Build interview_coach SPA
WORKDIR /app/examples/interview_coach
COPY examples/interview_coach/package.json examples/interview_coach/package-lock.json ./
RUN npm ci
COPY examples/interview_coach/ ./
RUN VITE_GATEWAY_URL=${VITE_GATEWAY_URL} VITE_CARTESIA_API_KEY=${VITE_CARTESIA_API_KEY} npm run build

## Stage 2: Serve with nginx
FROM nginx:1.27-alpine
COPY examples/interview_coach/nginx.conf /etc/nginx/conf.d/default.conf
# Add .mjs MIME type (not in nginx defaults — pdfjs worker needs it)
RUN sed -i '/application\/javascript/s/;/ mjs;/' /etc/nginx/mime.types
COPY --from=builder /app/examples/interview_coach/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
