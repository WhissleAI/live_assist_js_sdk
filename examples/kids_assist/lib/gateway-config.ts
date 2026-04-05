/**
 * Centralized gateway configuration for kids_assist.
 *
 * In production, all requests go directly to api.whissle.ai.
 * In dev, Vite proxies /asr, /agent, /tts to localhost:9000 (gateway).
 *
 * Set VITE_GATEWAY_URL at build time to override (e.g. in Dockerfile).
 */

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL as string | undefined;

function detectGatewayBase(): string {
  const params = new URLSearchParams(window.location.search);
  const override = params.get("gateway");
  if (override) return override.replace(/\/+$/, "");

  if (GATEWAY_URL) return GATEWAY_URL.replace(/\/+$/, "");

  const loc = window.location;
  // Dev server (Vite) — proxy handles routing, use origin
  if (loc.port === "5173" || loc.port === "5174") {
    return loc.origin;
  }
  // Fallback: assume gateway is at api.whissle.ai
  return "https://api.whissle.ai";
}

const gatewayBase = detectGatewayBase();
const wsBase = gatewayBase.replace(/^http/, "ws");

export const gatewayConfig = {
  /** HTTP base URL for the gateway */
  httpBase: gatewayBase,
  /** WebSocket base URL for the gateway */
  wsBase,

  /** ASR streaming WebSocket */
  asrStreamUrl: `${wsBase}/asr/stream`,
  /** Agent route/stream SSE endpoint */
  agentStreamUrl: `${gatewayBase}/agent/route/stream`,
  /** TTS WebSocket (Rime /ws3) */
  ttsWsBase: `${wsBase}/agent/tts`,

  /** Health check */
  healthUrl: `${gatewayBase}/health`,
} as const;
