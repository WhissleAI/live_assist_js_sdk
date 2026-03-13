#!/usr/bin/env bash
# =============================================================================
# Build and push Live Assist unified image to Docker Hub
#
# Prerequisites:
#   - ASR models at models/asr_onnx_export/ (model.onnx, config.json, etc.)
#   - docker login (for push)
#
# Usage (from live_assist repo root):
#   ./live_assist_js_sdk/scripts/build-and-push.sh
#   ./live_assist_js_sdk/scripts/build-and-push.sh --no-push   # build only
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_DIR="$(dirname "$SCRIPT_DIR")"
LIVE_ASSIST_ROOT="$(cd "$SDK_DIR/.." && pwd)"

PUSH=true
if [[ "${1:-}" == "--no-push" ]]; then
  PUSH=false
fi

cd "$LIVE_ASSIST_ROOT"

# Pre-flight checks
echo "Checking prerequisites..."
echo ""

# ASR ONNX model (required)
if [ ! -f "models/asr_onnx_export/model.onnx" ]; then
  echo "❌ ASR ONNX model not found at models/asr_onnx_export/model.onnx"
  echo "   Ensure the repo includes ASR models before building."
  exit 1
fi
if [ ! -f "models/asr_onnx_export/config.json" ] || [ ! -f "models/asr_onnx_export/vocabulary.json" ]; then
  echo "❌ ASR model incomplete: config.json and vocabulary.json required"
  exit 1
fi
echo "✅ ASR ONNX model found (models/asr_onnx_export)"

# KenLM (optional but recommended)
if [ -d "decoder_onnx/model/kenlm" ] && [ -n "$(ls -A decoder_onnx/model/kenlm/*.bin 2>/dev/null)" ]; then
  echo "✅ KenLM models found (decoder_onnx/model/kenlm)"
else
  echo "⚠️  KenLM not found — ASR will run without LM (lower accuracy). Build with:"
  echo "   python decoder_onnx/scripts/build_kenlm.py --output-dir decoder_onnx/model/kenlm"
fi

# Agent server
if [ ! -f "live_assist_js_sdk/packages/server/requirements.txt" ]; then
  echo "❌ Agent server not found (live_assist_js_sdk/packages/server)"
  exit 1
fi
echo "✅ Agent server found"

# Docker
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker daemon not running. Start Docker and try again."
  exit 1
fi
echo "✅ Docker ready"
echo ""

echo "=============================================="
echo "  Live Assist — Build & Push"
echo "=============================================="
echo "  Image: whissleasr/live-assist:latest"
echo "=============================================="
echo ""

# Prepare build context (root .dockerignore excludes decoder_onnx/models)
BUILD_DIR=$(mktemp -d)
trap "rm -rf $BUILD_DIR" EXIT

echo "Preparing build context..."
cp -r decoder_onnx "$BUILD_DIR/"
mkdir -p "$BUILD_DIR/models" "$BUILD_DIR/decoder_onnx/model/kenlm"
cp -r models/asr_onnx_export "$BUILD_DIR/models/"
# KenLM is included via decoder_onnx copy above; mkdir ensures path exists if not present
cp -r live_assist_js_sdk "$BUILD_DIR/"
# Minimal .dockerignore for this build
cat > "$BUILD_DIR/.dockerignore" << 'IGNORE'
**/node_modules
**/__pycache__
**/.git
**/dist
IGNORE

docker build -f "$BUILD_DIR/live_assist_js_sdk/docker/Dockerfile.unified" \
  -t whissleasr/live-assist:latest \
  "$BUILD_DIR"

if [ "$PUSH" = true ]; then
  echo ""
  echo "Pushing to Docker Hub..."
  docker push whissleasr/live-assist:latest
  echo ""
  echo "✅ Done. Users can run:"
  echo "   docker pull whissleasr/live-assist:latest"
  echo "   docker run -d -p 8001:8001 -p 8765:8765 -e GEMINI_API_KEY=xxx whissleasr/live-assist:latest"
else
  echo ""
  echo "✅ Build complete (skipped push). Run without --no-push to push."
fi
echo ""
