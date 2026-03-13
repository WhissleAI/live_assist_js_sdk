#!/bin/bash
# Build Live Assist JS-SDK Docker images
# No cloud required except GEMINI_API_KEY for LLM feedback.
#
# Usage:
#   ./scripts/build-docker.sh              # Build all (uses default model paths)
#   MODEL_DIR=... LM_DIR=... ./scripts/build-docker.sh   # Custom model paths
#
# Default paths (from live_assist root):
#   MODEL_DIR=models/asr_onnx_export
#   LM_DIR=decoder_onnx/model/kenlm

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_DIR="$(dirname "$SCRIPT_DIR")"
LIVE_ASSIST_ROOT="$(dirname "$SDK_DIR")"

cd "$LIVE_ASSIST_ROOT"

MODEL_DIR="${MODEL_DIR:-$LIVE_ASSIST_ROOT/models/asr_onnx_export}"
LM_DIR="${LM_DIR:-$LIVE_ASSIST_ROOT/decoder_onnx/model/kenlm}"

echo "=============================================="
echo "  Live Assist JS-SDK — Docker Build"
echo "=============================================="
echo ""
echo "  MODEL_DIR: $MODEL_DIR"
echo "  LM_DIR:    $LM_DIR"
echo ""

# Validate model paths
if [ ! -f "$MODEL_DIR/model.onnx" ]; then
    echo "❌ ASR model not found at $MODEL_DIR/model.onnx"
    echo "   Set MODEL_DIR to the directory containing model.onnx, config.json, vocabulary.json"
    exit 1
fi
echo "✅ ASR model found"

if [ ! -d "$LM_DIR" ] || [ -z "$(ls -A "$LM_DIR"/*.bin 2>/dev/null)" ]; then
    echo "⚠️  KenLM models not found at $LM_DIR — beam search will run without LM"
    echo "   Build with: python decoder_onnx/scripts/build_kenlm.py --output-dir $LM_DIR"
    HAS_LM=false
else
    echo "✅ KenLM models found"
    HAS_LM=true
fi
echo ""

# Prepare ASR build context (avoids root .dockerignore excluding decoder_onnx/models)
echo "Preparing ASR build context..."
BUILD_DIR=$(mktemp -d)
trap "rm -rf $BUILD_DIR" EXIT

cp -r decoder_onnx/src "$BUILD_DIR/src"
cp decoder_onnx/requirements.txt "$BUILD_DIR/"
mkdir -p "$BUILD_DIR/model"
cp "$MODEL_DIR"/*.onnx "$BUILD_DIR/model/" 2>/dev/null || true
cp "$MODEL_DIR"/*.onnx.data "$BUILD_DIR/model/" 2>/dev/null || true
cp "$MODEL_DIR"/*.json "$BUILD_DIR/model/"
cp "$MODEL_DIR"/tokenizer_*.model "$BUILD_DIR/model/" 2>/dev/null || true
mkdir -p "$BUILD_DIR/model/kenlm"
if [ "$HAS_LM" = true ]; then
    cp "$LM_DIR"/*.bin "$BUILD_DIR/model/kenlm/" 2>/dev/null || true
    cp "$LM_DIR"/*.unigrams.txt "$BUILD_DIR/model/kenlm/" 2>/dev/null || true
fi

echo "Building ASR image (whissleasr/live-assist-asr)..."
docker build -f live_assist_js_sdk/docker/Dockerfile.asr.standalone \
    -t whissleasr/live-assist-asr:latest \
    "$BUILD_DIR"

echo ""
echo "Building SDK image (whissleasr/live-assist-sdk)..."
docker build -f live_assist_js_sdk/docker/Dockerfile.sdk \
    -t whissleasr/live-assist-sdk:latest \
    live_assist_js_sdk

echo ""
echo "=============================================="
echo "  Build complete"
echo "=============================================="
echo ""
echo "To run:"
echo "  export GEMINI_API_KEY=your_key"
echo "  docker compose -f live_assist_js_sdk/docker/docker-compose.yml up -d"
echo ""
echo "To test:"
echo "  curl http://localhost:8001/          # ASR health"
echo "  curl http://localhost:8765/health    # Agent health"
echo ""
