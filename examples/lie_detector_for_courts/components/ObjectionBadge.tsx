import React from "react";
import type { ObjectionType } from "../lib/types";

const TYPE_LABELS: Record<ObjectionType, { label: string; color: string }> = {
  HEARSAY: { label: "Hearsay", color: "var(--color-red)" },
  SPECULATION: { label: "Speculation", color: "var(--color-amber)" },
  NON_RESPONSIVE: { label: "Non-Responsive", color: "var(--color-amber)" },
  LEADING: { label: "Leading", color: "var(--color-blue)" },
  NARRATIVE: { label: "Narrative", color: "var(--color-amber)" },
  ASSUMES_FACTS: { label: "Assumes Facts", color: "var(--color-red)" },
  RELEVANCE: { label: "Relevance", color: "var(--color-muted)" },
  COMPOUND: { label: "Compound", color: "var(--color-muted)" },
};

interface Props {
  type: ObjectionType;
  compact?: boolean;
}

export default function ObjectionBadge({ type, compact }: Props) {
  const config = TYPE_LABELS[type] ?? { label: type, color: "var(--color-muted)" };
  return (
    <span
      className={`objection-badge ${compact ? "objection-badge--compact" : ""}`}
      style={{ borderColor: config.color, color: config.color }}
    >
      {config.label}
    </span>
  );
}
