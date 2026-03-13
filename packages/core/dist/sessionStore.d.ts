/**
 * Local session storage — IndexedDB at fixed location.
 * Stores session reports and optional audio (no cloud).
 */
import type { SessionReport } from "./types";
export interface StoredSession {
    id: string;
    timestamp: number;
    report: SessionReport;
    transcript: Array<{
        channel: string;
        text: string;
        is_final?: boolean;
    }>;
    agendaItems?: Array<{
        id: string;
        title: string;
        status?: string;
        confidence?: number;
    }>;
    audioBlob?: Blob;
}
export declare function saveSession(session: StoredSession): Promise<void>;
export declare function listSessions(limit?: number): Promise<Omit<StoredSession, "audioBlob">[]>;
//# sourceMappingURL=sessionStore.d.ts.map