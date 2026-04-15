import React from "react";

interface Props {
  confidence: number;
  paceWPM: number;
  fillerCount: number;
  durationSec: number;
  emotion: string;
  vocalStability?: number;
  thinkTimeSec?: number;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const EMOTION_DISPLAY: Record<string, string> = {
  NEUTRAL: "Steady",
  HAPPY: "Confident",
  SAD: "Uncertain",
  FEAR: "Nervous",
  ANGRY: "Tense",
  ANGER: "Tense",
  SURPRISE: "Energized",
  DISGUST: "Uneasy",
};

function getConfidencePhrase(c: number): { text: string; color: string } {
  if (c >= 80) return { text: "Strong presence", color: "var(--color-success)" };
  if (c >= 60) return { text: "Sounds confident", color: "var(--color-success)" };
  if (c >= 40) return { text: "Some hesitation", color: "var(--color-warning)" };
  return { text: "Sounds unsure", color: "var(--color-danger)" };
}

function getPacePhrase(wpm: number): { text: string; color: string } {
  if (wpm === 0) return { text: "Waiting...", color: "var(--color-text-dim)" };
  if (wpm < 100) return { text: "Too slow — pick up energy", color: "var(--color-warning)" };
  if (wpm <= 160) return { text: "Natural pace", color: "var(--color-success)" };
  if (wpm <= 180) return { text: "Getting fast", color: "var(--color-warning)" };
  return { text: "Rushing — slow down", color: "var(--color-danger)" };
}

function getFillerPhrase(count: number): { text: string; color: string } {
  if (count === 0) return { text: "Clean speech", color: "var(--color-success)" };
  if (count <= 2) return { text: "Mostly clean", color: "var(--color-success)" };
  if (count <= 5) return { text: "Some fillers", color: "var(--color-warning)" };
  return { text: "Too many fillers", color: "var(--color-danger)" };
}

function getDurationPhrase(sec: number): { text: string; color: string } {
  if (sec < 5) return { text: "Just started", color: "var(--color-text-dim)" };
  if (sec <= 90) return { text: "Good length", color: "var(--color-success)" };
  if (sec <= 120) return { text: "Getting long", color: "var(--color-warning)" };
  return { text: "Too long — wrap up", color: "var(--color-danger)" };
}

export default function DeliveryMeter({ confidence, paceWPM, fillerCount, durationSec, emotion, vocalStability, thinkTimeSec }: Props) {
  const confPhrase = getConfidencePhrase(confidence);
  const pacePhrase = getPacePhrase(paceWPM);
  const fillerPhrase = getFillerPhrase(fillerCount);
  const durationPhrase = getDurationPhrase(durationSec);

  return (
    <div className="delivery-meter" role="region" aria-label="Voice delivery feedback">
      <h3 className="delivery-meter-title">How You Sound</h3>

      <div className="delivery-insight" style={{ borderLeftColor: confPhrase.color }}>
        <span className="delivery-insight-label">Confidence</span>
        <span className="delivery-insight-phrase" style={{ color: confPhrase.color }}>{confPhrase.text}</span>
      </div>

      <div className="delivery-insight" style={{ borderLeftColor: pacePhrase.color }}>
        <span className="delivery-insight-label">Pace {paceWPM > 0 ? `· ${paceWPM} wpm` : ""}</span>
        <span className="delivery-insight-phrase" style={{ color: pacePhrase.color }}>{pacePhrase.text}</span>
      </div>

      <div className="delivery-insight" style={{ borderLeftColor: fillerPhrase.color }}>
        <span className="delivery-insight-label">Fillers {fillerCount > 0 ? `· ${fillerCount}` : ""}</span>
        <span className="delivery-insight-phrase" style={{ color: fillerPhrase.color }}>{fillerPhrase.text}</span>
      </div>

      <div className="delivery-insight" style={{ borderLeftColor: durationPhrase.color }}>
        <span className="delivery-insight-label">Time · {formatDuration(durationSec)}</span>
        <span className="delivery-insight-phrase" style={{ color: durationPhrase.color }}>{durationPhrase.text}</span>
      </div>

      {vocalStability !== undefined && vocalStability < 100 && (
        <div className="delivery-insight" style={{ borderLeftColor: vocalStability >= 70 ? "var(--color-success)" : vocalStability >= 50 ? "var(--color-warning)" : "var(--color-danger)" }}>
          <span className="delivery-insight-label">Vocal Stability</span>
          <span className="delivery-insight-phrase" style={{ color: vocalStability >= 70 ? "var(--color-success)" : vocalStability >= 50 ? "var(--color-warning)" : "var(--color-danger)" }}>
            {vocalStability >= 70 ? "Voice is steady" : vocalStability >= 50 ? "Some wavering" : "Voice is shaky"}
          </span>
        </div>
      )}

      {thinkTimeSec !== undefined && thinkTimeSec > 0 && (
        <div className="delivery-insight" style={{ borderLeftColor: thinkTimeSec > 5 ? "var(--color-warning)" : "var(--color-text-dim)" }}>
          <span className="delivery-insight-label">Think Time · {thinkTimeSec.toFixed(1)}s</span>
          <span className="delivery-insight-phrase" style={{ color: thinkTimeSec > 5 ? "var(--color-warning)" : "var(--color-text-dim)" }}>
            {thinkTimeSec > 5 ? "Long pause before answering" : "Quick start"}
          </span>
        </div>
      )}

      <div className="delivery-tone-badge">
        {EMOTION_DISPLAY[emotion] ?? emotion}
      </div>
    </div>
  );
}
