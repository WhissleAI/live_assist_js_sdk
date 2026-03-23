export interface SessionRecord {
  id: string;
  date: string;
  role: string;
  difficulty: string;
  readinessScore: number;
  contentAvg: number;
  deliveryAvg: number;
  confidenceAvg: number;
  questionCount: number;
}

const STORAGE_KEY = "interview-coach-history";

export function saveSessionRecord(record: SessionRecord): void {
  const existing = loadSessionHistory();
  existing.push(record);
  if (existing.length > 50) existing.splice(0, existing.length - 50);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {}
}

export function loadSessionHistory(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SessionRecord[];
  } catch {
    return [];
  }
}
