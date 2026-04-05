import { useState, useEffect, useRef, useCallback } from "react";
import type { SSEEvent } from "@/types";

export function useSSE(url = "/api/events") {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    if (sourceRef.current) sourceRef.current.close();

    const es = new EventSource(url);
    sourceRef.current = es;

    es.onopen = () => {
      if (!unmountedRef.current) setConnected(true);
    };

    es.onmessage = (e) => {
      if (unmountedRef.current) return;
      try {
        const evt: SSEEvent = JSON.parse(e.data);
        setEvents((prev) => [evt, ...prev].slice(0, 200));
      } catch {
        // malformed SSE payload — skip
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      if (!unmountedRef.current) {
        timerRef.current = setTimeout(connect, 3000);
      }
    };
  }, [url]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      sourceRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [connect]);

  const clear = useCallback(() => setEvents([]), []);

  return { events, connected, clear };
}
