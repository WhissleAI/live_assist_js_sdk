/**
 * Local session storage — IndexedDB at fixed location.
 * Stores session reports and optional audio (no cloud).
 */
const DB_NAME = "whissle_live_assist";
const STORE_SESSIONS = "sessions";
let _db = null;
function openDb() {
    if (_db)
        return Promise.resolve(_db);
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
export async function saveSession(session) {
    try {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SESSIONS, "readwrite");
            const store = tx.objectStore(STORE_SESSIONS);
            const req = store.put(session);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }
    catch (e) {
        console.warn("[LiveAssist] Failed to save session:", e);
    }
}
export async function listSessions(limit = 50) {
    try {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SESSIONS, "readonly");
            const store = tx.objectStore(STORE_SESSIONS);
            const req = store.getAll();
            req.onsuccess = () => {
                const all = req.result
                    .map(({ audioBlob: _, ...s }) => s)
                    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
                resolve(all.slice(0, limit));
            };
            req.onerror = () => reject(req.error);
        });
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=sessionStore.js.map