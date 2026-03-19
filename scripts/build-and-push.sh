#!/usr/bin/env bash
# =============================================================================
# Build and push Live Assist unified images to Docker Hub
#
# Builds three images sequentially:
#   whissleasr/live-assist:latest-amd64  — CPU (Intel/AMD Mac, Linux servers)
#   whissleasr/live-assist:latest-arm64  — CPU (Apple Silicon Mac, ARM Linux)
#   whissleasr/live-assist:latest-gpu    — GPU (NVIDIA CUDA, amd64)
#
# Then creates manifest:
#   whissleasr/live-assist:latest  — auto-selects amd64 or arm64 by platform
#
# Prerequisites:
#   - ASR models at models/asr_onnx_export/ (model.onnx, config.json, etc.)
#   - docker login (for push)
#   - buildx (for arm64 cross-build on amd64 host): docker buildx create --use
#
# Usage (from live_assist repo root):
#   ./live_assist_js_sdk/scripts/build-and-push.sh
#   ./live_assist_js_sdk/scripts/build-and-push.sh --no-push      # build only
#   ./live_assist_js_sdk/scripts/build-and-push.sh --gpu-only      # build GPU only
#   ./live_assist_js_sdk/scripts/build-and-push.sh --amd64-only   # build amd64 + manifest (arm64 already pushed)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_DIR="$(dirname "$SCRIPT_DIR")"
LIVE_ASSIST_ROOT="$(cd "$SDK_DIR/.." && pwd)"

PUSH=true
GPU_ONLY=false
AMD64_ONLY=false
ARM64_ONLY=false
CPU_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --no-push)    PUSH=false ;;
    --gpu-only)   GPU_ONLY=true ;;
    --amd64-only) AMD64_ONLY=true ;;
    --arm64-only) ARM64_ONLY=true ;;
    --cpu-only)   CPU_ONLY=true ;;
  esac
done

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
echo "  Live Assist — Build & Push (sequential)"
echo "=============================================="
echo "  cpu-amd64  → whissleasr/live-assist:latest-amd64"
echo "  cpu-arm64  → whissleasr/live-assist:latest-arm64"
echo "  gpu        → whissleasr/live-assist:latest-gpu"
echo "  manifest   → whissleasr/live-assist:latest (amd64 + arm64)"
echo "=============================================="
echo ""

# Ensure buildx for arm64 cross-build (needed on amd64 host)
if [ "$PUSH" = true ]; then
  BUILDX_DRIVER=$(docker buildx inspect 2>/dev/null | grep "Driver:" | awk '{print $2}')
  if [[ "$BUILDX_DRIVER" == "docker" ]]; then
    echo "Creating buildx builder for arm64 cross-build..."
    if docker buildx inspect live-assist-builder >/dev/null 2>&1; then
      docker buildx use live-assist-builder
    else
      docker buildx create --use --name live-assist-builder
    fi
    echo ""
  fi
fi

# Prepare build context
BUILD_DIR=$(mktemp -d)
trap "rm -rf $BUILD_DIR" EXIT

echo "Preparing build context..."
cp -r decoder_onnx "$BUILD_DIR/"
mkdir -p "$BUILD_DIR/models" "$BUILD_DIR/decoder_onnx/model/kenlm"
cp -r models/asr_onnx_export "$BUILD_DIR/models/"
cp -r live_assist_js_sdk "$BUILD_DIR/"
cat > "$BUILD_DIR/.dockerignore" << 'IGNORE'
**/node_modules
**/__pycache__
**/.git
**/dist
IGNORE

DOCKERFILE_CPU="$BUILD_DIR/live_assist_js_sdk/docker/Dockerfile.unified"
DOCKERFILE_GPU="$BUILD_DIR/live_assist_js_sdk/docker/Dockerfile.unified.gpu"

# ── Build all three sequentially (or single target) ──
echo ""
if [ "$GPU_ONLY" = true ]; then
  echo ">>> Building gpu only..."
elif [ "$AMD64_ONLY" = true ]; then
  echo ">>> Building cpu-amd64 only (+ manifest for auto-select)..."
elif [ "$ARM64_ONLY" = true ]; then
  echo ">>> Building cpu-arm64 only (+ manifest for auto-select)..."
elif [ "$CPU_ONLY" = true ]; then
  echo ">>> Building cpu-amd64 + cpu-arm64 (skip GPU)..."
else
  echo ">>> Building cpu-amd64, cpu-arm64, gpu (one by one)..."
fi
echo ""

build_cpu_amd64() {
  if [ "$PUSH" = true ]; then
    docker buildx build --platform linux/amd64 \
      -f "$DOCKERFILE_CPU" \
      -t whissleasr/live-assist:latest-amd64 \
      --push \
      "$BUILD_DIR"
  else
    docker build -f "$DOCKERFILE_CPU" -t whissleasr/live-assist:latest-amd64 "$BUILD_DIR"
  fi
  echo "[cpu-amd64] done"
}

build_cpu_arm64() {
  if [ "$PUSH" = true ]; then
    docker buildx build --platform linux/arm64 \
      -f "$DOCKERFILE_CPU" \
      -t whissleasr/live-assist:latest-arm64 \
      --push \
      "$BUILD_DIR"
  else
    # On Apple Silicon, arm64 is native — use plain docker build.
    # On amd64 hosts, this will still build via QEMU emulation.
    docker build -f "$DOCKERFILE_CPU" -t whissleasr/live-assist:latest-arm64 "$BUILD_DIR"
  fi
  echo "[cpu-arm64] done"
}

build_gpu() {
  # GPU image is amd64-only (NVIDIA CUDA). Always use --platform linux/amd64
  # to avoid building arm64 variant (sbsa/ubuntu-ports) which has GPG/apt issues.
  if [ "$PUSH" = true ]; then
    docker buildx build --platform linux/amd64 \
      -f "$DOCKERFILE_GPU" \
      -t whissleasr/live-assist:latest-gpu \
      --push \
      "$BUILD_DIR"
  else
    docker buildx build --platform linux/amd64 \
      -f "$DOCKERFILE_GPU" \
      -t whissleasr/live-assist:latest-gpu \
      --load \
      "$BUILD_DIR"
  fi
  echo "[gpu] done"
}

# Run sequentially (or single target)
if [ "$GPU_ONLY" = true ]; then
  build_gpu
elif [ "$AMD64_ONLY" = true ]; then
  build_cpu_amd64
elif [ "$ARM64_ONLY" = true ]; then
  build_cpu_arm64
elif [ "$CPU_ONLY" = true ]; then
  build_cpu_amd64
  build_cpu_arm64
else
  build_cpu_amd64
  build_cpu_arm64
  build_gpu
fi

# ── Create latest manifest (amd64 + arm64) for auto-selection ──
if [ "$PUSH" = true ] && [ "$GPU_ONLY" = false ] && [ "$ARM64_ONLY" = false ]; then
  echo ""
  echo ">>> Creating latest manifest (amd64 + arm64)..."
  docker buildx imagetools create -t whissleasr/live-assist:latest \
    whissleasr/live-assist:latest-amd64 \
    whissleasr/live-assist:latest-arm64
  echo "[manifest] latest created"
fi

if [ "$PUSH" = true ]; then
  echo ""
  echo "✅ Done. Users can run:"
  echo "   # CPU (auto-selects amd64/arm64):"
  echo "   docker pull whissleasr/live-assist:latest"
  echo "   docker run -d -p 8001:8001 -p 8765:8765 -e GEMINI_API_KEY=xxx whissleasr/live-assist:latest"
  echo ""
  echo "   # Or pull specific arch:"
  echo "   docker pull whissleasr/live-assist:latest-amd64   # Intel Mac, Linux x86"
  echo "   docker pull whissleasr/live-assist:latest-arm64   # Apple Silicon, ARM Linux"
  echo ""
  echo "   # GPU (faster ASR):"
  echo "   docker pull whissleasr/live-assist:latest-gpu"
  echo "   docker run -d --gpus all -p 8001:8001 -p 8765:8765 -e GEMINI_API_KEY=xxx whissleasr/live-assist:latest-gpu"
else
  echo ""
  echo "✅ Build complete (skipped push). Run without --no-push to push."
fi
echo ""
