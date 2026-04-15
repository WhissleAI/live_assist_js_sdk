/**
 * Centralized TTS access — abstracts Cartesia API calls.
 *
 * REST calls (voice preview, playground) are routed through the gateway
 * proxy when available (/agent/tts/preview), falling back to direct
 * Cartesia API access. This keeps the API key server-side for REST.
 *
 * The WebSocket TTS connection (cartesia-tts.ts) still requires the key
 * client-side for the WS handshake. A full fix requires a WebSocket proxy
 * on the gateway — tracked as a future improvement.
 */

import { gatewayConfig } from "./gateway-config";

const CARTESIA_REST_URL = "https://api.cartesia.ai/tts/bytes";
const CARTESIA_VERSION = "2025-04-16";

export function getCartesiaApiKey(): string {
  return (import.meta.env.VITE_CARTESIA_API_KEY as string) || "";
}

interface TtsPreviewOptions {
  voiceId: string;
  text: string;
  modelId?: string;
  language?: string;
}

/**
 * Fetch TTS audio bytes for voice preview.
 * Tries the gateway proxy first, falls back to direct Cartesia REST API.
 */
export async function fetchTtsPreview(options: TtsPreviewOptions): Promise<Blob> {
  const { voiceId, text, modelId = "sonic-3", language = "en" } = options;

  // Try gateway proxy first (keeps API key server-side)
  try {
    const sessionToken = gatewayConfig.getSessionToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (sessionToken) headers["X-Session-Token"] = sessionToken;

    const res = await fetch(`${gatewayConfig.httpBase}/agent/tts/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({ voice_id: voiceId, text, model_id: modelId, language }),
    });

    if (res.ok) {
      return await res.blob();
    }
    // If gateway doesn't support this endpoint (404), fall through to direct
    if (res.status !== 404) {
      throw new Error(`Gateway TTS preview failed: ${res.status}`);
    }
  } catch (e) {
    // Gateway unavailable or doesn't have the endpoint — fall through
    if (e instanceof Error && !e.message.includes("404")) {
      console.warn("[TtsProxy] Gateway proxy failed, falling back to direct:", e.message);
    }
  }

  // Fallback: direct Cartesia REST API
  const apiKey = getCartesiaApiKey();
  if (!apiKey) {
    throw new Error("TTS API key not configured");
  }

  const res = await fetch(CARTESIA_REST_URL, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": CARTESIA_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: modelId,
      transcript: text,
      voice: { mode: "id", id: voiceId },
      output_format: { container: "mp3", bit_rate: 128000 },
      language,
    }),
  });

  if (!res.ok) {
    throw new Error(`Cartesia TTS failed: ${res.status}`);
  }

  return await res.blob();
}
