#!/usr/bin/env bash
# =============================================================================
# Live Assist — One-command installer
#
# Pulls the pre-built Docker image (ASR + models + agent) and runs it.
# Detects platform (amd64/arm64/GPU) and pulls the right image.
# Installs live-assist CLI for bash usage.
#
# Usage:
#   export GEMINI_API_KEY=your_key
#   curl -fsSL https://raw.githubusercontent.com/WhissleAI/live_assist_js_sdk/main/install.sh | bash
#
# Or one-liner: GEMINI_API_KEY=your_key bash -c 'curl -fsSL .../install.sh | bash'
# =============================================================================

set -euo pipefail

INSTALL_DIR="${LIVE_ASSIST_DIR:-$HOME/live-assist}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[live-assist]${NC} $*"; }
ok()    { echo -e "${GREEN}[live-assist]${NC} $*"; }
warn()  { echo -e "${YELLOW}[live-assist]${NC} $*"; }
fail()  { echo -e "${RED}[live-assist]${NC} $*"; exit 1; }

# ---- Platform detection ----
detect_image() {
  local arch
  case "$(uname -m)" in
    x86_64|amd64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) arch="amd64" ;;
  esac

  if [ "$(uname -s)" = "Linux" ] && command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
    echo "whissleasr/live-assist:latest-gpu"
  else
    echo "whissleasr/live-assist:latest-${arch}"
  fi
}

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║          Live Assist — Installer                         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ---- Pre-flight ----

command -v docker >/dev/null 2>&1 || fail "Docker is required. Install Docker Desktop or Docker Engine."

if ! docker info >/dev/null 2>&1; then
  fail "Docker daemon is not running. Start Docker and try again."
fi

# ---- API key ----

GEMINI_KEY="${GEMINI_API_KEY:-}"
CLAUDE_KEY="${ANTHROPIC_API_KEY:-}"
PROVIDER="${LLM_PROVIDER:-gemini}"

if [ -z "$GEMINI_KEY" ] && [ -z "$CLAUDE_KEY" ]; then
  echo -e "${BOLD}┌─────────────────────────────────────────────────────────┐${NC}"
  echo -e "${BOLD}│  ${YELLOW}API key required${NC}${BOLD} — Live Assist uses Gemini or Claude for AI feedback  │${NC}"
  echo -e "${BOLD}│                                                         │${NC}"
  echo -e "${BOLD}│${NC}  ${BOLD}1)${NC} Gemini ${GREEN}(recommended, free tier)${NC} — https://aistudio.google.com/apikey  ${BOLD}│${NC}"
  echo -e "${BOLD}│${NC}  ${BOLD}2)${NC} Claude — https://console.anthropic.com                              ${BOLD}│${NC}"
  echo -e "${BOLD}└─────────────────────────────────────────────────────────┘${NC}"
  echo ""
  if [ -t 0 ]; then
    read -rp "$(echo -e "${CYAN}Paste your Gemini API key (or Claude key with LLM_PROVIDER=anthropic): ${NC}")" API_KEY
    if [ -n "$API_KEY" ]; then
      if [ "$PROVIDER" = "anthropic" ]; then
        CLAUDE_KEY="$API_KEY"
      else
        GEMINI_KEY="$API_KEY"
      fi
    fi
  fi
  if [ -z "$GEMINI_KEY" ] && [ -z "$CLAUDE_KEY" ]; then
    fail "No API key provided. Set GEMINI_API_KEY or ANTHROPIC_API_KEY and try again."
  fi
fi

# ---- Detect image ----

IMAGE=$(detect_image)
info "Detected platform: $IMAGE"

# ---- Create install dir ----

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# ---- Write .env ----

cat > .env << EOF
# Live Assist — API keys (set at least one)
GEMINI_API_KEY=${GEMINI_KEY}
ANTHROPIC_API_KEY=${CLAUDE_KEY}
LLM_PROVIDER=${PROVIDER}
RIME_API_KEY=${RIME_API_KEY:-}
EOF

ok "Configuration saved to $INSTALL_DIR/.env"

# ---- Compose file ----

COMPOSE_FILE="docker-compose.yml"
cat > "$COMPOSE_FILE" << COMPOSE
services:
  live-assist:
    image: ${IMAGE}
    container_name: live-assist
    ports:
      - "8001:8001"
      - "8765:8765"
      - "5174:5174"
    env_file: .env
    environment:
      - LLM_PROVIDER=\${LLM_PROVIDER:-gemini}
      - GEMINI_API_KEY=\${GEMINI_API_KEY:-}
      - ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY:-}
      - RIME_API_KEY=\${RIME_API_KEY:-}
      - DB_PATH=/app/data/live_assist.db
      - SESSIONS_DIR=/app/data/sessions
    volumes:
      - live-assist-data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8001/ && curl -f http://localhost:8765/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 90s

volumes:
  live-assist-data:
COMPOSE

# ---- Install CLI ----

BIN_DIR="$INSTALL_DIR/bin"
mkdir -p "$BIN_DIR"

# Get CLI: from local repo (when run as ./install.sh) or fetch from GitHub
CLI_SRC=""
if [[ "${BASH_SOURCE[0]:-$0}" == /* ]] && [[ -f "${BASH_SOURCE[0]:-$0}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
  [ -f "$SCRIPT_DIR/bin/live-assist" ] && CLI_SRC="$SCRIPT_DIR/bin/live-assist"
fi
if [ -n "$CLI_SRC" ]; then
  cp "$CLI_SRC" "$BIN_DIR/live-assist"
elif command -v curl >/dev/null 2>&1; then
  curl -sfL "https://raw.githubusercontent.com/WhissleAI/live_assist_js_sdk/main/bin/live-assist" -o "$BIN_DIR/live-assist" 2>/dev/null || true
fi

if [ -f "$BIN_DIR/live-assist" ]; then
  chmod +x "$BIN_DIR/live-assist"
  # Add to PATH if not already
  if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo "" >> "$HOME/.bashrc" 2>/dev/null || true
    echo "# Live Assist CLI" >> "$HOME/.bashrc" 2>/dev/null || true
    echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$HOME/.bashrc" 2>/dev/null || true
    if [ -f "$HOME/.zshrc" ] && [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
      echo "" >> "$HOME/.zshrc" 2>/dev/null || true
      echo "# Live Assist CLI" >> "$HOME/.zshrc" 2>/dev/null || true
      echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$HOME/.zshrc" 2>/dev/null || true
    fi
    ok "CLI installed to $BIN_DIR (added to PATH in .bashrc/.zshrc)"
  else
    ok "CLI installed to $BIN_DIR"
  fi
  info "Run: live-assist help"
fi

# ---- Pull and start ----

info "Pulling Live Assist image ($IMAGE)..."
docker compose -f "$COMPOSE_FILE" pull

info "Starting Live Assist..."
docker compose -f "$COMPOSE_FILE" up -d

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║          Live Assist is running!                        ║${NC}"
echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}${BOLD}║                                                          ║${NC}"
echo -e "${GREEN}${BOLD}║  Timeline Demo:  ${NC}http://localhost:8765${NC}"
echo -e "${GREEN}${BOLD}║  Voice Agent:    ${NC}http://localhost:5174${NC}"
echo -e "${GREEN}${BOLD}║  ASR WebSocket:  ${NC}ws://localhost:8001/asr/stream${NC}"
echo -e "${GREEN}${BOLD}║  Agent API:      ${NC}http://localhost:8765/health${NC}"
echo -e "${GREEN}${BOLD}║                                                          ║${NC}"
echo -e "${GREEN}${BOLD}║  CLI:   ${NC}live-assist start|stop|status|feedback|agents${NC}"
echo -e "${GREEN}${BOLD}║  Logs:  ${NC}docker logs -f live-assist${NC}"
echo -e "${GREEN}${BOLD}║  Stop:  ${NC}cd $INSTALL_DIR && docker compose down${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
info "First start may take ~2 minutes while ASR loads models."
info "Open ${BOLD}http://localhost:8765${NC} for the timeline demo or ${BOLD}http://localhost:5174${NC} for the voice agent."
info "Get feedback from bash: echo \"Meeting notes...\" | live-assist feedback"
info "Anonymous install telemetry sent to whissle.ai (opt out: set WHISSLE_TRACKER_URL='' in .env)"
echo ""
