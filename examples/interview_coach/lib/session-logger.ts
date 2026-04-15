import { getDeviceId } from "./device-id";

export interface SessionLogPayload {
  session_id: string;
  difficulty: string;
  jd_text_hash: string;
  questions: string[];
  answers: string[];
  scores: Record<string, number>;
  verdict: string;
  verdict_reasoning: string;
  delivery_metrics: Record<string, number>;
  vocal_metrics: {
    avgStability: number;
    totalConvictionMoments: number;
    totalNervousSpikes: number;
    intentPatterns: string[];
  };
  readiness_score: number;
  duration_sec: number;
  question_count: number;
  top_strengths: string[];
  growth_areas: string[];
}

export async function logSession(agentUrl: string, payload: SessionLogPayload): Promise<void> {
  const url = `${agentUrl.replace(/\/+$/, "")}/interview-coach/log-session`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": getDeviceId(),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[SessionLogger] Server responded ${res.status}`);
    }
  } catch (err) {
    console.warn("[SessionLogger] Failed to log session:", err);
  }
}

export async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
