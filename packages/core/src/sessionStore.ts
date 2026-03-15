/**
 * Local session storage — IndexedDB at fixed location.
 * Stores session reports and optional audio (no cloud).
 */

import type { SessionReport } from "./types";
import type { TranscriptEntry } from "./types";

const DB_NAME = "whissle_live_assist";
const STORE_SESSIONS = "sessions";

export interface StoredSession {
  id: string;
  timestamp: number;
  report: SessionReport;
  transcript: Array<{
    channel: string;
    text: string;
    is_final?: boolean;
    audioOffset?: number;
    metadata?: {
      emotion?: string;
      emotionConfidence?: number;
      intent?: string;
      gender?: string;
      age?: string;
      emotionTimeline?: Array<{ offset: number; emotion: string; confidence: number }>;
    };
  }>;
  agendaItems?: Array<{ id: string; title: string; status?: string; confidence?: number }>;
  audioBlob?: Blob; // optional, not returned when listing
}

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
    };
  });
}

export async function saveSession(session: StoredSession): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, "readwrite");
      const store = tx.objectStore(STORE_SESSIONS);
      const req = store.put(session);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[LiveAssist] Failed to save session:", e);
  }
}

export async function listSessions(limit = 50): Promise<Omit<StoredSession, "audioBlob">[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, "readonly");
      const store = tx.objectStore(STORE_SESSIONS);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as StoredSession[])
          .map(({ audioBlob: _, ...s }) => s)
          .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
        resolve(all.slice(0, limit));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}
