import type { NeuroPsychSession } from "../types";
import { TEST_CONFIGS } from "../types";

/**
 * Generate a printable clinical report using the browser print API.
 *
 * Opens a new window with a formatted HTML report and triggers print.
 */
export function printClinicalReport(session: NeuroPsychSession): void {
  const { patient, results, domain_scores } = session;

  const testRows = results.map((r) => {
    const cfg = TEST_CONFIGS[r.test_type];
    return `<tr>
      <td>${cfg?.label || r.test_type}</td>
      <td>${r.normative?.raw_score ?? "—"}</td>
      <td>${r.normative?.z_score ?? "—"}</td>
      <td>${r.normative?.percentile ?? "—"}</td>
      <td>${r.normative?.classification || "—"}</td>
    </tr>`;
  }).join("");

  const domainRows = domain_scores.map((d) => {
    return `<tr>
      <td style="text-transform:capitalize">${d.domain}</td>
      <td>${d.composite_z}</td>
      <td>${d.classification}</td>
      <td>${d.tests.length}</td>
    </tr>`;
  }).join("");

  const analysisSection = results
    .filter((r) => r.analysis)
    .map((r) => {
      const cfg = TEST_CONFIGS[r.test_type];
      return `<div style="margin-bottom:12px">
        <strong>${cfg?.label || r.test_type}:</strong>
        <p style="margin:4px 0 0 0;color:#444">${r.analysis}</p>
      </div>`;
    }).join("");

  const speechRows = results
    .filter((r) => r.speech_rate)
    .map((r) => {
      const cfg = TEST_CONFIGS[r.test_type];
      return `<tr>
        <td>${cfg?.label || r.test_type}</td>
        <td>${r.speech_rate!.words_per_minute}</td>
        <td>${r.speech_rate!.filler_rate}</td>
        <td>${r.speech_rate!.pause_count}</td>
        <td>${r.speech_rate!.total_pause_sec}</td>
      </tr>`;
    }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>UDS-3 Neuropsychological Report</title>
  <style>
    body { font-family: 'IBM Plex Sans', -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a2e; }
    h1 { font-size: 18px; border-bottom: 2px solid #1a4d8f; padding-bottom: 8px; color: #1a4d8f; }
    h2 { font-size: 14px; margin-top: 24px; color: #1a4d8f; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0; }
    th, td { padding: 6px 10px; border: 1px solid #d8dce6; text-align: left; }
    th { background: #f0f2f6; font-weight: 600; }
    .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .meta { font-size: 12px; color: #5a5f7a; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>UDS-3 Neuropsychological Test Battery Report</h1>
      <div class="meta">UCSF Memory and Aging Center &bull; Powered by Whissle STT Platform</div>
    </div>
    <div class="meta" style="text-align:right">
      <div>Date: ${new Date(session.started_at).toLocaleDateString()}</div>
      <div>Examiner: ${patient?.clinician_id || "—"}</div>
    </div>
  </div>

  <h2>Patient Demographics</h2>
  <table>
    <tr><th>Age</th><th>Education</th><th>Sex</th><th>Handedness</th><th>Language</th><th>Diagnosis</th></tr>
    <tr>
      <td>${patient?.age || "—"}</td>
      <td>${patient?.education_years || "—"} years</td>
      <td>${patient?.sex || "—"}</td>
      <td>${patient?.handedness || "—"}</td>
      <td>${patient?.primary_language || "—"}</td>
      <td>${patient?.diagnosis || "—"}</td>
    </tr>
  </table>

  <h2>Domain Summary</h2>
  <table>
    <tr><th>Domain</th><th>Composite Z</th><th>Classification</th><th>Tests</th></tr>
    ${domainRows}
  </table>

  <h2>Individual Test Results</h2>
  <table>
    <tr><th>Test</th><th>Raw Score</th><th>Z-Score</th><th>Percentile</th><th>Classification</th></tr>
    ${testRows}
  </table>

  ${analysisSection ? `<h2>Clinical Interpretation</h2>${analysisSection}` : ""}

  ${speechRows ? `
  <h2>Speech Production Markers</h2>
  <table>
    <tr><th>Test</th><th>WPM</th><th>Fillers/min</th><th>Pauses</th><th>Pause Duration (s)</th></tr>
    ${speechRows}
  </table>` : ""}

  ${session.examiner_notes ? `<h2>Examiner Notes</h2><p>${session.examiner_notes}</p>` : ""}
</body>
</html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  }
}
