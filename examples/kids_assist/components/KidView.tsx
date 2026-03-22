import React, { useCallback } from "react";
import type { SessionState } from "../App";
import { useAsrSession } from "../hooks/useAsrSession";
import EmotionCanvas from "./EmotionCanvas";
import MicButton from "./MicButton";
import FloatingWords from "./FloatingWords";

interface Props {
  asrUrl: string;
  session: SessionState;
  updateSession: (patch: Partial<SessionState>) => void;
  sessionRef: React.MutableRefObject<SessionState>;
}

const EMOTION_LABELS: Record<string, string> = {
  HAPPY: "Happy",
  SAD: "Sad",
  ANGRY: "Angry",
  FEAR: "Worried",
  SURPRISE: "Surprised",
  DISGUST: "Yuck",
  NEUTRAL: "Calm",
};

export default function KidView({ asrUrl, session, updateSession, sessionRef }: Props) {
  const { start, stop } = useAsrSession(asrUrl, sessionRef, updateSession);

  const handleToggle = useCallback(() => {
    if (session.isActive) {
      stop();
    } else {
      start();
    }
  }, [session.isActive, start, stop]);

  return (
    <div className="kid-view">
      <EmotionCanvas
        emotion={session.currentEmotion}
        probs={session.currentEmotionProbs}
        isActive={session.isActive}
      />

      <FloatingWords
        transcript={session.transcript}
        currentEmotion={session.currentEmotion}
      />

      {session.isActive && session.currentEmotion !== "NEUTRAL" && (
        <div className="emotion-label-float">
          {EMOTION_LABELS[session.currentEmotion] || session.currentEmotion}
        </div>
      )}

      {session.isActive && session.speakerLabel !== "child" && (
        <div className="speaker-indicator">
          <span className="speaker-dot" />
          Someone else is talking
        </div>
      )}

      <div className="kid-center">
        {!session.isActive && (
          <h1 className="kid-title">Tap to Talk</h1>
        )}
        <MicButton
          isActive={session.isActive}
          isConnected={session.isConnected}
          emotion={session.currentEmotion}
          onToggle={handleToggle}
        />
        {!session.isActive && session.transcript.length > 0 && (
          <p className="kid-hint">Great conversation! Switch to Parent view to see insights.</p>
        )}
      </div>

      {session.error && (
        <div className="kid-error">
          {session.error}
          <button type="button" onClick={() => updateSession({ error: null })}>&times;</button>
        </div>
      )}
    </div>
  );
}
