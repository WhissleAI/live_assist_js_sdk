import React from "react";
import type { TestResult } from "../lib/types";
import { TEST_CONFIGS } from "../lib/types";

interface Props {
  results: TestResult[];
  onContinue: () => void;
}

function classificationBadge(classification: string) {
  if (classification.includes("Normal") && !classification.includes("Low")) return "badge-normal";
  if (classification.includes("Low") || classification.includes("Borderline")) return "badge-low-normal";
  return "badge-impaired";
}

export default function ScoringDashboard({ results, onContinue }: Props) {
  return (
    <div className="app-content">
      <div className="card">
        <div className="card-header">
          <h2>Test Scores</h2>
          <span className="badge badge-info">{results.length} tests completed</span>
        </div>

        <div className="score-grid">
          {results.map((r, i) => {
            const cfg = TEST_CONFIGS[r.test_type];
            const raw = r.normative?.raw_score ?? "—";
            const z = r.normative?.z_score;
            const cls = r.normative?.classification || "Pending";

            return (
              <div key={i} className="score-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div className="score-value">{raw}</div>
                    <div className="score-label">{cfg?.label || r.test_type}</div>
                  </div>
                  <span className={`badge ${classificationBadge(cls)}`}>{cls}</span>
                </div>
                {z != null && (
                  <div className="score-detail">
                    z = {z} &middot; {r.normative?.percentile != null ? `${r.normative.percentile}th %ile` : ""}
                  </div>
                )}
                {r.analysis && (
                  <div className="score-detail" style={{ marginTop: 8, borderTop: "1px solid var(--border-light)", paddingTop: 8 }}>
                    {r.analysis.slice(0, 200)}{r.analysis.length > 200 ? "..." : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 24, textAlign: "right" }}>
          <button className="btn btn-primary btn-lg" onClick={onContinue}>
            View Full Report
          </button>
        </div>
      </div>
    </div>
  );
}
