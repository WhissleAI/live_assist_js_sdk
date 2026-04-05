import React from "react";

interface Props {
  text: string;
  isSpeaking: boolean;
  isProcessing: boolean;
}

export default function AgentBubble({ text, isSpeaking, isProcessing }: Props) {
  if (!text && !isProcessing) return null;

  return (
    <div className={`agent-bubble ${isSpeaking ? "agent-bubble--speaking" : ""}`}>
      <div className="agent-bubble-avatar">
        <span className="agent-bubble-avatar-icon">🤖</span>
        {isSpeaking && <span className="agent-bubble-pulse" />}
      </div>
      <div className="agent-bubble-content">
        <span className="agent-bubble-name">Buddy</span>
        <p className="agent-bubble-text">
          {text || (isProcessing ? "Thinking..." : "")}
        </p>
      </div>
    </div>
  );
}
