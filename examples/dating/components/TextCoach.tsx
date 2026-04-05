import React, { useState, useRef } from "react";
import { streamLiveAssistWithFeedback } from "@whissle/live-assist-core";
import type { DateConfig } from "../App";
import { buildTextCoachPrompt } from "../lib/dating-prompts";

interface Props {
  config: DateConfig;
}

type Tone = "flirty" | "casual" | "deep" | "funny";

const TONES: { value: Tone; label: string }[] = [
  { value: "casual", label: "Casual" },
  { value: "flirty", label: "Flirty" },
  { value: "deep", label: "Deep" },
  { value: "funny", label: "Funny" },
];

export default function TextCoach({ config }: Props) {
  const [conversation, setConversation] = useState("");
  const [tone, setTone] = useState<Tone>("casual");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleAnalyze = async () => {
    if (!conversation.trim() || loading) return;

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setResponse("");
    setLoading(true);

    const prompt = buildTextCoachPrompt(tone);
    const transcript = `CONVERSATION TO ANALYZE:\n\n${conversation}\n\nContext about them: ${config.dateContext || "No specific context"}\nMy goals: ${config.goals || "Make a connection"}`;

    await streamLiveAssistWithFeedback({
      agentUrl: config.agentUrl,
      transcript,
      userId: "dating-text-coach",
      mode: "chat",
      userPersonality: config.userPersonality,
      custom_prompt: prompt,
      contextFilters: {
        docs: false,
        memories: config.contextFilters.memories,
        notes: false,
        history: false,
        emails: false,
      },
      callbacks: {
        onFeedbackChunk: (chunk) => {
          setResponse((prev) => prev + chunk);
        },
        onDone: () => {
          setLoading(false);
        },
        onError: () => {
          setLoading(false);
        },
      },
      signal: abortController.signal,
    });
  };

  return (
    <div className="text-coach-root">
      <div className="text-coach-header">
        <h1>Text Coach</h1>
        <p>Paste your conversation and get reply suggestions.</p>
      </div>

      <div className="text-coach-layout">
        <div className="text-coach-input-area">
          <label className="text-coach-label">
            Paste the conversation
          </label>
          <textarea
            className="text-coach-textarea"
            rows={12}
            value={conversation}
            onChange={(e) => setConversation(e.target.value)}
            placeholder={"Them: Hey! How's your day going?\nMe: Pretty good! Just got back from a hike.\nThem: Oh nice, where did you go?"}
          />

          <div className="text-coach-controls">
            <div className="text-coach-tone-selector">
              <span>Tone:</span>
              {TONES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`text-coach-tone-btn ${tone === t.value ? "text-coach-tone-btn--active" : ""}`}
                  onClick={() => setTone(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="text-coach-analyze-btn"
              onClick={handleAnalyze}
              disabled={loading || !conversation.trim()}
            >
              {loading ? "Thinking..." : "Get Suggestions"}
            </button>
          </div>
        </div>

        <div className="text-coach-response-area">
          <h3>Reply Suggestions</h3>
          <div className="text-coach-response">
            {response || (
              <span className="text-coach-placeholder">
                Your AI-generated reply suggestions will appear here...
              </span>
            )}
            {loading && <span className="prep-cursor" />}
          </div>
        </div>
      </div>
    </div>
  );
}
