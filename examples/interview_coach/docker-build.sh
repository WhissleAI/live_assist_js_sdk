#!/usr/bin/env bash
# Build Interview Coach image with current packages/core + interview_coach.
# Usage (from anywhere):
#   ./docker-build.sh -t "${IMAGE}:${TAG}" --build-arg VITE_GATEWAY_URL=https://api.whissle.ai
# Extra args are forwarded to docker build.

set -euo pipefail
SDK_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec docker build --platform linux/amd64 \
  -f "${SDK_ROOT}/examples/interview_coach/Dockerfile" \
  "$@" \
  "${SDK_ROOT}"
