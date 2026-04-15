import type { StoredSession } from "./session-store";

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function exportSessionCsv(session: StoredSession): void {
  const annotations = session.annotations ?? {};
  const headers = [
    "Segment ID",
    "Speaker",
    "Original Text",
    "Timestamp (ms)",
    "Offset (sec)",
    "Emotion",
    "Emotion Confidence",
    "Emotion Probs",
    "Intent",
    "Bookmarked",
    "Note",
    "Tags",
    "Edited Text",
  ];

  const rows = session.transcript.map((seg) => {
    const ann = annotations[seg.id];
    const emotionProbs = seg.emotionProbs
      ?.filter((p) => p.probability > 0.01)
      .map((p) => `${p.emotion}:${Math.round(p.probability * 100)}%`)
      .join("; ") ?? "";

    return [
      seg.id,
      seg.speaker,
      seg.text,
      String(seg.timestamp),
      String(seg.audioOffsetSec ?? ""),
      seg.emotion ?? "",
      seg.emotionConfidence != null ? String(Math.round(seg.emotionConfidence * 100)) : "",
      emotionProbs,
      seg.intent ?? "",
      ann?.bookmarked ? "Yes" : "",
      ann?.note ?? "",
      ann?.tags?.join("; ") ?? "",
      ann?.editedText ?? "",
    ].map(escapeCsv).join(",");
  });

  // Append agent emotion timeline as a second sheet/section
  const timelineHeaders = ["Offset (ms)", "Emotion", "Confidence", "Emotion Probs"];
  const agentTimeline = session.agentEmotionTimeline ?? [];
  const timelineRows = agentTimeline.map((entry) => {
    const probs = entry.probs
      ?.filter((p) => p.probability > 0.01)
      .map((p) => `${p.emotion}:${Math.round(p.probability * 100)}%`)
      .join("; ") ?? "";
    return [
      String(entry.offset),
      entry.emotion,
      String(Math.round(entry.confidence * 100)),
      probs,
    ].map(escapeCsv).join(",");
  });

  let csv = [headers.join(","), ...rows].join("\n");
  if (timelineRows.length > 0) {
    csv += "\n\n# Agent Emotion Timeline\n" + timelineHeaders.join(",") + "\n" + timelineRows.join("\n");
  }
  if (session.aiSummary) {
    csv += "\n\n# AI Summary\n" + escapeCsv(session.aiSummary);
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const datePart = new Date(session.date).toISOString().slice(0, 10);
  a.download = `session-${session.agentName || "agent"}-${datePart}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSessionJson(session: StoredSession): void {
  const data = JSON.stringify(session, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const datePart = new Date(session.date).toISOString().slice(0, 10);
  a.download = `session-${session.agentName || "agent"}-${datePart}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
