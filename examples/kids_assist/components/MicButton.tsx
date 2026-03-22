import React from "react";

interface Props {
  isActive: boolean;
  isConnected: boolean;
  emotion: string;
  onToggle: () => void;
}

const RING_COLORS: Record<string, string> = {
  HAPPY: "#facc15",
  SAD: "#3b82f6",
  ANGRY: "#ef4444",
  FEAR: "#8b5cf6",
  SURPRISE: "#f97316",
  DISGUST: "#22c55e",
  NEUTRAL: "#9ca3af",
};

export default function MicButton({ isActive, isConnected, emotion, onToggle }: Props) {
  const ringColor = isActive ? (RING_COLORS[emotion] || RING_COLORS.NEUTRAL) : "#4b5563";

  return (
    <button
      type="button"
      className={`mic-button ${isActive ? "mic-button--active" : ""} ${isConnected ? "mic-button--connected" : ""}`}
      onClick={onToggle}
      aria-label={isActive ? "Stop listening" : "Start listening"}
    >
      {isActive && (
        <>
          <span className="mic-ring mic-ring--1" style={{ borderColor: ringColor }} />
          <span className="mic-ring mic-ring--2" style={{ borderColor: ringColor }} />
          <span className="mic-ring mic-ring--3" style={{ borderColor: ringColor }} />
        </>
      )}
      <span className="mic-button-inner" style={isActive ? { boxShadow: `0 0 40px ${ringColor}40` } : undefined}>
        {isActive ? (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        ) : (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        )}
      </span>
    </button>
  );
}
