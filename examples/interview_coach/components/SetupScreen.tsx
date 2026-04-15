import React, { useState, useCallback, useRef, useMemo } from "react";
import type { InterviewConfig } from "../App";
import type { Difficulty } from "../lib/roles";
import { loadSessionHistory } from "../lib/progress";
import { extractTextFromPdf } from "../lib/pdf";

interface Props {
  initialConfig: InterviewConfig;
  onDone: (config: InterviewConfig) => void;
}

const DIFFICULTIES: { id: Difficulty; label: string; desc: string }[] = [
  { id: "friendly", label: "Friendly", desc: "Encouraging" },
  { id: "standard", label: "Standard", desc: "Balanced" },
  { id: "tough", label: "Tough", desc: "Challenging" },
];

interface FileUploadProps {
  id: string;
  label: string;
  text: string;
  onChange: (text: string) => void;
  placeholder: string;
}

function FileUploadField({ id, label, text, onChange, placeholder }: FileUploadProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      setLoading(true);
      setFileName(file.name);
      try {
        const extracted = await extractTextFromPdf(file);
        if (extracted.trim()) {
          onChange(extracted);
        } else {
          setError("No text found in PDF.");
        }
      } catch (err) {
        setError("Failed to read PDF.");
        console.warn("PDF extraction error:", err);
      } finally {
        setLoading(false);
      }
    } else if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => onChange(reader.result as string);
      reader.readAsText(file);
    } else {
      setError("Upload a PDF or text file.");
    }

    if (fileRef.current) fileRef.current.value = "";
  }, [onChange]);

  return (
    <div className="setup-col">
      <label className="setup-label" htmlFor={id}>{label}</label>
      <div className="setup-upload-row">
        <button type="button" className="setup-upload-btn" onClick={() => fileRef.current?.click()} disabled={loading}>
          {loading ? "Extracting..." : "Upload PDF"}
        </button>
        {fileName && <span className="setup-upload-filename">{fileName}</span>}
        {error && <span className="setup-upload-error" role="alert">{error}</span>}
        <input ref={fileRef} type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={handleFile} hidden aria-label={`Upload file for ${label}`} />
      </div>
      <textarea
        id={id}
        className="setup-textarea"
        placeholder={placeholder}
        value={text}
        onChange={(e) => { onChange(e.target.value); setFileName(null); }}
      />
    </div>
  );
}

export default function SetupScreen({ initialConfig, onDone }: Props) {
  const [jdText, setJdText] = useState(initialConfig.jdText);
  const [resumeText, setResumeText] = useState(initialConfig.resumeText);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialConfig.difficulty);
  const [hints, setHints] = useState(initialConfig.hintsEnabled);
  const history = useMemo(() => loadSessionHistory(), []);

  const handleStart = useCallback(() => {
    onDone({ ...initialConfig, jdText, resumeText, difficulty, hintsEnabled: hints });
  }, [initialConfig, jdText, resumeText, difficulty, hints, onDone]);

  return (
    <div className="setup-root">
      <div className="setup-header">
        <div className="setup-logo">Whissle</div>
        <h1 className="setup-title">Interview Coach</h1>
        <p className="setup-subtitle">Practice interviews with real-time voice delivery coaching powered by Whissle</p>
      </div>

      <div className="setup-body">
        <FileUploadField
          id="setup-jd"
          label="Job Description (optional)"
          text={jdText}
          onChange={setJdText}
          placeholder="Paste the job posting here or upload a PDF. Skip for a general interview."
        />
        <FileUploadField
          id="setup-resume"
          label="Your Resume / CV (optional)"
          text={resumeText}
          onChange={setResumeText}
          placeholder="Paste your resume text here or upload a PDF. Skip for generic questions."
        />
      </div>

      <div className="setup-footer">
        <div className="setup-options-row">
          <div className="setup-difficulty-row" role="radiogroup" aria-label="Interview difficulty">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={difficulty === d.id}
                className={`setup-diff-btn ${difficulty === d.id ? "setup-diff-btn--active" : ""}`}
                onClick={() => setDifficulty(d.id)}
              >
                <span className="setup-diff-name">{d.label}</span>
                <span className="setup-diff-desc">{d.desc}</span>
              </button>
            ))}
          </div>
          <label className="setup-toggle-label">
            <input type="checkbox" checked={hints} onChange={(e) => setHints(e.target.checked)} />
            <span>Real-time hints</span>
          </label>
        </div>

        <button type="button" className="setup-start-btn" onClick={handleStart}>
          {jdText.trim() && resumeText.trim() ? "Analyze & Prepare →" : "Start Interview →"}
        </button>

        {history.length > 0 && (
          <div className="setup-history">
            <h3 className="setup-history-title">Recent Sessions</h3>
            {history.slice(-3).reverse().map((s) => (
              <div key={s.id} className="setup-history-item">
                <span className="setup-history-role">{s.role || "General"}</span>
                <span className="setup-history-score">{s.readinessScore}/100</span>
                <span className="setup-history-date">{s.date}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
