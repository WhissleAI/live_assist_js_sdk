import React from "react";
import { EmotionDonut, getProfileSegments } from "./PersonalityChart";
import type { BehavioralProfile } from "@whissle/live-assist-core";

interface PersonalitySidebarProps {
  label: string;
  profile: BehavioralProfile;
  placeholder?: string;
  size?: number;
}

export function PersonalitySidebar({ label, profile, placeholder = "—", size = 100 }: PersonalitySidebarProps) {
  const segments = getProfileSegments(profile);
  const hasData = segments.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 12 }}>{label}</div>
      {hasData ? (
        <EmotionDonut segments={segments} size={size} centerEmoji />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: "#9ca3af",
            textAlign: "center",
          }}
        >
          {placeholder}
        </div>
      )}
    </div>
  );
}
