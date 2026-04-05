import React from "react";
import type { BehavioralProfile } from "@whissle/live-assist-core";

interface Props {
  label: string;
  profile: BehavioralProfile;
  color: string;
}

const EMOTION_EMOJI: Record<string, string> = {
  HAPPY: "\uD83D\uDE04",
  SAD: "\uD83D\uDE22",
  ANGRY: "\uD83D\uDE20",
  FEAR: "\uD83D\uDE28",
  SURPRISE: "\uD83D\uDE32",
  NEUTRAL: "\uD83D\uDE10",
  DISGUST: "\uD83E\uDD22",
};

export default function VoiceProfileCard({ label, profile, color }: Props) {
  const emotions = Object.entries(profile.emotionProfile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const totalWeight = emotions.reduce((sum, [, v]) => sum + v, 0) || 1;

  return (
    <div className="voice-profile-card" style={{ borderTopColor: color }}>
      <h4 className="voice-profile-label" style={{ color }}>{label}</h4>
      <div className="voice-profile-segments">{profile.segmentCount} segments</div>

      <div className="voice-profile-emotions">
        {emotions.map(([emotion, weight]) => {
          const pct = Math.round((weight / totalWeight) * 100);
          return (
            <div key={emotion} className="voice-profile-emotion">
              <span className="voice-profile-emoji">
                {EMOTION_EMOJI[emotion] ?? "\u2753"}
              </span>
              <span className="voice-profile-emotion-name">
                {emotion.charAt(0) + emotion.slice(1).toLowerCase()}
              </span>
              <div className="voice-profile-bar">
                <div
                  className="voice-profile-bar-fill"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
              <span className="voice-profile-pct">{pct}%</span>
            </div>
          );
        })}
      </div>

      {emotions.length === 0 && (
        <p className="voice-profile-empty">No voice data yet</p>
      )}
    </div>
  );
}
