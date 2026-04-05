import type { DateConfig } from "../App";

/**
 * Build the full context string sent to Live Assist for coaching.
 */
export function buildDateContextString(config: DateConfig): string {
  const parts: string[] = [];

  parts.push(`Date type: ${config.dateType}`);

  if (config.dateName) {
    parts.push(`Date's name: ${config.dateName}`);
  }

  if (config.dateContext) {
    parts.push(`Background: ${config.dateContext}`);
  }

  if (config.goals) {
    parts.push(`Goals: ${config.goals}`);
  }

  return parts.join("\n");
}

/**
 * Determine the Live Assist mode string from date type.
 */
export function dateTypeToMode(dateType: DateConfig["dateType"]): string {
  switch (dateType) {
    case "first-date":
    case "video-call":
    case "post-date-debrief":
      return "meeting";
    case "texting-coach":
      return "chat";
    default:
      return "meeting";
  }
}
