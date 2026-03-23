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
  HAPPY: "Engaged",
  SAD: "Uncertain",
  FEAR: "Nervous",
  ANGRY: "Tense",
  ANGER: "Tense",
  SURPRISE: "Energized",
  DISGUST: "Uneasy",
};

function getConfidencePhrase(c: number): { text: string; color: string } {
  if (c >= 80) return { text: "Strong presence", color: "var(--color-green)" };
  if (c >= 60) return { text: "Sounds confident", color: "var(--color-green)" };
  if (c >= 40) return { text: "Some hesitation", color: "var(--color-amber)" };
  return { text: "Sounds unsure", color: "var(--color-red)" };
}

function getPacePhrase(wpm: number): { text: string; color: string } {
  if (wpm === 0) return { text: "Waiting...", color: "var(--color-muted)" };
  if (wpm < 100) return { text: "Too slow — pick up energy", color: "var(--color-amber)" };
  if (wpm <= 160) return { text: "Natural pace", color: "var(--color-green)" };
  if (wpm <= 180) return { text: "Getting fast", color: "var(--color-amber)" };
  return { text: "Rushing — slow down", color: "var(--color-red)" };
}

function getFillerPhrase(count: number): { text: string; color: string } {
  if (count === 0) return { text: "Clean speech", color: "var(--color-green)" };
  if (count <= 2) return { text: "Mostly clean", color: "var(--color-green)" };
  if (count <= 5) return { text: "Some fillers", color: "var(--color-amber)" };
  return { text: "Too many fillers", color: "var(--color-red)" };
}

function getDurationPhrase(sec: number): { text: string; color: string } {
  if (sec < 5) return { text: "Just started", color: "var(--color-muted)" };
  if (sec <= 90) return { text: "Good length", color: "var(--color-green)" };
  if (sec <= 120) return { text: "Getting long", color: "var(--color-amber)" };
  return { text: "Too long — wrap up", color: "var(--color-red)" };
}

export default function DeliveryMeter({ confidence, paceWPM, fillerCount, durationSec, emotion, vocalStability, thinkTimeSec }: Props) {
  const confPhrase = getConfidencePhrase(confidence);
  const pacePhrase = getPacePhrase(paceWPM);
  const fillerPhrase = getFillerPhrase(fillerCount);
  const durationPhrase = getDurationPhrase(durationSec);

  return (
    <div className="delivery-meter">
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
        <div className="delivery-insight" style={{ borderLeftColor: vocalStability >= 70 ? "var(--color-green)" : vocalStability >= 50 ? "var(--color-amber)" : "var(--color-red)" }}>
          <span className="delivery-insight-label">Vocal Stability</span>
          <span className="delivery-insight-phrase" style={{ color: vocalStability >= 70 ? "var(--color-green)" : vocalStability >= 50 ? "var(--color-amber)" : "var(--color-red)" }}>
            {vocalStability >= 70 ? "Voice is steady" : vocalStability >= 50 ? "Some wavering" : "Voice is shaky"}
          </span>
        </div>
      )}

      {thinkTimeSec !== undefined && thinkTimeSec > 0 && (
        <div className="delivery-insight" style={{ borderLeftColor: thinkTimeSec > 5 ? "var(--color-amber)" : "var(--color-muted)" }}>
          <span className="delivery-insight-label">Think Time · {thinkTimeSec.toFixed(1)}s</span>
          <span className="delivery-insight-phrase" style={{ color: thinkTimeSec > 5 ? "var(--color-amber)" : "var(--color-muted)" }}>
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
