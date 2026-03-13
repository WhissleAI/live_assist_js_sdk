#!/usr/bin/env bash
# =============================================================================
# Live Assist — One-command installer
#
# Pulls the pre-built Docker image (ASR + models + agent) and runs it.
# You only need to provide your Gemini or Claude API key.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash
#   GEMINI_API_KEY=your_key curl -fsSL .../install.sh | bash
#   ANTHROPIC_API_KEY=your_key LLM_PROVIDER=anthropic curl -fsSL .../install.sh | bash
# =============================================================================

set -euo pipefail

INSTALL_DIR="${LIVE_ASSIST_DIR:-$HOME/live-assist}"
IMAGE="${LIVE_ASSIST_IMAGE:-whissleasr/live-assist:latest}"

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

# ---- Create install dir ----

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# ---- Write .env ----

cat > .env << EOF
# Live Assist — API keys (set at least one)
GEMINI_API_KEY=${GEMINI_KEY}
ANTHROPIC_API_KEY=${CLAUDE_KEY}
LLM_PROVIDER=${PROVIDER}
EOF

ok "Configuration saved to $INSTALL_DIR/.env"

# ---- Compose file ----

COMPOSE_FILE="docker-compose.yml"
cat > "$COMPOSE_FILE" << 'COMPOSE'
services:
  live-assist:
    image: whissleasr/live-assist:latest
    container_name: live-assist
    ports:
      - "8001:8001"
      - "8765:8765"
    env_file: .env
    environment:
      - LLM_PROVIDER=${LLM_PROVIDER:-gemini}
      - GEMINI_API_KEY=${GEMINI_API_KEY:-}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
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

# ---- Pull and start ----

info "Pulling Live Assist image (ASR + models + agent)..."
docker compose -f "$COMPOSE_FILE" pull

info "Starting Live Assist..."
docker compose -f "$COMPOSE_FILE" up -d

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║          Live Assist is running!                        ║${NC}"
echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}${BOLD}║                                                          ║${NC}"
echo -e "${GREEN}${BOLD}║  ASR:   ${NC}ws://localhost:8001/asr/stream${NC}"
echo -e "${GREEN}${BOLD}║  Agent: ${NC}http://localhost:8765${NC}"
echo -e "${GREEN}${BOLD}║                                                          ║${NC}"
echo -e "${GREEN}${BOLD}║  Health: ${NC}curl http://localhost:8001/ && curl http://localhost:8765/health${NC}"
echo -e "${GREEN}${BOLD}║  Logs:   ${NC}docker logs -f live-assist${NC}"
echo -e "${GREEN}${BOLD}║  Stop:   ${NC}cd $INSTALL_DIR && docker compose down${NC}"
echo -e "${GREEN}${BOLD}║                                                          ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
info "First start may take ~2 minutes while ASR loads models."
info "Integrate in your app: asrUrl: 'ws://localhost:8001/asr/stream', agentUrl: 'http://localhost:8765'"
echo ""
