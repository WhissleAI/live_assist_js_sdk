import { useState, useCallback, useRef } from "react";
import { getDeviceId } from "../lib/device-id";

/**
 * Bridge between voice transcripts and OpenCode sessions.
 * Uses OpenCode's REST API via the Vite proxy at /opencode/.
 * All requests include device_id so OpenCode scopes to the user's workspace.
 *
 * Flow:
 * 1. ensureSession() — creates or reuses an OpenCode session
 * 2. sendPrompt(text) — POST the voice transcript as a message
 * 3. sendPromptAsync(text) — fire-and-forget version (returns immediately)
 */

interface OpenCodeSession {
  id: string;
  title?: string;
}

interface BridgeState {
  sessionId: string | null;
  isCreating: boolean;
  isSending: boolean;
  lastSentText: string | null;
  error: string | null;
}

function apiUrl(path: string): string {
  const deviceId = getDeviceId();
  const sep = path.includes("?") ? "&" : "?";
  return `/opencode-api${path}${sep}device_id=${encodeURIComponent(deviceId)}`;
}

export function useOpenCodeBridge() {
  const [state, setState] = useState<BridgeState>({
    sessionId: null,
    isCreating: false,
    isSending: false,
    lastSentText: null,
    error: null,
  });

  const sessionIdRef = useRef<string | null>(null);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;

    setState((s) => ({ ...s, isCreating: true, error: null }));
    try {
      const res = await fetch(apiUrl("/session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(`Failed to create session: ${res.status}`);
      }
      const session: OpenCodeSession = await res.json();
      sessionIdRef.current = session.id;
      setState((s) => ({ ...s, sessionId: session.id, isCreating: false }));
      return session.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, isCreating: false, error: msg }));
      throw err;
    }
  }, []);

  /** Send a voice transcript to OpenCode and wait for the response to complete. */
  const sendPrompt = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setState((s) => ({ ...s, isSending: true, error: null }));
      try {
        const sid = await ensureSession();
        const res = await fetch(apiUrl(`/session/${sid}/message`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parts: [{ type: "text", text }],
          }),
        });
        if (!res.ok) {
          throw new Error(`Failed to send prompt: ${res.status}`);
        }
        setState((s) => ({ ...s, isSending: false, lastSentText: text }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setState((s) => ({ ...s, isSending: false, error: msg }));
      }
    },
    [ensureSession],
  );

  /** Fire-and-forget: send transcript to OpenCode without waiting for AI response. */
  const sendPromptAsync = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      try {
        const sid = await ensureSession();
        await fetch(apiUrl(`/session/${sid}/prompt_async`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parts: [{ type: "text", text }],
          }),
        });
        setState((s) => ({ ...s, lastSentText: text }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setState((s) => ({ ...s, error: msg }));
      }
    },
    [ensureSession],
  );

  /** Reset session — next prompt will create a new session. */
  const resetSession = useCallback(() => {
    sessionIdRef.current = null;
    setState({
      sessionId: null,
      isCreating: false,
      isSending: false,
      lastSentText: null,
      error: null,
    });
  }, []);

  return {
    ...state,
    ensureSession,
    sendPrompt,
    sendPromptAsync,
    resetSession,
  };
}
