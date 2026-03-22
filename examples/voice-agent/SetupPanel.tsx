import React, { useState, useCallback, useRef } from "react";
import type { VoiceAgentConfig } from "./App";
import type { UploadedDocument } from "./lib/documents";
import { isSupported, extractText, extractMenuFromServer, generateId, isPdf, isImage } from "./lib/documents";
import { PRESETS, getPreset } from "./lib/presets";

interface Props {
  initialConfig: VoiceAgentConfig;
  initialDocuments: UploadedDocument[];
  onStart: (config: VoiceAgentConfig, documents: UploadedDocument[]) => void;
}

const VOICES = [
  { id: "cove", label: "Cove" },
  { id: "luna", label: "Luna" },
  { id: "astra", label: "Astra" },
  { id: "allison", label: "Allison" },
  { id: "abbie", label: "Abbie" },
  { id: "celeste", label: "Celeste" },
];

const TTS_MODELS = [
  { id: "mistv2", label: "Mist v2 (recommended)" },
  { id: "mist", label: "Mist v1" },
  { id: "arcana", label: "Arcana" },
];

const PRESET_ICONS: Record<string, React.ReactNode> = {
  chat: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  restaurant: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" x2="6" y1="1" y2="4" /><line x1="10" x2="10" y1="1" y2="4" /><line x1="14" x2="14" y1="1" y2="4" />
    </svg>
  ),
  interview: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  service: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  journal: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  ),
};

export default function SetupPanel({ initialConfig, initialDocuments, onStart }: Props) {
  const [config, setConfig] = useState<VoiceAgentConfig>(() => {
    const preset = getPreset(initialConfig.scenarioId || "general")!;
    return {
      ...initialConfig,
      scenarioId: preset.id,
      systemPrompt: initialConfig.systemPrompt || preset.systemPrompt,
      greeting: initialConfig.greeting ?? preset.greeting,
      sidebarMode: preset.sidebarMode,
      enableMetadata: preset.enableMetadata,
      tools: preset.tools,
      rimeSpeaker: initialConfig.rimeSpeaker || preset.defaultVoice || "cove",
    };
  });
  const [documents, setDocuments] = useState<UploadedDocument[]>(initialDocuments);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = useCallback(<K extends keyof VoiceAgentConfig>(key: K, value: VoiceAgentConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const applyPreset = useCallback((presetId: string) => {
    const preset = getPreset(presetId);
    if (!preset) return;
    setConfig((prev) => ({
      ...prev,
      scenarioId: preset.id,
      systemPrompt: preset.systemPrompt,
      greeting: preset.greeting,
      sidebarMode: preset.sidebarMode,
      enableMetadata: preset.enableMetadata,
      tools: preset.tools,
      rimeSpeaker: preset.defaultVoice || prev.rimeSpeaker,
    }));
  }, []);

  const activePreset = getPreset(config.scenarioId);
  const isRestaurant = config.scenarioId === "restaurant-kiosk";

  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isMobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const newDocs: UploadedDocument[] = [];
    setError(null);

    for (const file of arr) {
      if (!isSupported(file)) {
        setError(`Unsupported file type: ${file.name}`);
        continue;
      }
      const isPdfFile = isPdf(file);
      const isImageFile = isImage(file);
      const maxSize = (isPdfFile || isImageFile) ? 20 * 1024 * 1024 : 2 * 1024 * 1024;
      if (file.size > maxSize) {
        setError(`File too large: ${file.name}. Max ${(isPdfFile || isImageFile) ? "20MB" : "2MB"}.`);
        continue;
      }

      try {
        if ((isPdfFile || isImageFile) && isRestaurant && config.agentUrl) {
          setProcessing(`Extracting menu from ${file.name}...`);
          const { text, menu } = await extractMenuFromServer(file, config.agentUrl);
          newDocs.push({ id: generateId(), name: file.name, content: text, type: file.type || "application/octet-stream", menu });
        } else if (isPdfFile) {
          setProcessing(`Reading ${file.name}...`);
          const content = await extractText(file, config.agentUrl);
          newDocs.push({ id: generateId(), name: file.name, content, type: "application/pdf" });
        } else {
          const content = await extractText(file);
          newDocs.push({ id: generateId(), name: file.name, content, type: file.type || "text/plain" });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.error(`[Doc] Failed to process ${file.name}:`, e);
        setError(`Failed to process ${file.name}: ${msg}`);
      }
    }

    setProcessing(null);
    if (newDocs.length > 0) {
      setDocuments((prev) => [...prev, ...newDocs]);
    }
  }, [config.agentUrl, isRestaurant]);

  const openCamera = useCallback(async () => {
    if (isMobile) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      setCameraOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setError("Could not access camera. Please check permissions.");
      setCameraOpen(false);
    }
  }, [isMobile]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    let w = video.videoWidth;
    let h = video.videoHeight;
    const maxDim = 2048;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `menu-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        handleFiles([file]);
      }
      closeCamera();
    }, "image/jpeg", 0.85);
  }, [handleFiles]);

  const closeCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeDoc = useCallback((id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const handleStart = useCallback(() => {
    setError(null);
    onStart(config, documents);
  }, [config, documents, onStart]);

  const isBusy = !!processing;
  const hasMenuDoc = documents.some((d) => d.menu);

  return (
    <div className="setup-root">
      <div className="setup-container">
        <div className="setup-header">
          <div className="setup-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </div>
          <h1>Voice Agent</h1>
          <p className="setup-subtitle">Choose a scenario to get started.</p>
        </div>

        {error && <div className="setup-error">{error}</div>}

        <div className="setup-section">
          <label className="setup-label">Scenario</label>
          <div className="setup-presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`setup-preset-card ${config.scenarioId === p.id ? "setup-preset-card--active" : ""}`}
                onClick={() => applyPreset(p.id)}
                disabled={isBusy}
              >
                <div className="setup-preset-icon">{PRESET_ICONS[p.icon]}</div>
                <div className="setup-preset-name">{p.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="setup-section">
          <div className="setup-label-row">
            <label className="setup-label">System Prompt</label>
            {activePreset && (
              <button type="button" className="setup-reset-link" onClick={() => update("systemPrompt", activePreset.systemPrompt)}>
                Reset to preset
              </button>
            )}
          </div>
          <textarea className="setup-textarea" value={config.systemPrompt} onChange={(e) => update("systemPrompt", e.target.value)} rows={3} placeholder="Instructions for the AI assistant..." />
        </div>

        <div className="setup-section">
          <label className="setup-label">
            Greeting
            <span className="setup-label-hint">(agent speaks this when session starts)</span>
          </label>
          <input className="setup-input" value={config.greeting} onChange={(e) => update("greeting", e.target.value)} placeholder="e.g., Welcome! How can I help you?" />
        </div>

        <div className="setup-section">
          <label className="setup-label">
            {isRestaurant ? "Menu Upload" : "Documents for Context"}
            <span className="setup-label-hint">
              {isRestaurant ? "(upload a PDF, image, or take a photo of your menu)" : "(optional)"}
            </span>
          </label>

          {!isBusy && (
            <>
              <div
                className={`setup-dropzone ${dragOver ? "setup-dropzone--active" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />
                </svg>
                <span>{activePreset?.sampleDocHint || "Drop files here or click to upload"}</span>
                <span className="setup-dropzone-hint">
                  {isRestaurant ? ".pdf, .jpg, .png — or take a photo below" : ".pdf, .txt, .md, .csv, .json and more"}
                </span>
              </div>

              {isRestaurant && (
                <button type="button" className="setup-camera-btn" onClick={openCamera} disabled={isBusy}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                  Take Photo of Menu
                </button>
              )}
            </>
          )}
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.md,.csv,.json,.html,.xml,.yaml,.yml,.log,.js,.ts,.py,.jpg,.jpeg,.png,.webp,image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />

          {isBusy && (
            <div className="setup-processing">
              <div className="setup-processing-spinner" />
              <span>{processing}</span>
            </div>
          )}

          {documents.length > 0 && (
            <div className="setup-docs">
              {documents.map((doc) => (
                <div key={doc.id} className={`setup-doc ${doc.menu ? "setup-doc--menu" : ""}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="setup-doc-name">{doc.name}</span>
                  {doc.menu ? (
                    <span className="setup-doc-badge">
                      {doc.menu.categories.reduce((s, c) => s + c.items.length, 0)} menu items
                    </span>
                  ) : (
                    <span className="setup-doc-size">{doc.content.length > 1000 ? `${(doc.content.length / 1000).toFixed(1)}k chars` : `${doc.content.length} chars`}</span>
                  )}
                  <button type="button" className="setup-doc-remove" onClick={(e) => { e.stopPropagation(); removeDoc(doc.id); }}>&times;</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {cameraOpen && (
          <div className="setup-camera-overlay">
            <div className="setup-camera-modal">
              <video ref={videoRef} autoPlay playsInline muted className="setup-camera-video" />
              <div className="setup-camera-controls">
                <button type="button" className="setup-camera-cancel" onClick={closeCamera}>Cancel</button>
                <button type="button" className="setup-camera-capture" onClick={capturePhoto}>
                  <div className="setup-camera-shutter" />
                </button>
                <div style={{ width: 60 }} />
              </div>
            </div>
          </div>
        )}

        <button type="button" className="setup-advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? "Hide" : "Show"} advanced settings
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: showAdvanced ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showAdvanced && (
          <div className="setup-advanced">
            <div className="setup-row">
              <div className="setup-section" style={{ flex: 1 }}>
                <label className="setup-label">Voice</label>
                <select className="setup-select" value={config.rimeSpeaker} onChange={(e) => update("rimeSpeaker", e.target.value)}>
                  {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
              <div className="setup-section" style={{ flex: 1 }}>
                <label className="setup-label">TTS Model</label>
                <select className="setup-select" value={config.rimeModel} onChange={(e) => update("rimeModel", e.target.value)}>
                  {TTS_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <div className="setup-section">
              <label className="setup-label">Agent Server URL</label>
              <input className="setup-input" value={config.agentUrl} onChange={(e) => update("agentUrl", e.target.value)} placeholder="http://localhost:8765" />
            </div>
            <div className="setup-section">
              <label className="setup-label">ASR WebSocket URL</label>
              <input className="setup-input" value={config.asrUrl} onChange={(e) => update("asrUrl", e.target.value)} placeholder="ws://localhost:8001/asr/stream" />
            </div>
          </div>
        )}

        <button type="button" className="setup-start-btn" onClick={handleStart} disabled={isBusy}>
          {isBusy ? "Processing..." : (isRestaurant && hasMenuDoc ? "Review Menu & Start" : "Start Conversation")}
        </button>
      </div>
    </div>
  );
}
