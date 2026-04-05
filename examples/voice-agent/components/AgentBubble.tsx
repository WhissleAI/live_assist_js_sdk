import React, { useEffect, useRef } from "react";

interface Props {
  text: string;
  isSpeaking: boolean;
  isProcessing: boolean;
  isListening?: boolean;
  steps?: Array<{ title: string; status?: string }>;
  agentName?: string;
  agentAvatar?: string;
}

export default function AgentBubble({ text, isSpeaking, isProcessing, steps, isListening, agentName, agentAvatar }: Props) {
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [text]);

  if (!text && !isProcessing && !isListening && (!steps || steps.length === 0)) return null;

  const hasSteps = steps && steps.length > 0;
  const hasText = Boolean(text);
  const name = agentName || "Agent";
  const avatar = agentAvatar || "✨";

  const bubbleCls = [
    "agent-bubble",
    isSpeaking ? "agent-bubble--speaking" : "",
    isListening ? "agent-bubble--listening" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={bubbleCls}>
      <div className="agent-bubble-avatar">
        <span className="agent-bubble-avatar-icon">{isListening ? "👂" : avatar}</span>
        {isSpeaking && <span className="agent-bubble-pulse" />}
      </div>
      <div className="agent-bubble-content">
        <span className="agent-bubble-name">{name}</span>

        {hasSteps && (
          <div className="agent-steps">
            {steps!.map((s, i) => (
              <div key={i} className={`agent-step ${s.status === "complete" ? "agent-step--done" : "agent-step--active"}`}>
                {s.status === "complete" ? (
                  <span className="agent-step-icon">✓</span>
                ) : (
                  <span className="agent-step-spinner" />
                )}
                <span className="agent-step-text">{s.title}</span>
              </div>
            ))}
          </div>
        )}

        <div className="agent-bubble-text" ref={textRef}>
          {isListening && !hasText ? (
            <span className="agent-listening-label">Listening...</span>
          ) : hasText ? text : (isProcessing && !hasSteps ? (
            <span className="agent-typing">
              <span className="agent-typing-dot" />
              <span className="agent-typing-dot" />
              <span className="agent-typing-dot" />
            </span>
          ) : null)}
          {isProcessing && hasText && (
            <span className="agent-cursor" />
          )}
        </div>
      </div>
    </div>
  );
}
