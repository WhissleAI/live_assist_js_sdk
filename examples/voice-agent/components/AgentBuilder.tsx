import React, { useState, useCallback } from "react";
import {
  createDefaultAgent,
  AGENT_TEMPLATES,
  AVAILABLE_TOOLS,
  MODEL_OPTIONS,
  type AgentConfig,
  type AgentTheme,
  type AgentIntegrations,
} from "../lib/agent-config";
import { getAgent, saveAgent } from "../lib/agent-store";
import type { VoiceEntry } from "../lib/voice-catalog";
import VoicePicker from "./VoicePicker";
import { navigate } from "../App";
import { gatewayConfig } from "../lib/gateway-config";
import Icon from "./Icon";

interface Props {
  agentId?: string;
}

type Section =
  | "identity"
  | "prompt"
  | "voice"
  | "model"
  | "knowledge"
  | "tools"
  | "integrations"
  | "appearance"
  | "deploy"
  | "analytics";

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "identity", label: "Identity", icon: "tag" },
  { id: "prompt", label: "Personality", icon: "brain" },
  { id: "voice", label: "Voice", icon: "mic" },
  { id: "model", label: "Behavior", icon: "settings" },
  { id: "knowledge", label: "Knowledge", icon: "book-open" },
  { id: "tools", label: "Tools", icon: "wrench" },
  { id: "integrations", label: "Integrations", icon: "link" },
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "deploy", label: "Deploy", icon: "rocket" },
  { id: "analytics", label: "Analytics", icon: "bar-chart" },
];

const EMOTION_BAR_COLORS: Record<string, string> = {
  HAPPY: "#2ecc71",
  SAD: "#3498db",
  ANGRY: "#e74c3c",
  FEAR: "#f39c12",
};

interface AnalyticsData {
  total_sessions: number;
  avg_turns: number;
  avg_duration_seconds: number;
  emotion_distribution: Record<string, number>;
  top_tools: Array<{ name: string; count: number }>;
  tool_failures: number;
  abandonment_rate: number;
  sessions_per_day: Array<{ date: string; count: number }>;
}

export default function AgentBuilder({ agentId }: Props) {
  const [config, setConfig] = useState<AgentConfig>(() => {
    if (agentId) {
      const existing = getAgent(agentId);
      if (existing) return { ...createDefaultAgent(), ...existing };
    }
    return createDefaultAgent();
  });
  const [section, setSection] = useState<Section>("identity");
  const [saved, setSaved] = useState(false);
  const [showTemplates, setShowTemplates] = useState(!agentId);
  const [sheetTestResult, setSheetTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [sheetTesting, setSheetTesting] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState("7d");

  const patch = useCallback((updates: Partial<AgentConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
    setSaved(false);
  }, []);

  const patchTheme = useCallback((updates: Partial<AgentTheme>) => {
    setConfig((prev) => ({ ...prev, theme: { ...prev.theme, ...updates } }));
    setSaved(false);
  }, []);

  const patchIntegrations = useCallback((updates: Partial<AgentIntegrations>) => {
    setConfig((prev) => ({
      ...prev,
      integrations: { ...prev.integrations, ...updates },
    }));
    setSaved(false);
    setSheetTestResult(null);
  }, []);

  const testSheetConnection = useCallback(async () => {
    const sheetId = config.integrations?.google_sheets?.sheet_id;
    if (!sheetId) {
      setSheetTestResult({ success: false, message: "Enter a Google Sheet URL or ID first" });
      return;
    }
    setSheetTesting(true);
    setSheetTestResult(null);
    try {
      const res = await fetch(`${gatewayConfig.httpBase}/agent/sheets/test?sheet_id=${encodeURIComponent(sheetId)}`);
      const data = await res.json();
      if (data.success) {
        setSheetTestResult({ success: true, message: `Connected to "${data.title}" (${data.sheet_name})` });
      } else {
        setSheetTestResult({ success: false, message: data.error || "Connection failed" });
      }
    } catch (e) {
      setSheetTestResult({ success: false, message: "Could not reach gateway" });
    } finally {
      setSheetTesting(false);
    }
  }, [config.integrations]);

  const handleSave = useCallback(() => {
    saveAgent(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [config]);

  const handlePublish = useCallback(() => {
    const updated = { ...config, status: "published" as const };
    saveAgent(updated);
    setConfig(updated);
    setSaved(true);
  }, [config]);

  const applyTemplate = useCallback((templateId: string) => {
    const tpl = AGENT_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    const newConfig = createDefaultAgent(tpl.defaults);
    setConfig(newConfig);
    setShowTemplates(false);
    setSection("identity");
  }, []);

  const handleVoiceSelect = useCallback((voice: VoiceEntry) => {
    patch({ voiceId: voice.id, voiceName: voice.name });
  }, [patch]);

  const fetchAnalytics = useCallback(async (period: string) => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`${gatewayConfig.httpBase}/analytics/${config.id}?period=${period}`);
      if (res.ok) {
        setAnalytics(await res.json());
      }
    } catch { /* ignore */ } finally {
      setAnalyticsLoading(false);
    }
  }, [config.id]);

  const toggleTool = useCallback((toolId: string) => {
    setConfig((prev) => {
      const tools = prev.enabledTools.includes(toolId)
        ? prev.enabledTools.filter((t) => t !== toolId)
        : [...prev.enabledTools, toolId];
      return { ...prev, enabledTools: tools };
    });
    setSaved(false);
  }, []);

  const embedUrl = `${window.location.origin}/#/embed/${config.id}`;
  const runtimeUrl = `${window.location.origin}/#/a/${config.id}`;
  const embedCode = `<iframe src="${embedUrl}" width="420" height="640" frameborder="0" allow="microphone" style="border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.12)"></iframe>`;

  if (showTemplates) {
    return (
      <div className="builder-page fade-in">
        <div className="builder-header">
          <button type="button" className="builder-back" onClick={() => navigate("")}>
            <Icon name="chevron-left" size={16} /> Back
          </button>
          <h1 className="builder-title">Create Voice Agent</h1>
        </div>
        <p className="builder-section-desc builder-section-desc--spaced">
          Choose a template to get started quickly, or build from scratch.
        </p>
        <div className="template-grid">
          {AGENT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="template-card"
              onClick={() => applyTemplate(tpl.id)}
            >
              <span className="template-icon">{tpl.icon}</span>
              <span className="template-name">{tpl.name}</span>
              <span className="template-desc">{tpl.description}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="builder-page fade-in">
      <div className="builder-header">
        <button type="button" className="builder-back" onClick={() => navigate("")}>
          <Icon name="chevron-left" size={16} /> Back
        </button>
        <h1 className="builder-title">
          {agentId ? config.name : "Create Agent"}
        </h1>
        <div className="builder-actions">
          <button type="button" className={`btn btn--secondary ${saved ? "btn--saved" : ""}`} onClick={handleSave}>
            {saved ? <><Icon name="check" size={14} /> Saved</> : "Save Draft"}
          </button>
          <button type="button" className="btn btn--primary" onClick={handlePublish}>
            Publish
          </button>
        </div>
      </div>

      <div className="builder-layout">
        <nav className="builder-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`builder-nav-item ${section === s.id ? "builder-nav-item--active" : ""}`}
              onClick={() => setSection(s.id)}
            >
              <span className="builder-nav-icon"><Icon name={s.icon} size={16} /></span>
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="builder-content">
          <div className="builder-section fade-in" key={section}>
            {section === "identity" && (
              <>
                <h2 className="builder-section-title">Agent Identity</h2>
                <p className="builder-section-desc">Give your agent a name, personality, and first impression.</p>
                <label className="field">
                  <span className="field-label">Name</span>
                  <input type="text" className="field-input" value={config.name} onChange={(e) => patch({ name: e.target.value })} placeholder="My Agent" />
                </label>
                <label className="field">
                  <span className="field-label">Description</span>
                  <textarea className="field-textarea" value={config.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Briefly describe what this agent does" rows={2} maxLength={200} />
                  <span className="field-hint">{config.description.length}/200</span>
                </label>
                <label className="field">
                  <span className="field-label">Avatar (emoji)</span>
                  <input type="text" className="field-input field-input--small" value={config.avatar} onChange={(e) => patch({ avatar: e.target.value })} maxLength={4} />
                </label>
                <label className="field">
                  <span className="field-label">Welcome Message</span>
                  <textarea className="field-textarea" value={config.welcomeMessage} onChange={(e) => patch({ welcomeMessage: e.target.value })} placeholder="First thing the agent says when a conversation starts" rows={2} />
                </label>
              </>
            )}

            {section === "prompt" && (
              <>
                <h2 className="builder-section-title">Personality &amp; Instructions</h2>
                <p className="builder-section-desc">
                  Define how your agent behaves, its tone, and rules it should follow. This is the core of your agent's personality.
                </p>
                <label className="field">
                  <span className="field-label">System Prompt</span>
                  <textarea className="field-textarea field-textarea--large" value={config.systemPrompt} onChange={(e) => patch({ systemPrompt: e.target.value })} placeholder="You are a helpful assistant that..." rows={16} />
                  <span className="field-hint">{config.systemPrompt.length} characters</span>
                </label>
                <div className="field">
                  <span className="field-label">Quick Templates</span>
                  <div className="template-pills">
                    {AGENT_TEMPLATES.filter((t) => t.id !== "custom" && t.defaults.systemPrompt).map((t) => (
                      <button key={t.id} type="button" className="pill-btn" onClick={() => patch({ systemPrompt: t.defaults.systemPrompt! })}>
                        {t.icon} {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {section === "voice" && (
              <>
                <h2 className="builder-section-title">Voice</h2>
                <p className="builder-section-desc">
                  Choose how your agent sounds. Currently selected: <strong>{config.voiceName}</strong>
                </p>
                <VoicePicker selectedId={config.voiceId} onSelect={handleVoiceSelect} />
                <div className="builder-row">
                  <label className="field">
                    <span className="field-label">Language</span>
                    <select className="field-select" value={config.language} onChange={(e) => patch({ language: e.target.value })}>
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="pt">Portuguese</option>
                      <option value="ja">Japanese</option>
                      <option value="zh">Chinese</option>
                      <option value="hi">Hindi</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Speed: {config.defaultSpeed.toFixed(1)}x</span>
                    <input type="range" className="field-range" min={0.6} max={1.5} step={0.1} value={config.defaultSpeed} onChange={(e) => patch({ defaultSpeed: Number(e.target.value) })} />
                  </label>
                </div>
              </>
            )}

            {section === "model" && (
              <>
                <h2 className="builder-section-title">Behavior &amp; Intelligence</h2>
                <p className="builder-section-desc">
                  Configure how your agent thinks and responds.
                </p>
                <div className="field">
                  <span className="field-label">Intelligence Level</span>
                  <div className="model-cards">
                    {MODEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`model-card ${config.model === opt.value ? "model-card--active" : ""}`}
                        onClick={() => patch({ model: opt.value })}
                      >
                        <span className="model-card-label">{opt.label}</span>
                        <span className="model-card-desc">{opt.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="field">
                  <span className="field-label">Creativity: {config.temperature.toFixed(1)}</span>
                  <input type="range" className="field-range" min={0} max={1} step={0.1} value={config.temperature} onChange={(e) => patch({ temperature: Number(e.target.value) })} />
                  <span className="field-hint">Lower = more focused &amp; consistent. Higher = more creative &amp; varied.</span>
                </label>
                <label className="field">
                  <span className="field-label">Response Length: {config.maxOutputTokens}</span>
                  <input type="range" className="field-range" min={256} max={4096} step={256} value={config.maxOutputTokens} onChange={(e) => patch({ maxOutputTokens: Number(e.target.value) })} />
                  <span className="field-hint">Max words the agent can say per response.</span>
                </label>
                <div className="toggle-group">
                  <label className="toggle-field">
                    <input type="checkbox" checked={config.enableEmotionDetection} onChange={(e) => patch({ enableEmotionDetection: e.target.checked })} />
                    <div>
                      <span className="toggle-label">Emotion Detection</span>
                      <span className="toggle-hint">Detect user emotions from speech in real-time</span>
                    </div>
                  </label>
                  <label className="toggle-field">
                    <input type="checkbox" checked={config.enableEmotionTts} onChange={(e) => patch({ enableEmotionTts: e.target.checked })} />
                    <div>
                      <span className="toggle-label">Expressive Voice</span>
                      <span className="toggle-hint">Agent voice adapts tone to conversation context</span>
                    </div>
                  </label>
                  <label className="toggle-field">
                    <input type="checkbox" checked={config.enableBargeIn} onChange={(e) => patch({ enableBargeIn: e.target.checked })} />
                    <div>
                      <span className="toggle-label">Interruption Handling</span>
                      <span className="toggle-hint">Agent pauses gracefully when the user starts speaking</span>
                    </div>
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">Max Session Duration (minutes, 0 = unlimited)</span>
                  <input type="number" className="field-input field-input--small" min={0} max={120} value={config.maxSessionMinutes} onChange={(e) => patch({ maxSessionMinutes: Number(e.target.value) })} />
                </label>
              </>
            )}

            {section === "knowledge" && (
              <>
                <h2 className="builder-section-title">Knowledge Base</h2>
                <p className="builder-section-desc">
                  Paste company knowledge, FAQs, product details, or any context your agent needs. This gets injected into every conversation.
                </p>
                <label className="field">
                  <span className="field-label">Knowledge Context</span>
                  <textarea className="field-textarea field-textarea--large" value={config.knowledgeContext} onChange={(e) => patch({ knowledgeContext: e.target.value })} placeholder="Our company sells... Our return policy is... Common questions include..." rows={20} />
                  <span className="field-hint">{config.knowledgeContext.length} characters</span>
                </label>
              </>
            )}

            {section === "tools" && (
              <>
                <h2 className="builder-section-title">Tools &amp; Integrations</h2>
                <p className="builder-section-desc">
                  Enable capabilities your agent can use during conversations.
                </p>
                <div className="tools-list">
                  {AVAILABLE_TOOLS.map((tool) => (
                    <label key={tool.id} className={`tool-card ${config.enabledTools.includes(tool.id) ? "tool-card--active" : ""}`}>
                      <input type="checkbox" checked={config.enabledTools.includes(tool.id)} onChange={() => toggleTool(tool.id)} />
                      <div className="tool-card-body">
                        <span className="tool-card-name">{tool.icon} {tool.name}</span>
                        <span className="tool-card-desc">{tool.description}</span>
                      </div>
                    </label>
                  ))}
                </div>

                {config.enabledTools.some((t) => ["send_email", "create_calendar_event", "save_to_sheet", "schedule_recurring"].includes(t)) && (
                  <label className="tool-confirmation-field">
                    <input
                      type="checkbox"
                      checked={config.requireToolConfirmation}
                      onChange={(e) => patch({ requireToolConfirmation: e.target.checked })}
                    />
                    <div>
                      <span className="field-label tool-confirmation-label">Require confirmation for sensitive actions</span>
                      <span className="field-hint tool-confirmation-hint">
                        Agent will ask "Should I go ahead?" before sending emails, creating events, or saving to sheets
                      </span>
                    </div>
                  </label>
                )}
              </>
            )}

            {section === "integrations" && (
              <>
                <h2 className="builder-section-title">Integrations</h2>
                <p className="builder-section-desc">
                  Connect external services your agent can use. Enable "Save to Sheet" or "Read from Sheet" tools to use Google Sheets.
                </p>
                <div className="integration-block">
                  <div className="integration-header">
                    <span className="integration-icon"><Icon name="bar-chart" size={20} /></span>
                    <div>
                      <h3 className="integration-name">Google Sheets</h3>
                      <p className="integration-hint">Store bookings, leads, or any data the agent collects during conversations.</p>
                    </div>
                  </div>
                  <label className="field">
                    <span className="field-label">Spreadsheet URL or ID</span>
                    <input
                      type="text"
                      className="field-input"
                      value={config.integrations?.google_sheets?.sheet_id || ""}
                      onChange={(e) =>
                        patchIntegrations({
                          google_sheets: {
                            sheet_id: e.target.value,
                            sheet_name: config.integrations?.google_sheets?.sheet_name || "Sheet1",
                          },
                        })
                      }
                      placeholder="https://docs.google.com/spreadsheets/d/... or sheet ID"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Sheet Tab Name</span>
                    <input
                      type="text"
                      className="field-input field-input--small"
                      value={config.integrations?.google_sheets?.sheet_name || "Sheet1"}
                      onChange={(e) =>
                        patchIntegrations({
                          google_sheets: {
                            sheet_id: config.integrations?.google_sheets?.sheet_id || "",
                            sheet_name: e.target.value,
                          },
                        })
                      }
                      placeholder="Sheet1"
                    />
                    <span className="field-hint">Name of the tab within the spreadsheet to use</span>
                  </label>
                  <div className="integration-actions">
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={testSheetConnection}
                      disabled={sheetTesting}
                    >
                      {sheetTesting ? "Testing..." : "Test Connection"}
                    </button>
                    {sheetTestResult && (
                      <span
                        className={`integration-result ${sheetTestResult.success ? "integration-result--ok" : "integration-result--err"}`}
                      >
                        <Icon name={sheetTestResult.success ? "check" : "x"} size={13} /> {sheetTestResult.message}
                      </span>
                    )}
                  </div>
                  <div className="integration-note">
                    <strong>Setup:</strong> Share your Google Sheet with the service account email (editor access). The agent will auto-create headers from the data it saves.
                  </div>
                </div>
              </>
            )}

            {section === "appearance" && (
              <>
                <h2 className="builder-section-title">Appearance</h2>
                <p className="builder-section-desc">
                  Customize how your agent looks when users interact with it.
                </p>
                <div className="builder-row">
                  <label className="field">
                    <span className="field-label">Primary Color</span>
                    <div className="color-field">
                      <input type="color" value={config.theme.primaryColor} onChange={(e) => patchTheme({ primaryColor: e.target.value })} />
                      <span className="color-hex">{config.theme.primaryColor}</span>
                    </div>
                  </label>
                  <label className="field">
                    <span className="field-label">Accent Color</span>
                    <div className="color-field">
                      <input type="color" value={config.theme.accentColor} onChange={(e) => patchTheme({ accentColor: e.target.value })} />
                      <span className="color-hex">{config.theme.accentColor}</span>
                    </div>
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">Background Style</span>
                  <select className="field-select" value={config.theme.bgStyle} onChange={(e) => patchTheme({ bgStyle: e.target.value as AgentTheme["bgStyle"] })}>
                    <option value="emotion-reactive">Emotion Reactive (dynamic)</option>
                    <option value="gradient">Gradient (static)</option>
                    <option value="solid">Solid</option>
                  </select>
                </label>
                <div className="toggle-group">
                  <label className="toggle-field">
                    <input type="checkbox" checked={config.theme.showFloatingWords} onChange={(e) => patchTheme({ showFloatingWords: e.target.checked })} />
                    <div>
                      <span className="toggle-label">Floating Words</span>
                      <span className="toggle-hint">Animated transcript words float across the screen</span>
                    </div>
                  </label>
                  <label className="toggle-field">
                    <input type="checkbox" checked={config.theme.showEmotionLabel} onChange={(e) => patchTheme({ showEmotionLabel: e.target.checked })} />
                    <div>
                      <span className="toggle-label">Emotion Label</span>
                      <span className="toggle-hint">Show detected emotion badge during conversation</span>
                    </div>
                  </label>
                </div>
                <div className="appearance-preview">
                  <h3 className="field-label">Preview</h3>
                  <div
                    className="preview-card"
                    style={{
                      background:
                        config.theme.bgStyle === "solid"
                          ? "#f1f5f9"
                          : `linear-gradient(135deg, ${config.theme.primaryColor}18 0%, #f8fafc 50%, ${config.theme.accentColor}18 100%)`,
                    }}
                  >
                    <div className="preview-agent-bar">
                      <span className="preview-avatar">{config.avatar}</span>
                      <span className="preview-name">{config.name || "Agent"}</span>
                    </div>
                    <div className="preview-bubble">
                      {config.welcomeMessage || "Hello! How can I help you?"}
                    </div>
                    <div className="preview-mic" style={{ borderColor: config.theme.primaryColor }}>
                      <Icon name="mic" size={20} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {section === "deploy" && (
              <>
                <h2 className="builder-section-title">Deploy</h2>
                {config.status !== "published" ? (
                  <div className="deploy-notice">
                    <p>Publish your agent to make it accessible via link or embed.</p>
                    <button type="button" className="btn btn--primary btn--large" onClick={handlePublish}>
                      <Icon name="rocket" size={16} /> Publish Agent
                    </button>
                  </div>
                ) : (
                  <div className="fade-in">
                    <div className="deploy-status">
                      <span className="deploy-status-dot" />
                      <span>Published &amp; Live</span>
                    </div>
                    <div className="deploy-block">
                      <h3 className="field-label">Shareable Link</h3>
                      <div className="deploy-url">
                        <code>{runtimeUrl}</code>
                        <button type="button" className="btn btn--small" onClick={() => navigator.clipboard.writeText(runtimeUrl)}>
                          Copy
                        </button>
                      </div>
                    </div>
                    <div className="deploy-block">
                      <h3 className="field-label">Embed Code</h3>
                      <pre className="deploy-code">{embedCode}</pre>
                      <button type="button" className="btn btn--small" onClick={() => navigator.clipboard.writeText(embedCode)}>
                        Copy Embed Code
                      </button>
                    </div>
                    <div className="deploy-block">
                      <button type="button" className="btn btn--primary" onClick={() => window.open(`#/a/${config.id}`, "_blank")}>
                        Test Your Agent <Icon name="external-link" size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {section === "analytics" && (
              <>
                <h2 className="builder-section-title">Analytics</h2>
                <p className="builder-section-desc">
                  Understand how users interact with your agent.
                </p>
                <div className="analytics-period-bar">
                  {["7d", "14d", "30d"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`btn btn--small ${analyticsPeriod === p ? "btn--primary" : ""}`}
                      onClick={() => { setAnalyticsPeriod(p); fetchAnalytics(p); }}
                    >
                      {p === "7d" ? "7 days" : p === "14d" ? "14 days" : "30 days"}
                    </button>
                  ))}
                </div>

                {!analytics && !analyticsLoading && (
                  <button type="button" className="btn btn--primary" onClick={() => fetchAnalytics(analyticsPeriod)}>
                    Load Analytics
                  </button>
                )}

                {analyticsLoading && <p className="analytics-loading">Loading...</p>}

                {analytics && !analyticsLoading && (
                  <div className="fade-in analytics-grid">
                    <div className="analytics-metric-grid">
                      <div className="analytics-metric">
                        <div className="analytics-metric-value">{analytics.total_sessions}</div>
                        <div className="analytics-metric-label">Total Sessions</div>
                      </div>
                      <div className="analytics-metric">
                        <div className="analytics-metric-value">{analytics.avg_turns}</div>
                        <div className="analytics-metric-label">Avg Turns</div>
                      </div>
                      <div className="analytics-metric">
                        <div className="analytics-metric-value">
                          {analytics.avg_duration_seconds > 0
                            ? `${Math.floor(analytics.avg_duration_seconds / 60)}:${String(analytics.avg_duration_seconds % 60).padStart(2, "0")}`
                            : "\u2014"}
                        </div>
                        <div className="analytics-metric-label">Avg Duration</div>
                      </div>
                      <div className="analytics-metric">
                        <div className={`analytics-metric-value ${analytics.abandonment_rate > 0.3 ? "analytics-metric-value--danger" : ""}`}>
                          {Math.round(analytics.abandonment_rate * 100)}%
                        </div>
                        <div className="analytics-metric-label">Abandonment</div>
                      </div>
                    </div>

                    {Object.keys(analytics.emotion_distribution).length > 0 && (
                      <div className="deploy-block">
                        <h3 className="field-label">Emotion Distribution</h3>
                        <div className="analytics-bar-list">
                          {Object.entries(analytics.emotion_distribution).slice(0, 6).map(([emo, pct]) => (
                            <div key={emo} className="analytics-bar-row">
                              <span className="analytics-bar-label">{emo.toLowerCase()}</span>
                              <div className="analytics-bar-track">
                                <div
                                  className="analytics-bar-fill"
                                  style={{
                                    width: `${Math.round(pct * 100)}%`,
                                    background: EMOTION_BAR_COLORS[emo] || "var(--color-primary)",
                                  }}
                                />
                              </div>
                              <span className="analytics-bar-pct">{Math.round(pct * 100)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {analytics.top_tools.length > 0 && (
                      <div className="deploy-block">
                        <h3 className="field-label">Tool Usage</h3>
                        <div className="analytics-tool-list">
                          {analytics.top_tools.map((t) => (
                            <div key={t.name} className="analytics-tool-row">
                              <span>{t.name.replace(/_/g, " ")}</span>
                              <span className="analytics-tool-count">{t.count} calls</span>
                            </div>
                          ))}
                        </div>
                        {analytics.tool_failures > 0 && (
                          <p className="analytics-tool-failures">
                            {analytics.tool_failures} tool failure{analytics.tool_failures > 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                    )}

                    {analytics.sessions_per_day.length > 0 && (
                      <div className="deploy-block">
                        <h3 className="field-label">Sessions per Day</h3>
                        <div className="analytics-sparkline">
                          {analytics.sessions_per_day.map((d) => {
                            const maxCount = Math.max(...analytics.sessions_per_day.map((x) => x.count), 1);
                            const h = Math.max(4, (d.count / maxCount) * 56);
                            return (
                              <div
                                key={d.date}
                                title={`${d.date}: ${d.count} sessions`}
                                className="analytics-sparkline-bar"
                                style={{ height: h }}
                              />
                            );
                          })}
                        </div>
                        <div className="analytics-sparkline-labels">
                          <span>{analytics.sessions_per_day[0]?.date.slice(5)}</span>
                          <span>{analytics.sessions_per_day[analytics.sessions_per_day.length - 1]?.date.slice(5)}</span>
                        </div>
                      </div>
                    )}

                    {analytics.total_sessions === 0 && (
                      <p className="analytics-empty">
                        No sessions recorded yet. Share your agent and start collecting data.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
