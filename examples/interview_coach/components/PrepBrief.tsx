import React, { useState, useEffect, useRef } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [gap, setGap] = useState<GapAnalysis | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    abortRef.current = abort;

    async function analyze() {
      try {
        const prompt = buildPrepPrompt(config.jdText, config.resumeText);
        const messages = [
          { role: "system" as const, content: "You are a career coach. Analyze the job description and resume. Return ONLY a JSON object." },
          { role: "user" as const, content: prompt },
        ];

        let fullText = "";
        const stream = streamAgentChat(config.agentUrl, messages, abort.signal);
        for await (const token of stream) {
          if (abort.signal.aborted) return;
          if (typeof token === "string") fullText += token;
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
    }

    analyze();
    return () => { abort.abort(); abortRef.current = null; };
  }, [config]);

  if (loading) {
    return (
      <div className="prep-root">
        <div className="prep-loading">
          <div className="prep-spinner" />
          <h2>Analyzing your profile...</h2>
          <p>Comparing JD requirements against your resume</p>
        </div>
      </div>
    );
  }

  return (
    <div className="prep-root">
      <div className="prep-header">
        <h1>Interview Prep Brief</h1>
        {error && <p className="prep-error">{error}</p>}
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
