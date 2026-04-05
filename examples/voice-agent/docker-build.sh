#!/usr/bin/env bash
# Build Whissle Studio image with current packages/core + voice-agent.
# Usage (from anywhere):
#   ./docker-build.sh -t "${IMAGE}:${TAG}" --build-arg VITE_GATEWAY_URL=https://api.whissle.ai ...
# Extra args are forwarded to docker build.

set -euo pipefail
SDK_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec docker build --platform linux/amd64 \
  -f "${SDK_ROOT}/examples/voice-agent/Dockerfile" \
  "$@" \
  "${SDK_ROOT}"
