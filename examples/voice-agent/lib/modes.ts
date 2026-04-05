/**
 * Kids mode metadata — UI-only (labels, icons, colors).
 * All prompts and tool definitions live server-side in kids.py.
 */

export type KidsMode =
  | "kids_free_talk"
  | "kids_story_time"
  | "kids_calm_corner"
  | "kids_learn"
  | "kids_checkin";

export interface ModeMeta {
  label: string;
  icon: string;
  description: string;
  color: string;
}

export const MODE_META: Record<KidsMode, ModeMeta> = {
  kids_free_talk: {
    label: "Free Talk",
    icon: "💬",
    description: "Chat about anything",
    color: "#6366f1",
  },
  kids_story_time: {
    label: "Story Time",
    icon: "📖",
    description: "Create a story together",
    color: "#f59e0b",
  },
  kids_calm_corner: {
    label: "Calm Corner",
    icon: "🌊",
    description: "Breathe and feel better",
    color: "#3b82f6",
  },
  kids_learn: {
    label: "Learn & Explore",
    icon: "🔬",
    description: "Ask about anything",
    color: "#10b981",
  },
  kids_checkin: {
    label: "Daily Check-in",
    icon: "📝",
    description: "How was your day?",
    color: "#8b5cf6",
  },
};

export const ALL_MODES: KidsMode[] = [
  "kids_free_talk",
  "kids_story_time",
  "kids_calm_corner",
  "kids_learn",
  "kids_checkin",
];
