/**
 * IndexedDB-backed audio storage for session recordings.
 *
 * Stores mic and TTS audio blobs keyed by session ID.
 * Provides retrieval for analytics playback and GCS upload.
 */

const DB_NAME = "whissle_agents_audio";
const DB_VERSION = 1;
const STORE_NAME = "recordings";

interface AudioRecord {
  sessionId: string;
  micBlob: Blob | null;
  ttsBlob: Blob | null;
  createdAt: string;
  uploaded: boolean;
  gcsUrls?: { mic?: string; tts?: string };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAudio(
  sessionId: string,
  micBlob: Blob | null,
  ttsBlob: Blob | null,
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: AudioRecord = {
      sessionId,
      micBlob,
      ttsBlob,
      createdAt: new Date().toISOString(),
      uploaded: false,
    };
    store.put(record);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("[AudioStore] save failed:", e);
  }
}

export async function getAudio(sessionId: string): Promise<AudioRecord | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(sessionId);
    const result = await new Promise<AudioRecord | null>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch (e) {
    console.warn("[AudioStore] get failed:", e);
    return null;
  }
}

export async function listAudioSessionIds(): Promise<string[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAllKeys();
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return keys.map(String);
  } catch {
    return [];
  }
}

export async function markUploaded(
  sessionId: string,
  gcsUrls: { mic?: string; tts?: string },
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(sessionId);
    req.onsuccess = () => {
      const record = req.result as AudioRecord | undefined;
      if (record) {
        record.uploaded = true;
        record.gcsUrls = gcsUrls;
        store.put(record);
      }
    };
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("[AudioStore] markUploaded failed:", e);
  }
}

/**
 * Upload audio blobs to GCS via the gateway's /audio/upload-full endpoint.
 * Returns the GCS session ID used for the upload.
 */
export async function uploadToGcs(
  sessionId: string,
  gatewayBase: string,
  sessionToken: string,
): Promise<boolean> {
  const record = await getAudio(sessionId);
  if (!record) return false;

  const gcsSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const gcsUrls: { mic?: string; tts?: string } = {};
  let anyUploaded = false;

  for (const [channel, blob] of [
    ["microphone", record.micBlob],
    ["agent_tts", record.ttsBlob],
  ] as const) {
    if (!blob || blob.size === 0) continue;
    try {
      const form = new FormData();
      form.append("file", blob, `${channel}.webm`);
      form.append("session_id", gcsSessionId);
      form.append("channel", channel);
      const headers: Record<string, string> = {};
      if (sessionToken) headers["X-Session-Token"] = sessionToken;
      const res = await fetch(`${gatewayBase}/audio/upload`, {
        method: "POST",
        headers,
        body: form,
      });
      if (res.ok) {
        gcsUrls[channel === "microphone" ? "mic" : "tts"] = gcsSessionId;
        anyUploaded = true;
      }
    } catch (e) {
      console.warn(`[AudioStore] GCS upload ${channel} failed:`, e);
    }
  }

  if (anyUploaded) {
    await markUploaded(sessionId, gcsUrls);
  }
  return anyUploaded;
}

/** Maximum age in days before audio blobs are pruned. */
const AUDIO_TTL_DAYS = 30;

/**
 * Prune audio blobs older than TTL or orphaned (no matching session).
 * Call this on app startup to keep IndexedDB from growing unbounded.
 */
export async function pruneAudioStore(activeSessionIds: Set<string>): Promise<number> {
  let pruned = 0;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    const records = await new Promise<AudioRecord[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });

    const cutoff = Date.now() - AUDIO_TTL_DAYS * 24 * 60 * 60 * 1000;
    for (const record of records) {
      const createdMs = new Date(record.createdAt).getTime();
      const isExpired = createdMs < cutoff;
      const isOrphaned = !activeSessionIds.has(record.sessionId);
      if (isExpired || isOrphaned) {
        store.delete(record.sessionId);
        pruned++;
      }
    }

    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("[AudioStore] prune failed:", e);
  }
  return pruned;
}

export async function deleteAudio(sessionId: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(sessionId);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("[AudioStore] delete failed:", e);
  }
}
