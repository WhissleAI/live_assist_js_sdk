const STORAGE_KEY = "whissle_device_id";

function generateDeviceId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = `device_${generateDeviceId()}`;
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

const GATEWAY_URL = (import.meta as unknown as { env?: { VITE_GATEWAY_URL?: string } }).env
  ?.VITE_GATEWAY_URL;

function detectGatewayBase(): string {
  const params = new URLSearchParams(window.location.search);
  const override = params.get("gateway");
  if (override) return override.replace(/\/+$/, "");
  if (GATEWAY_URL) return GATEWAY_URL.replace(/\/+$/, "");
  const loc = window.location;
  if (["5173", "5174", "5175", "5176"].includes(loc.port)) return loc.origin;
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
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ token: data.session_token, expires: data.expires_at }),
      );
      return data.session_token;
    }
  } catch (e) {
    console.warn("[NeuroPsych] Session init failed:", e);
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
  agentUrl: gatewayBase,
  initSession,
  getSessionToken,
} as const;
