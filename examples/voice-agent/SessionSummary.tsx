import React from "react";
import { EMOTION_COLORS } from "@whissle/live-assist-core";
import type { VoiceAgentConfig, ConversationMessage } from "./App";
import type { UploadedDocument } from "./lib/documents";
import type { ToolState } from "./lib/tools";

interface Props {
  config: VoiceAgentConfig;
  messages: ConversationMessage[];
  documents: UploadedDocument[];
  toolState: ToolState;
  onBackToSetup: () => void;
  onNewSession: () => void;
}

export default function SessionSummary({ config, messages, documents, toolState, onBackToSetup, onNewSession }: Props) {
  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  const emotionCounts: Record<string, number> = {};
  const intentCounts: Record<string, number> = {};
  const allEntities: Array<{ entity: string; text: string }> = [];

  for (const msg of userMessages) {
    if (msg.emotion) emotionCounts[msg.emotion] = (emotionCounts[msg.emotion] ?? 0) + 1;
    if (msg.intent) intentCounts[msg.intent] = (intentCounts[msg.intent] ?? 0) + 1;
    if (msg.entities) allEntities.push(...msg.entities);
  }

  const totalEmotions = Object.values(emotionCounts).reduce((s, v) => s + v, 0) || 1;
  const sortedEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]);
  const sortedIntents = Object.entries(intentCounts).sort((a, b) => b[1] - a[1]);
  const uniqueEntities = [...new Map(allEntities.map((e) => [e.text.toLowerCase(), e])).values()];

  return (
    <div className="summary-root">
      <div className="summary-container">
        <div className="summary-header">
          <h2>Session Summary</h2>
          <span className="summary-meta">{messages.length} messages &middot; {userMessages.length} from you</span>
        </div>

        {/* Scenario-specific summary */}
        {config.scenarioId === "restaurant-kiosk" && toolState.orderItems && toolState.orderItems.length > 0 && (
          <div className="summary-section">
            <h3>Order Receipt</h3>
            <div className="summary-receipt">
              {toolState.orderItems.map((item, i) => (
                <div key={i} className="summary-receipt-item">
                  <span>{item.quantity}x {item.item}{item.size ? ` (${item.size})` : ""}</span>
                  {item.price != null && <span>${(item.price * item.quantity).toFixed(2)}</span>}
                </div>
              ))}
              <div className="summary-receipt-total">
                <span>Total</span>
                <span>${toolState.orderItems.reduce((s, it) => s + (it.price ?? 0) * it.quantity, 0).toFixed(2)}</span>
              </div>
              {toolState.orderConfirmed && <div className="summary-confirmed">Confirmed</div>}
            </div>
          </div>
        )}

        {config.scenarioId === "customer-service" && toolState.checklist && (
          <div className="summary-section">
            <h3>Service Scorecard</h3>
            <div className="summary-checklist">
              {toolState.checklist.map((item) => (
                <div key={item.id} className={`summary-check-item ${item.checked ? "summary-check-item--done" : ""}`}>
                  <span className={`summary-check-icon ${item.checked ? "summary-check-icon--done" : ""}`}>
                    {item.checked ? "\u2713" : "\u2717"}
                  </span>
                  {item.label}
                </div>
              ))}
            </div>
            <div className="summary-score">
              Score: {toolState.checklist.filter((c) => c.checked).length}/{toolState.checklist.length}
            </div>
            {toolState.flaggedIssues && toolState.flaggedIssues.length > 0 && (
              <div className="summary-flags">
                <h4>Flagged Issues</h4>
                {toolState.flaggedIssues.map((issue, i) => (
                  <div key={i} className="summary-flag">{issue}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Emotion breakdown */}
        {config.enableMetadata && sortedEmotions.length > 0 && (
          <div className="summary-section">
            <h3>Emotion Breakdown</h3>
            <div className="summary-emotion-bars">
              {sortedEmotions.map(([emotion, count]) => (
                <div key={emotion} className="summary-bar-row">
                  <span className="summary-bar-label">{emotion.charAt(0) + emotion.slice(1).toLowerCase()}</span>
                  <div className="summary-bar-track">
                    <div className="summary-bar-fill" style={{ width: `${(count / totalEmotions) * 100}%`, background: EMOTION_COLORS[emotion] || "#9ca3af" }} />
                  </div>
                  <span className="summary-bar-pct">{Math.round((count / totalEmotions) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Intent distribution */}
        {config.enableMetadata && sortedIntents.length > 0 && (
          <div className="summary-section">
            <h3>Intent Distribution</h3>
            <div className="summary-tags">
              {sortedIntents.map(([intent, count]) => (
                <span key={intent} className="summary-intent-tag">
                  {intent.charAt(0) + intent.slice(1).toLowerCase().replace(/_/g, " ")} ({count})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Entities */}
        {uniqueEntities.length > 0 && (
          <div className="summary-section">
            <h3>Key Entities</h3>
            <div className="summary-tags">
              {uniqueEntities.slice(0, 20).map((ent, i) => (
                <span key={i} className="summary-entity-tag">{ent.text}</span>
              ))}
            </div>
          </div>
        )}

        {/* Transcript */}
        <div className="summary-section">
          <h3>Conversation</h3>
          <div className="summary-transcript">
            {messages.map((msg) => (
              <div key={msg.id} className={`summary-turn summary-turn--${msg.role}`}>
                <span className="summary-turn-role">{msg.role === "user" ? "You" : "AI"}</span>
                <span className="summary-turn-text">{msg.content}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="summary-actions">
          <button type="button" className="summary-btn summary-btn--primary" onClick={onNewSession}>New Session</button>
          <button type="button" className="summary-btn summary-btn--secondary" onClick={onBackToSetup}>Back to Setup</button>
        </div>
      </div>
    </div>
  );
}
