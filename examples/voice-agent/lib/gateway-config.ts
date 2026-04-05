/**
 * Centralized gateway configuration for kids_assist.
 *
 * In production, all requests go directly to api.whissle.ai.
 * In dev, Vite proxies /asr, /agent, /tts to localhost:9000 (gateway).
 *
 * Set VITE_GATEWAY_URL at build time to override (e.g. in Dockerfile).
 */

import { getDeviceId } from "./device-id";

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL as string | undefined;

function detectGatewayBase(): string {
  const params = new URLSearchParams(window.location.search);
  const override = params.get("gateway");
  if (override) return override.replace(/\/+$/, "");

  if (GATEWAY_URL) return GATEWAY_URL.replace(/\/+$/, "");

  const loc = window.location;
  if (loc.port === "5173" || loc.port === "5174") {
    return loc.origin;
  }
  return "https://api.whissle.ai";
}

const gatewayBase = detectGatewayBase();
const wsBase = gatewayBase.replace(/^http/, "ws");

const SESSION_KEY = "whissle_session_token";
let _sessionToken: string | null = null;

async function initSession(): Promise<string> {
  const cached = sessionStorage.getItem(SESSION_KEY);
  if (cached) {
    try {
      const { token, expires } = JSON.parse(cached);
      if (Date.now() / 1000 < expires - 300) {
        _sessionToken = token;
        return token;
      }
    } catch {}
  }

  const deviceId = getDeviceId();
  try {
    const res = await fetch(`${gatewayBase}/session/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": deviceId },
      body: JSON.stringify({ device_id: deviceId }),
    });
    if (res.ok) {
      const data = await res.json();
      _sessionToken = data.session_token;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        token: data.session_token,
        expires: data.expires_at,
      }));
      return data.session_token;
    }
  } catch (e) {
    console.warn("[Session] init failed:", e);
  }
  return "";
}

function getSessionToken(): string {
  return _sessionToken || "";
}

export const gatewayConfig = {
  httpBase: gatewayBase,
  wsBase,
  asrStreamUrl: `${wsBase}/asr/stream`,
  agentStreamUrl: `${gatewayBase}/agent/route/stream`,
  healthUrl: `${gatewayBase}/health`,
  initSession,
  getSessionToken,
} as const;
