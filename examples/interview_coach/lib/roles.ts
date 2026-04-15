export const TOTAL_QUESTIONS = 6;

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

const VOICE_RULES = `
Important — this is a voice conversation using speech recognition:
- ALWAYS respond with something. Never return an empty response.
- Interpret the user's intent even if transcription has errors.
- Keep responses to 1-3 concise sentences (spoken aloud via TTS).
- No markdown, bullet points, or special characters.
- Be conversational and natural.`;

export const INTERVIEW_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "score_answer",
      description: "Score the candidate's answer after they finish responding. ALWAYS call this after each answer before giving feedback.",
      parameters: {
        type: "object",
        properties: {
          content_score: { type: "number", description: "0-100 content quality score" },
          structure: { type: "string", enum: ["star", "direct", "concise", "rambling", "deflection"] },
          strengths: { type: "array", items: { type: "string" }, description: "2-3 specific strengths" },
          improvements: { type: "array", items: { type: "string" }, description: "1-3 specific improvements" },
          question_category: { type: "string", enum: ["intro", "behavioral", "technical", "system_design", "leadership", "situational", "closing"] },
          jd_gaps_addressed: { type: "array", items: { type: "string" }, description: "JD requirements this answer addressed" },
          what_interviewer_thinks: { type: "string", description: "1-2 sentence frank assessment of what a real interviewer would think hearing this answer. Be honest and specific." },
          problematic_quote: { type: "string", description: "The weakest or most concerning sentence/phrase from the candidate's answer. Quote it exactly." },
          suggested_reframe: { type: "string", description: "How the candidate should have said the problematic quote instead. Be specific." },
        },
        required: ["content_score", "structure", "strengths", "improvements", "question_category", "what_interviewer_thinks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "end_interview",
      description: "End the interview after all questions. Call this after the final question's score_answer.",
      parameters: {
        type: "object",
        properties: {
          verdict: { type: "string", enum: ["strong_hire", "hire", "lean_hire", "lean_no_hire", "no_hire"], description: "Hiring recommendation based on this interview performance" },
          verdict_reasoning: { type: "string", description: "2-3 sentence candid explanation of the verdict, as if writing in an interview debrief. Be specific about what drove the decision." },
          overall_content_score: { type: "number", description: "0-100 overall" },
          overall_feedback: { type: "string", description: "2-3 sentence overall assessment" },
          top_strengths: { type: "array", items: { type: "string" } },
          growth_areas: { type: "array", items: { type: "string" } },
          practice_recommendations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short actionable title, e.g. 'Practice system design answers'" },
                detail: { type: "string", description: "Specific advice with reference to what happened in this interview" },
                priority: { type: "string", enum: ["critical", "important", "nice_to_have"] },
              },
            },
            description: "3 specific, actionable practice recommendations based on this session",
          },
          jd_coverage: {
            type: "array",
            items: {
              type: "object",
              properties: {
                requirement: { type: "string" },
                status: { type: "string", enum: ["covered", "partial", "not_shown"] },
              },
            },
          },
          weakest_question_index: { type: "number", description: "0-based index of the question that needs the most work" },
          strongest_question_index: { type: "number", description: "0-based index of the best-answered question" },
        },
        required: ["verdict", "verdict_reasoning", "overall_content_score", "overall_feedback", "top_strengths", "growth_areas", "practice_recommendations"],
      },
    },
  },
];

export type Difficulty = "friendly" | "standard" | "tough";

export function buildSystemPrompt(
  jdText: string,
  resumeText: string,
  gapAnalysis: string,
  difficulty: Difficulty,
  emotionContext: string,
): string {
  const difficultyInstructions: Record<Difficulty, string> = {
    friendly: "Be warm, encouraging, and supportive. If the candidate sounds nervous, slow down and offer reassurance. Focus on building their confidence.",
    standard: "Be professional and balanced. Give honest feedback. Push for specifics when answers are vague, but remain supportive.",
    tough: "Be direct and challenging. Ask tough follow-ups. If the candidate sounds nervous, push harder — real tough interviewers do this. Hold them to a high bar.",
  };

  return `You are conducting a mock interview for a specific role. Your behavior adapts to the candidate's emotional state detected from their voice.

## JOB DESCRIPTION
${jdText || "General software engineering role"}

## CANDIDATE RESUME
${resumeText || "Not provided"}

## GAP ANALYSIS
${gapAnalysis || "Not available"}

## DIFFICULTY: ${difficulty.toUpperCase()}
${difficultyInstructions[difficulty]}

## INTERVIEW FLOW
1. Ask ${TOTAL_QUESTIONS} questions total, one at a time:
   - Q1: "Tell me about yourself" (intro warm-up)
   - Q2-Q3: Behavioral questions targeting resume gaps or JD requirements
   - Q4: Technical or system design question relevant to the JD
   - Q5: Leadership/teamwork/situational question
   - Q6: "Why are you interested in this role?" (closing)
2. After EACH candidate answer, you MUST call score_answer with structured scores FIRST, then give 1-2 sentences of spoken feedback followed by the next question.
3. In score_answer, be brutally honest in what_interviewer_thinks. This is private coaching data, not spoken aloud. Quote actual problematic phrases from the candidate.
4. After Q6's score, call end_interview with the overall assessment including a clear hire/no-hire verdict. Then give a brief closing remark.
5. Ask follow-up questions when answers are vague — dig deeper like a real interviewer.
6. Reference specific JD requirements and resume details in your questions.

${emotionContext}
${VOICE_RULES}`;
}
