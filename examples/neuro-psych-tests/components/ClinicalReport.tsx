import React from "react";
import type { NeuroPsychSession } from "../lib/types";
import { TEST_CONFIGS } from "../lib/types";
import DomainSummary from "./DomainSummary";

interface Props {
  session: NeuroPsychSession;
  onExportNACC: () => void;
  onPrint: () => void;
  onNewSession: () => void;
}

export default function ClinicalReport({ session, onExportNACC, onPrint, onNewSession }: Props) {
  const { patient, results, domain_scores, examiner_notes } = session;

  return (
    <div className="app-content">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 600 }}>Clinical Report — UDS-3 Neuropsychological Battery</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={onPrint}>Print Report</button>
          <button className="btn btn-secondary btn-sm" onClick={onExportNACC}>Export NACC CSV</button>
          <button className="btn btn-primary btn-sm" onClick={onNewSession}>New Session</button>
        </div>
      </div>

      {patient && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h2>Patient Demographics</h2></div>
          <div className="form-row">
            <div><strong>Age:</strong> {patient.age}</div>
            <div><strong>Education:</strong> {patient.education_years} years</div>
            <div><strong>Sex:</strong> {patient.sex}</div>
            <div><strong>Handedness:</strong> {patient.handedness}</div>
          </div>
          <div className="form-row" style={{ marginTop: 8 }}>
            <div><strong>Language:</strong> {patient.primary_language}</div>
            <div><strong>Diagnosis:</strong> {patient.diagnosis || "—"}</div>
            <div><strong>Examiner:</strong> {patient.clinician_id || "—"}</div>
            <div><strong>Date:</strong> {new Date(session.started_at).toLocaleDateString()}</div>
          </div>
        </div>
      )}

      <DomainSummary domains={domain_scores} />

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><h2>Individual Test Results</h2></div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
              <th style={{ padding: "8px 12px" }}>Test</th>
              <th style={{ padding: "8px 12px" }}>Raw Score</th>
              <th style={{ padding: "8px 12px" }}>Z-Score</th>
              <th style={{ padding: "8px 12px" }}>%ile</th>
              <th style={{ padding: "8px 12px" }}>Classification</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const cfg = TEST_CONFIGS[r.test_type];
              return (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-light)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500 }}>{cfg?.label || r.test_type}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)" }}>{r.normative?.raw_score ?? "—"}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)" }}>{r.normative?.z_score ?? "—"}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)" }}>{r.normative?.percentile ?? "—"}</td>
                  <td style={{ padding: "8px 12px" }}>{r.normative?.classification || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {results.some((r) => r.analysis) && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header"><h2>Clinical Interpretation</h2></div>
          {results.filter((r) => r.analysis).map((r, i) => (
            <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < results.length - 1 ? "1px solid var(--border-light)" : "none" }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>{TEST_CONFIGS[r.test_type]?.label}</div>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, fontSize: "0.9rem" }}>{r.analysis}</p>
            </div>
          ))}
        </div>
      )}

      {results.some((r) => r.speech_rate) && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header"><h2>Speech Production Markers</h2></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "8px 12px" }}>Test</th>
                <th style={{ padding: "8px 12px" }}>WPM</th>
                <th style={{ padding: "8px 12px" }}>Fillers/min</th>
                <th style={{ padding: "8px 12px" }}>Pauses</th>
                <th style={{ padding: "8px 12px" }}>Total Pause (s)</th>
              </tr>
            </thead>
            <tbody>
              {results.filter((r) => r.speech_rate).map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-light)" }}>
                  <td style={{ padding: "8px 12px" }}>{TEST_CONFIGS[r.test_type]?.label}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)" }}>{r.speech_rate!.words_per_minute}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)" }}>{r.speech_rate!.filler_rate}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)" }}>{r.speech_rate!.pause_count}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)" }}>{r.speech_rate!.total_pause_sec}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
