import React, { useState, useEffect, useRef, useCallback } from "react";
import type { InterviewConfig } from "../App";
import type { GapAnalysis } from "../lib/prep";
import { buildPrepPrompt, parsePrepResponse } from "../lib/prep";
import { streamAgentChat } from "../lib/agent-stream";

interface Props {
  config: InterviewConfig;
  onDone: (gap: GapAnalysis) => void;
  onSkip: () => void;
  onBack: () => void;
}

export default function PrepBrief({ config, onDone, onSkip, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [streamProgress, setStreamProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [gap, setGap] = useState<GapAnalysis | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const runAnalysis = useCallback(async (abort: AbortController) => {
    setLoading(true);
    setStreamProgress(0);
    setError(null);
    setGap(null);

    try {
      const prompt = buildPrepPrompt(config.jdText, config.resumeText);
      const messages = [
        { role: "system" as const, content: "You are a career coach. Analyze the job description and resume. Return ONLY a JSON object." },
        { role: "user" as const, content: prompt },
      ];

      let fullText = "";
      let chunkCount = 0;
      const stream = streamAgentChat(config.agentUrl, messages, abort.signal, { max_tokens: 4096, temperature: 0.3 });
      for await (const token of stream) {
        if (abort.signal.aborted) return;
        if (typeof token === "string") {
          fullText += token;
          chunkCount++;
          setStreamProgress(Math.min(chunkCount * 3, 90));
        }
      }

      if (abort.signal.aborted) return;

      const parsed = parsePrepResponse(fullText);
      if (parsed) {
        setGap(parsed);
      } else {
        setError("Could not parse analysis. You can still start the interview.");
      }
      setLoading(false);
    } catch (err: unknown) {
      if (abort.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Analysis failed");
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    const abort = new AbortController();
    abortRef.current = abort;
    runAnalysis(abort);
    return () => { abort.abort(); abortRef.current = null; };
  }, [runAnalysis, retryCount]);

  const handleRetry = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setRetryCount((c) => c + 1);
  }, []);

  if (loading) {
    return (
      <div className="prep-root">
        <div className="prep-loading" role="status" aria-label="Analyzing your profile">
          <div className="prep-spinner" />
          <h2>Analyzing your profile...</h2>
          <p>Comparing JD requirements against your resume</p>
          {streamProgress > 0 && (
            <div className="prep-progress-bar">
              <div className="prep-progress-fill" style={{ width: `${streamProgress}%` }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="prep-root">
      <div className="prep-header">
        <h1>Interview Prep Brief</h1>
        {error && (
          <div className="prep-error-row">
            <p className="prep-error">{error}</p>
            <button type="button" className="prep-retry-btn" onClick={handleRetry}>Retry Analysis</button>
          </div>
        )}
      </div>

      <div className="prep-scroll">
        <div className="prep-scroll-inner">
          {gap && (
            <>
              <div className="prep-section">
                <h2 className="prep-section-title">Skills Match</h2>
                <div className="prep-skills">
                  {gap.skillsMatch.map((s, i) => (
                    <div key={i} className={`prep-skill prep-skill--${s.status}`}>
                      <span className="prep-skill-icon">
                        {s.status === "match" ? "✓" : s.status === "partial" ? "△" : "✗"}
                      </span>
                      <span className="prep-skill-name">{s.skill}</span>
                      <span className="prep-skill-note">{s.note}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="prep-section">
                <h2 className="prep-section-title">What They'll Probe</h2>
                <ol className="prep-list">
                  {gap.probeAreas.map((area, i) => <li key={i}>{area}</li>)}
                </ol>
              </div>

              <div className="prep-section">
                <h2 className="prep-section-title">Your Talking Points</h2>
                <ul className="prep-list prep-list--tips">
                  {gap.talkingPoints.map((tp, i) => <li key={i}>{tp}</li>)}
                </ul>
              </div>

              <div className="prep-section">
                <h2 className="prep-section-title">Predicted Questions</h2>
                <ol className="prep-list">
                  {gap.predictedQuestions.map((q, i) => <li key={i}>{q}</li>)}
                </ol>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="prep-footer">
        <button type="button" className="prep-btn prep-btn--primary" onClick={() => gap ? onDone(gap) : onSkip()}>
          Start Interview →
        </button>
        <button type="button" className="prep-btn prep-btn--secondary" onClick={onBack}>
          ← Edit Inputs
        </button>
      </div>
    </div>
  );
}
