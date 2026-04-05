import React, { useState, useRef, useCallback } from "react";
import type { DateConfig, DateType } from "../App";

interface Props {
  config: DateConfig;
  onDone: (config: DateConfig) => void;
}

const DATE_TYPES: { value: DateType; label: string; desc: string }[] = [
  { value: "first-date", label: "First Date", desc: "In-person or casual meetup" },
  { value: "video-call", label: "Video Call", desc: "FaceTime, Zoom, or video date" },
  { value: "texting-coach", label: "Text Coach", desc: "Get help with messaging" },
  { value: "post-date-debrief", label: "Post-Date Debrief", desc: "Analyze how it went" },
];

export default function SetupScreen({ config, onDone }: Props) {
  const [form, setForm] = useState({
    userName: config.userName,
    userPersonality: config.userPersonality,
    dateName: config.dateName,
    dateContext: config.dateContext,
    dateType: config.dateType,
    goals: config.goals,
    contextFilters: { ...config.contextFilters },
  });

  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handleRecordVoice = useCallback(async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        setRecordingStatus("Analyzing your voice...");

        try {
          const formData = new FormData();
          formData.append("audio", blob, "intro.webm");
          formData.append("user_name", form.userName || "User");

          const agentUrl = config.agentUrl.replace(/\/$/, "");
          const res = await fetch(`${agentUrl}/personality`, {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            if (data.success && data.personality) {
              setForm((prev) => ({ ...prev, userPersonality: data.personality }));
              setRecordingStatus("Profile generated!");
            } else {
              setRecordingStatus("Could not generate profile. Try again.");
            }
          } else {
            setRecordingStatus("Server error. Try again.");
          }
        } catch {
          setRecordingStatus("Network error. You can type your personality manually.");
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingStatus("Recording... speak for 30 seconds about yourself");

      // Auto-stop after 35 seconds
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
        }
      }, 35000);
    } catch {
      setRecordingStatus("Microphone access denied");
    }
  }, [isRecording, form.userName, config.agentUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onDone({
      ...config,
      ...form,
    });
  };

  return (
    <div className="setup-root">
      <div className="setup-hero">
        <h1>Set Up Your Date</h1>
        <p>Let's get you ready for a great conversation.</p>
      </div>

      <form className="setup-form" onSubmit={handleSubmit}>
        {/* Your Profile */}
        <section className="setup-section">
          <h2>About You</h2>

          <label className="setup-label">
            Your Name
            <input
              type="text"
              className="setup-input"
              value={form.userName}
              onChange={(e) => setForm((p) => ({ ...p, userName: e.target.value }))}
              placeholder="Your name"
            />
          </label>

          <div className="setup-voice-profile">
            <label className="setup-label">Your Personality Profile</label>
            <p className="setup-hint">
              Record a 30-second voice intro or type a description of your personality.
            </p>
            <button
              type="button"
              className={`setup-record-btn ${isRecording ? "setup-record-btn--active" : ""}`}
              onClick={handleRecordVoice}
            >
              {isRecording ? "Stop Recording" : "Record Voice Intro"}
            </button>
            {recordingStatus && <p className="setup-recording-status">{recordingStatus}</p>}
            <textarea
              className="setup-textarea"
              rows={3}
              value={form.userPersonality}
              onChange={(e) => setForm((p) => ({ ...p, userPersonality: e.target.value }))}
              placeholder="e.g., I'm outgoing, curious, love deep conversations and making people laugh..."
            />
          </div>
        </section>

        {/* Date Context */}
        <section className="setup-section">
          <h2>About Your Date</h2>

          <label className="setup-label">
            Their Name
            <input
              type="text"
              className="setup-input"
              value={form.dateName}
              onChange={(e) => setForm((p) => ({ ...p, dateName: e.target.value }))}
              placeholder="Who are you meeting?"
            />
          </label>

          <label className="setup-label">
            What do you know about them?
            <textarea
              className="setup-textarea"
              rows={3}
              value={form.dateContext}
              onChange={(e) => setForm((p) => ({ ...p, dateContext: e.target.value }))}
              placeholder="Where you met, shared interests, anything you know..."
            />
          </label>
        </section>

        {/* Date Type */}
        <section className="setup-section">
          <h2>Date Type</h2>
          <div className="setup-date-types">
            {DATE_TYPES.map((dt) => (
              <button
                key={dt.value}
                type="button"
                className={`setup-type-card ${form.dateType === dt.value ? "setup-type-card--active" : ""}`}
                onClick={() => setForm((p) => ({ ...p, dateType: dt.value }))}
              >
                <strong>{dt.label}</strong>
                <span>{dt.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Goals */}
        <section className="setup-section">
          <h2>Your Goals</h2>
          <textarea
            className="setup-textarea"
            rows={2}
            value={form.goals}
            onChange={(e) => setForm((p) => ({ ...p, goals: e.target.value }))}
            placeholder="What do you want from this date? (fun, serious connection, second date, etc.)"
          />
        </section>

        {/* Context Sources */}
        <section className="setup-section">
          <h2>Connect Your Data</h2>
          <p className="setup-hint">Pull context from other Whissle apps for better coaching.</p>
          <div className="setup-toggles">
            {(["memories", "calendar", "notes"] as const).map((key) => (
              <label key={key} className="setup-toggle">
                <input
                  type="checkbox"
                  checked={form.contextFilters[key]}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      contextFilters: { ...p.contextFilters, [key]: e.target.checked },
                    }))
                  }
                />
                <span className="setup-toggle-label">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
              </label>
            ))}
          </div>
        </section>

        <button type="submit" className="setup-submit-btn">
          {form.dateType === "texting-coach" ? "Start Text Coach" : "Get Pre-Date Brief"}
        </button>
      </form>
    </div>
  );
}
