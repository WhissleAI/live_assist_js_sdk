import React, { useEffect, useRef } from "react";

interface Props {
  feedbackText: string;
  suggestions: string[];
  keywords: string[];
}

export default function CoachingSidebar({ feedbackText, suggestions, keywords }: Props) {
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedbackRef.current) {
      feedbackRef.current.scrollTop = feedbackRef.current.scrollHeight;
    }
  }, [feedbackText]);

  return (
    <div className="coaching-sidebar">
      <div className="coaching-section">
        <h3 className="coaching-section-title">Live Coaching</h3>
        <div className="coaching-feedback" ref={feedbackRef}>
          {feedbackText || (
            <span className="coaching-placeholder">
              Listening to your conversation... coaching tips will appear here.
            </span>
          )}
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="coaching-section">
          <h3 className="coaching-section-title">Suggestions</h3>
          <ul className="coaching-suggestions">
            {suggestions.map((s, i) => (
              <li key={i} className="coaching-suggestion">{s}</li>
            ))}
          </ul>
        </div>
      )}

      {keywords.length > 0 && (
        <div className="coaching-section">
          <h3 className="coaching-section-title">Key Topics</h3>
          <div className="coaching-keywords">
            {keywords.map((kw, i) => (
              <span key={i} className="coaching-keyword">{kw}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
