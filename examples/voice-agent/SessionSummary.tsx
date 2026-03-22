import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { EMOTION_COLORS, EMOTION_EMOJI } from "@whissle/live-assist-core";
import type { VoiceAgentConfig, ConversationMessage, EmotionTimelineEntry } from "./App";
import type { UploadedDocument } from "./lib/documents";
import type { ToolState } from "./lib/tools";

interface Props {
  config: VoiceAgentConfig;
  messages: ConversationMessage[];
  documents: UploadedDocument[];
  toolState: ToolState;
  audioBlob?: Blob;
  onBackToSetup: () => void;
  onNewSession: () => void;
}

function computeCSAT(emotionCounts: Record<string, number>): number {
  const happy = emotionCounts.HAPPY ?? 0;
  const neutral = emotionCounts.NEUTRAL ?? 0;
  const angry = emotionCounts.ANGRY ?? 0;
  const sad = emotionCounts.SAD ?? 0;
  const total = happy + neutral + angry + sad;
  if (total < 1) return 3.0;
  return 1 + 4 * ((happy + 0.5 * neutral) / total);
}

function renderStars(score: number): string {
  const full = Math.floor(score);
  const half = score - full >= 0.5;
  return "\u2605".repeat(full) + (half ? "\u00BD" : "") + "\u2606".repeat(5 - full - (half ? 1 : 0));
}

function fmtTime(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const CLARIFICATION_RE = /could you repeat|didn't (?:quite )?(?:catch|understand)|sorry,? i|which size|clarify|trouble understanding|little trouble/i;

export default function SessionSummary({ config, messages, documents, toolState, audioBlob, onBackToSetup, onNewSession }: Props) {
  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  const emotionCounts: Record<string, number> = {};
  const intentCounts: Record<string, number> = {};
  const allEntities: Array<{ entity: string; text: string }> = [];

  for (const msg of userMessages) {
    if (msg.emotion) emotionCounts[msg.emotion] = (emotionCounts[msg.emotion] ?? 0) + 1;
    if (msg.intent) intentCounts[msg.intent] = (intentCounts[msg.intent] ?? 0) + 1;
    if (msg.entities) allEntities.push(...msg.entities.filter((e) => e.text));
  }

  const sortedEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]);
  const sortedIntents = Object.entries(intentCounts).sort((a, b) => b[1] - a[1]);
  const uniqueEntities = [...new Map(allEntities.filter((e) => e.text).map((e) => [e.text.toLowerCase(), e])).values()];

  const isRestaurant = config.scenarioId === "restaurant-kiosk";
  const sessionStart = messages.length > 0 ? messages[0].timestamp : 0;
  const durationMs = messages.length >= 2
    ? messages[messages.length - 1].timestamp - sessionStart
    : 0;
  const durationSec = Math.round(durationMs / 1000);
  const durationMin = Math.floor(durationSec / 60);
  const durationSecRem = durationSec % 60;

  const clarifications = assistantMessages.filter((m) => CLARIFICATION_RE.test(m.content)).length;
  const clarityScore = userMessages.length > 0 ? Math.max(0, 1 - clarifications / userMessages.length) : 1;
  const csat = computeCSAT(emotionCounts);

  const orderTotal = (toolState.orderItems ?? []).reduce(
    (s, it) => s + (it.price ?? 0) * it.quantity, 0,
  );

  const intentFlow: string[] = [];
  for (const msg of userMessages) {
    if (msg.intent) {
      const label = msg.intent.charAt(0) + msg.intent.slice(1).toLowerCase().replace(/_/g, " ");
      if (intentFlow.length === 0 || intentFlow[intentFlow.length - 1] !== label) {
        intentFlow.push(label);
      }
    }
  }

  // Emotion timeline aggregation
  const allTimeline: EmotionTimelineEntry[] = userMessages
    .filter((m) => m.emotionTimeline)
    .flatMap((m) => m.emotionTimeline!);
  const timelineEmotionTotal = allTimeline.length || 1;

  const timelineSegments: { emotion: string; weight: number }[] = [];
  for (const entry of allTimeline) {
    const last = timelineSegments[timelineSegments.length - 1];
    if (last && last.emotion === entry.emotion) {
      last.weight += 1;
    } else {
      timelineSegments.push({ emotion: entry.emotion, weight: 1 });
    }
  }

  // Menu confusion detection
  const confusionPoints: { item: string; turns: number; hint: string }[] = [];
  if (isRestaurant && toolState.orderItems) {
    for (const item of toolState.orderItems) {
      let addMsgIdx = -1;
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].toolCalls?.some((tc) => tc.name === "add_to_order" && tc.arguments?.item === item.item)) {
          addMsgIdx = i;
          break;
        }
      }
      if (addMsgIdx < 0) continue;
      const windowStart = Math.max(0, addMsgIdx - 6);
      const windowMsgs = messages.slice(windowStart, addMsgIdx + 1);
      const windowClarifications = windowMsgs.filter(
        (m) => m.role === "assistant" && CLARIFICATION_RE.test(m.content),
      ).length;
      const windowNegativeEmo = windowMsgs.filter(
        (m) => m.role === "user" && (m.emotion === "FEAR" || m.emotion === "SAD"),
      ).length;
      if (windowClarifications >= 2 || windowNegativeEmo >= 2) {
        confusionPoints.push({
          item: item.item,
          turns: windowClarifications + windowNegativeEmo,
          hint: windowClarifications >= 2 ? "took multiple attempts to clarify" : "customer seemed uncertain",
        });
      }
    }
  }

  // Transcript segments with time boundaries relative to session start
  const transcriptSegments = useMemo(() => {
    return messages.map((msg) => ({
      ...msg,
      offsetMs: sessionStart > 0 ? msg.timestamp - sessionStart : 0,
    }));
  }, [messages, sessionStart]);

  // Audio player
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrl = useMemo(() => audioBlob ? URL.createObjectURL(audioBlob) : null, [audioBlob]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const effectiveDuration = (audioDuration > 0 && isFinite(audioDuration)) ? audioDuration : (durationMs > 0 ? durationMs / 1000 : 0);
  const [activeSegIdx, setActiveSegIdx] = useState(-1);

  useEffect(() => {
    return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  const handlePlayPause = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) { el.play(); setIsPlaying(true); }
    else { el.pause(); setIsPlaying(false); }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (!el || !effectiveDuration) return;
    setPlayProgress(el.currentTime / effectiveDuration);

    const currentMs = el.currentTime * 1000;
    let idx = -1;
    for (let i = transcriptSegments.length - 1; i >= 0; i--) {
      if (transcriptSegments[i].offsetMs <= currentMs) { idx = i; break; }
    }
    setActiveSegIdx(idx);
  }, [effectiveDuration, transcriptSegments]);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !effectiveDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * effectiveDuration;
    setPlayProgress(pct);
  }, [effectiveDuration]);

  const handleSegmentClick = useCallback((offsetMs: number) => {
    const el = audioRef.current;
    if (!el || !effectiveDuration) return;
    el.currentTime = effectiveDuration * (durationMs > 0 ? offsetMs / durationMs : 0);
    if (el.paused) { el.play(); setIsPlaying(true); }
  }, [effectiveDuration, durationMs]);

  const handleMoodTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !effectiveDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * effectiveDuration;
    setPlayProgress(pct);
    if (el.paused) { el.play(); setIsPlaying(true); }
  }, [effectiveDuration]);

  return (
    <div className="summary-root">
      <div className="summary-container">
        <div className="summary-header">
          <h2>Session Summary</h2>
          <span className="summary-meta">{messages.length} messages &middot; {durationMin}:{String(durationSecRem).padStart(2, "0")} duration</span>
        </div>

        {/* Analytics Cards */}
        {(isRestaurant || config.enableMetadata) && (
          <div className="summary-analytics-grid">
            {config.enableMetadata && sortedEmotions.length > 0 && (
              <div className="summary-card">
                <h4>Customer Satisfaction</h4>
                <div className="summary-csat-score">
                  <span className="summary-csat-number">{csat.toFixed(1)}</span>
                  <span className="summary-csat-max">/ 5.0</span>
                </div>
                <div className="summary-csat-stars">{renderStars(csat)}</div>
                <div className="summary-csat-note">Based on voice behavioral analysis</div>
              </div>
            )}

            {isRestaurant && (
              <div className="summary-card">
                <h4>Order Intelligence</h4>
                <div className="summary-metric-list">
                  <div className="summary-metric-item">
                    <span className="summary-metric-label">Duration</span>
                    <span className="summary-metric-value">{durationMin}:{String(durationSecRem).padStart(2, "0")}</span>
                  </div>
                  <div className="summary-metric-item">
                    <span className="summary-metric-label">Turns</span>
                    <span className="summary-metric-value">{userMessages.length} exchanges</span>
                  </div>
                  <div className="summary-metric-item">
                    <span className="summary-metric-label">Clarity</span>
                    <span className="summary-metric-value">{Math.round(clarityScore * 100)}% ({clarifications} clarification{clarifications !== 1 ? "s" : ""})</span>
                  </div>
                  <div className="summary-metric-item">
                    <span className="summary-metric-label">Items</span>
                    <span className="summary-metric-value">{(toolState.orderItems ?? []).length} items, ${orderTotal.toFixed(2)}</span>
                  </div>
                </div>
                {intentFlow.length > 1 && (
                  <div className="summary-intent-flow" style={{ marginTop: 10 }}>
                    {intentFlow.slice(0, 8).map((step, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span className="summary-intent-flow-arrow">&rarr;</span>}
                        <span className="summary-intent-flow-step">{step}</span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Audio Player + Transcript */}
        {audioUrl && (
          <div className="summary-section">
            <h3>Session Recording</h3>
            <audio
              ref={audioRef}
              src={audioUrl}
              onLoadedMetadata={() => {
                const el = audioRef.current;
                if (!el) return;
                if (isFinite(el.duration) && el.duration > 0) {
                  setAudioDuration(el.duration);
                } else {
                  el.currentTime = 1e8;
                  const fix = () => {
                    el.removeEventListener("timeupdate", fix);
                    if (isFinite(el.duration) && el.duration > 0) {
                      setAudioDuration(el.duration);
                    }
                    el.currentTime = 0;
                  };
                  el.addEventListener("timeupdate", fix, { once: true });
                }
              }}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => { setIsPlaying(false); setPlayProgress(0); }}
            />
            <div className="summary-audio-player">
              <div className="summary-audio-controls">
                <button type="button" className="summary-audio-play-btn" onClick={handlePlayPause}>
                  {isPlaying ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  )}
                </button>
                <div className="summary-audio-timeline" onClick={handleTimelineClick}>
                  <div className="summary-audio-progress" style={{ width: `${playProgress * 100}%` }} />
                </div>
                <span className="summary-audio-time">
                  {fmtTime((audioRef.current?.currentTime ?? 0) * 1000)} / {fmtTime(effectiveDuration * 1000)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Mood Over Time */}
        {config.enableMetadata && timelineSegments.length > 0 && (
          <div className="summary-section">
            <h3>Mood Over Time</h3>
            <div className="summary-emotion-timeline" onClick={audioUrl ? handleMoodTimelineClick : undefined} style={audioUrl ? { cursor: "pointer" } : undefined}>
              {timelineSegments.map((seg, i) => (
                <div
                  key={i}
                  className="summary-emotion-timeline-seg"
                  style={{
                    width: `${(seg.weight / timelineEmotionTotal) * 100}%`,
                    background: EMOTION_COLORS[seg.emotion] || "#9ca3af",
                  }}
                  title={`${seg.emotion}: ${seg.weight} window${seg.weight > 1 ? "s" : ""}`}
                />
              ))}
            </div>
            <div className="summary-tags" style={{ marginTop: 8 }}>
              {Object.entries(
                timelineSegments.reduce<Record<string, number>>((acc, s) => {
                  acc[s.emotion] = (acc[s.emotion] ?? 0) + s.weight;
                  return acc;
                }, {}),
              ).sort((a, b) => b[1] - a[1]).map(([emo]) => (
                <span key={emo} className="summary-intent-tag" style={{ borderColor: EMOTION_COLORS[emo], color: EMOTION_COLORS[emo] }}>
                  {EMOTION_EMOJI[emo] || ""} {emo.charAt(0) + emo.slice(1).toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Transcript with Time Boundaries */}
        <div className="summary-section">
          <h3>Conversation</h3>
          <div className="summary-transcript-segments">
            {transcriptSegments.map((seg, i) => (
              <div
                key={seg.id}
                className={`summary-transcript-seg summary-transcript-seg--${seg.role} ${i === activeSegIdx ? "summary-transcript-seg--active" : ""}`}
                onClick={() => audioUrl && handleSegmentClick(seg.offsetMs)}
                style={audioUrl ? { cursor: "pointer" } : undefined}
              >
                <span className="summary-transcript-seg-time">{fmtTime(seg.offsetMs)}</span>
                <span className="summary-transcript-seg-role">{seg.role === "user" ? "Y" : "A"}</span>
                <span className="summary-transcript-seg-text">{seg.content}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Menu Intelligence */}
        {isRestaurant && confusionPoints.length > 0 && (
          <div className="summary-section">
            <h3>Menu Intelligence</h3>
            <div>
              {confusionPoints.map((cp, i) => (
                <div key={i} className="summary-confusion-item">
                  <span className="summary-confusion-icon">&#9888;</span>
                  <span className="summary-confusion-text">
                    <strong>&ldquo;{cp.item}&rdquo;</strong> &mdash; {cp.hint} ({cp.turns} signals)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Order Receipt */}
        {isRestaurant && toolState.orderItems && toolState.orderItems.length > 0 && (
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
                <span>${orderTotal.toFixed(2)}</span>
              </div>
              {toolState.orderConfirmed && <div className="summary-confirmed">Confirmed</div>}
            </div>
          </div>
        )}

        {/* Service Scorecard */}
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

        {/* Intent Distribution */}
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

        {/* Actions */}
        <div className="summary-actions">
          <button type="button" className="summary-btn summary-btn--primary" onClick={onNewSession}>New Session</button>
          <button type="button" className="summary-btn summary-btn--secondary" onClick={onBackToSetup}>Back to Setup</button>
        </div>
      </div>
    </div>
  );
}
