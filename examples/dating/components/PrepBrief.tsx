import React, { useEffect, useState, useRef } from "react";
import { streamLiveAssistWithFeedback } from "@whissle/live-assist-core";
import type { DateConfig } from "../App";
import { buildPrepBriefPrompt } from "../lib/dating-prompts";

interface Props {
  config: DateConfig;
  onReady: () => void;
}

export default function PrepBrief({ config, onReady }: Props) {
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const abortController = new AbortController();

    const prompt = buildPrepBriefPrompt(config);
    const transcript = `Preparing for a ${config.dateType} with ${config.dateName || "someone"}. ${config.dateContext || ""} Goals: ${config.goals || "Have a great time."}`;

    streamLiveAssistWithFeedback({
      agentUrl: config.agentUrl,
      transcript,
      userId: "dating-coach-user",
      mode: "meeting",
      userPersonality: config.userPersonality,
      custom_prompt: prompt,
      contextFilters: {
        docs: false,
        memories: config.contextFilters.memories,
        notes: config.contextFilters.notes,
        history: false,
        emails: false,
      },
      callbacks: {
        onFeedbackChunk: (chunk) => {
          setBrief((prev) => prev + chunk);
        },
        onDone: () => {
          setLoading(false);
        },
        onError: (err) => {
          setError(err.message);
          setLoading(false);
        },
      },
      signal: abortController.signal,
    });

    return () => {
      abortController.abort();
    };
  }, [config]);

  return (
    <div className="prep-root">
      <div className="prep-header">
        <h1>Pre-Date Brief</h1>
        <p>Your personalized coaching for tonight</p>
      </div>

      <div className="prep-content">
        {error && <div className="prep-error">{error}</div>}

        <div className="prep-brief-text">
          {brief || (loading ? "Generating your dating brief..." : "")}
          {loading && <span className="prep-cursor" />}
        </div>
      </div>

      <div className="prep-actions">
        <button
          type="button"
          className="prep-ready-btn"
          onClick={onReady}
          disabled={loading && !brief}
        >
          {loading ? "Preparing..." : "I'm Ready — Start Coaching"}
        </button>
      </div>
    </div>
  );
}
