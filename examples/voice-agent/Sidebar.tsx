import React from "react";
import { EMOTION_COLORS } from "@whissle/live-assist-core";
import type { SidebarMode } from "./lib/presets";
import type { ConversationMessage } from "./App";
import type { UploadedDocument } from "./lib/documents";
import type { ToolState, OrderItem } from "./lib/tools";

interface Props {
  mode: SidebarMode;
  messages: ConversationMessage[];
  documents: UploadedDocument[];
  toolState: ToolState;
}

export default function Sidebar({ mode, messages, documents, toolState }: Props) {
  return (
    <div className="session-sidebar">
      {mode === "order" && <OrderSidebar items={toolState.orderItems ?? []} confirmed={toolState.orderConfirmed ?? false} />}
      {mode === "emotion" && <EmotionSidebar messages={messages} />}
      {mode === "checklist" && <ChecklistSidebar checklist={toolState.checklist ?? []} flaggedIssues={toolState.flaggedIssues ?? []} />}
      {mode === "citations" && <CitationsSidebar messages={messages} documents={documents} />}
    </div>
  );
}

function OrderSidebar({ items, confirmed }: { items: OrderItem[]; confirmed: boolean }) {
  const total = items.reduce((sum, it) => sum + (it.price ?? 0) * it.quantity, 0);

  return (
    <div className="sidebar-section">
      <div className="sidebar-title">Order Summary</div>
      {items.length === 0 ? (
        <div className="sidebar-empty">No items yet</div>
      ) : (
        <div className="sidebar-order-list">
          {items.map((item, i) => (
            <div key={i} className="sidebar-order-item">
              <div className="sidebar-order-item-header">
                <span className="sidebar-order-item-qty">{item.quantity}x</span>
                <span className="sidebar-order-item-name">{item.item}</span>
                {item.price != null && <span className="sidebar-order-item-price">${(item.price * item.quantity).toFixed(2)}</span>}
              </div>
              {(item.size || item.modifiers?.length) && (
                <div className="sidebar-order-item-detail">
                  {item.size && <span>{item.size}</span>}
                  {item.modifiers?.map((m, j) => <span key={j}>{m}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <div className="sidebar-order-total">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      )}
      {confirmed && <div className="sidebar-order-confirmed">Order Confirmed</div>}
    </div>
  );
}

function EmotionSidebar({ messages }: { messages: ConversationMessage[] }) {
  const userMsgs = messages.filter((m) => m.role === "user" && m.emotion);
  const emotionCounts: Record<string, number> = {};
  const intentCounts: Record<string, number> = {};

  for (const msg of userMsgs) {
    if (msg.emotion) emotionCounts[msg.emotion] = (emotionCounts[msg.emotion] ?? 0) + 1;
    if (msg.intent) intentCounts[msg.intent] = (intentCounts[msg.intent] ?? 0) + 1;
  }

  const totalEmotions = Object.values(emotionCounts).reduce((s, v) => s + v, 0) || 1;
  const sortedEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]);
  const sortedIntents = Object.entries(intentCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const dominant = sortedEmotions[0];

  return (
    <div className="sidebar-section">
      <div className="sidebar-title">Voice Analytics</div>

      {sortedEmotions.length === 0 ? (
        <div className="sidebar-empty">Speak to see emotion analysis</div>
      ) : (
        <>
          {dominant && (
            <div className="sidebar-mood">
              <span className="sidebar-mood-label">Current Mood</span>
              <span className="sidebar-mood-value" style={{ color: EMOTION_COLORS[dominant[0]] || "#9ca3af" }}>
                {dominant[0].charAt(0) + dominant[0].slice(1).toLowerCase()}
              </span>
            </div>
          )}

          <div className="sidebar-subtitle">Emotion Breakdown</div>
          <div className="sidebar-bars">
            {sortedEmotions.map(([emotion, count]) => (
              <div key={emotion} className="sidebar-bar-row">
                <span className="sidebar-bar-label">{emotion.charAt(0) + emotion.slice(1).toLowerCase()}</span>
                <div className="sidebar-bar-track">
                  <div className="sidebar-bar-fill" style={{ width: `${(count / totalEmotions) * 100}%`, background: EMOTION_COLORS[emotion] || "#9ca3af" }} />
                </div>
                <span className="sidebar-bar-pct">{Math.round((count / totalEmotions) * 100)}%</span>
              </div>
            ))}
          </div>

          {sortedIntents.length > 0 && (
            <>
              <div className="sidebar-subtitle">Intent Distribution</div>
              <div className="sidebar-tags">
                {sortedIntents.map(([intent, count]) => (
                  <span key={intent} className="sidebar-intent-tag">
                    {intent.charAt(0) + intent.slice(1).toLowerCase().replace(/_/g, " ")}
                    <span className="sidebar-intent-count">{count}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ChecklistSidebar({ checklist, flaggedIssues }: { checklist: Array<{ id: string; label: string; checked: boolean }>; flaggedIssues: string[] }) {
  const completed = checklist.filter((c) => c.checked).length;

  return (
    <div className="sidebar-section">
      <div className="sidebar-title">Service Checklist</div>
      <div className="sidebar-checklist-progress">
        {completed}/{checklist.length} completed
      </div>
      <div className="sidebar-checklist">
        {checklist.map((item) => (
          <div key={item.id} className={`sidebar-checklist-item ${item.checked ? "sidebar-checklist-item--done" : ""}`}>
            <div className={`sidebar-check ${item.checked ? "sidebar-check--checked" : ""}`}>
              {item.checked && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      {flaggedIssues.length > 0 && (
        <>
          <div className="sidebar-subtitle" style={{ color: "var(--error)" }}>Flagged Issues</div>
          <div className="sidebar-flags">
            {flaggedIssues.map((issue, i) => (
              <div key={i} className="sidebar-flag">{issue}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CitationsSidebar({ messages, documents }: { messages: ConversationMessage[]; documents: UploadedDocument[] }) {
  const citedSet = new Set<string>();
  for (const msg of messages) {
    if (msg.citations) msg.citations.forEach((c) => citedSet.add(c));
  }

  return (
    <div className="sidebar-section">
      <div className="sidebar-title">Documents</div>
      {documents.length === 0 ? (
        <div className="sidebar-empty">No documents uploaded</div>
      ) : (
        <div className="sidebar-doc-list">
          {documents.map((doc) => (
            <div key={doc.id} className={`sidebar-doc ${citedSet.has(doc.name) ? "sidebar-doc--cited" : ""}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="sidebar-doc-name">{doc.name}</span>
              {citedSet.has(doc.name) && <span className="sidebar-doc-cited-badge">cited</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
