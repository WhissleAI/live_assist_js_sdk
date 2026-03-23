export interface GapAnalysis {
  skillsMatch: Array<{ skill: string; status: "match" | "partial" | "gap"; note: string }>;
  probeAreas: string[];
  talkingPoints: string[];
  predictedQuestions: string[];
}

export function buildPrepPrompt(jdText: string, resumeText: string): string {
  return `Analyze this job description and resume. Return a JSON object with this exact structure:

{
  "skillsMatch": [
    { "skill": "React", "status": "match", "note": "Strong match — 3 years experience" },
    { "skill": "AWS", "status": "gap", "note": "JD requires, not on resume" }
  ],
  "probeAreas": [
    "System design at scale — resume doesn't show distributed systems",
    "Leadership — JD mentions mentoring, resume has 1 mention"
  ],
  "talkingPoints": [
    "Flipkart migration project → frame as system design story",
    "PostgreSQL optimization → maps to SQL requirement"
  ],
  "predictedQuestions": [
    "Tell me about yourself and your background",
    "Describe the Flipkart migration project and your role",
    "How would you design a URL shortener at scale?",
    "Tell me about a time you mentored a junior engineer",
    "Why are you interested in this role?"
  ]
}

## JOB DESCRIPTION
${jdText}

## RESUME
${resumeText}

Return ONLY the JSON object, no markdown fences, no explanation.`;
}

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((v) => typeof v === "string");
}

function isSkillsMatch(val: unknown): val is GapAnalysis["skillsMatch"] {
  if (!Array.isArray(val)) return false;
  return val.every(
    (v) =>
      typeof v === "object" && v !== null &&
      typeof (v as Record<string, unknown>).skill === "string" &&
      typeof (v as Record<string, unknown>).status === "string" &&
      typeof (v as Record<string, unknown>).note === "string",
  );
}

export function parsePrepResponse(text: string): GapAnalysis | null {
  try {
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    if (
      isSkillsMatch(parsed.skillsMatch) &&
      isStringArray(parsed.probeAreas) &&
      isStringArray(parsed.talkingPoints) &&
      isStringArray(parsed.predictedQuestions)
    ) {
      return parsed as unknown as GapAnalysis;
    }

    return null;
  } catch {
    return null;
  }
}
