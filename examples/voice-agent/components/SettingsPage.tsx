import React, { useState, useEffect, useCallback, useRef } from "react";
import { gatewayConfig } from "../lib/gateway-config";
import { getDeviceId } from "../lib/device-id";
import { loadAgents, saveAgent } from "../lib/agent-store";
import type { AgentConfig } from "../lib/agent-config";
import { getStoredTheme, saveTheme, THEME_OPTIONS } from "../lib/theme";
import Icon from "./Icon";
import { showToast } from "./Toast";
import { confirmAction } from "./ConfirmModal";

interface Preferences {
  language: string;
  timezone: string;
}

export default function SettingsPage() {
  const [theme, setTheme] = useState(getStoredTheme);
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Track server-loaded values to detect dirty state
  const [savedLanguage, setSavedLanguage] = useState("en");
  const [savedTimezone, setSavedTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const prefsDirty = language !== savedLanguage || timezone !== savedTimezone;

  const deviceId = getDeviceId();

  // Load preferences from server
  const loadPreferences = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const sessionToken = gatewayConfig.getSessionToken();
      const headers: Record<string, string> = {
        "X-Device-Id": deviceId,
      };
      if (sessionToken) headers["X-Session-Token"] = sessionToken;

      const res = await fetch(
        `${gatewayConfig.httpBase}/agent/preferences?user_id=${deviceId}`,
        { headers }
      );
      if (res.ok) {
        const data: Preferences = await res.json();
        if (data.language) { setLanguage(data.language); setSavedLanguage(data.language); }
        if (data.timezone) { setTimezone(data.timezone); setSavedTimezone(data.timezone); }
      }
    } catch {
      // Non-critical — use defaults
    } finally {
      setPrefsLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Apply theme whenever it changes
  useEffect(() => {
    saveTheme(theme as "system" | "light" | "dark");
  }, [theme]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const sessionToken = gatewayConfig.getSessionToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
      };
      if (sessionToken) headers["X-Session-Token"] = sessionToken;

      const res = await fetch(
        `${gatewayConfig.httpBase}/agent/preferences`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            user_id: deviceId,
            language,
            timezone,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Failed to save (${res.status})`);
      }

      setSavedLanguage(language);
      setSavedTimezone(timezone);
      showToast("Preferences saved", "success");
    } catch (err: unknown) {
      showToast((err as Error).message || "Failed to save preferences", "error");
    } finally {
      setSaving(false);
    }
  }, [deviceId, language, timezone]);

  const handleExportSessions = useCallback(() => {
    try {
      const keys = Object.keys(localStorage).filter(
        (k) => k.startsWith("whissle_session_") || k.startsWith("whissle_agents_")
      );
      const data: Record<string, string | null> = {};
      keys.forEach((k) => {
        data[k] = localStorage.getItem(k);
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `whissle-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Sessions exported", "success");
    } catch {
      showToast("Failed to export sessions", "error");
    }
  }, []);

  const handleClearAll = useCallback(async () => {
    if (
      !(await confirmAction(
        "Clear all data?",
        "This will remove all locally stored sessions, preferences, and agent data. This cannot be undone."
      ))
    ) {
      return;
    }
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith("whissle_")
    );
    keys.forEach((k) => localStorage.removeItem(k));
    showToast("All data cleared", "success");
    // Reload to reset state
    window.location.reload();
  }, []);

  const timezones = [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Anchorage",
    "Pacific/Honolulu",
    "America/Toronto",
    "America/Vancouver",
    "America/Mexico_City",
    "America/Sao_Paulo",
    "America/Argentina/Buenos_Aires",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Amsterdam",
    "Europe/Madrid",
    "Europe/Rome",
    "Europe/Zurich",
    "Europe/Stockholm",
    "Europe/Moscow",
    "Europe/Istanbul",
    "Asia/Dubai",
    "Asia/Riyadh",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Bangkok",
    "Asia/Hong_Kong",
    "Asia/Shanghai",
    "Asia/Tokyo",
    "Asia/Seoul",
    "Asia/Jakarta",
    "Australia/Sydney",
    "Australia/Melbourne",
    "Australia/Perth",
    "Pacific/Auckland",
    "Africa/Cairo",
    "Africa/Johannesburg",
    "Africa/Lagos",
  ];

  // Ensure current timezone is in the list
  const currentTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!timezones.includes(currentTz)) {
    timezones.unshift(currentTz);
  }
  if (!timezones.includes(timezone)) {
    timezones.unshift(timezone);
  }

  return (
    <div className="studio-page">
      <div className="studio-page-header">
        <h1 className="studio-page-title">Settings</h1>
        <p className="studio-page-subtitle">
          Customize your experience and manage your data
        </p>
      </div>

      {prefsLoading ? (
        <div className="usage-loading">
          <div className="research-stream-dot" />
          Loading preferences...
        </div>
      ) : (
        <div className="settings-sections">
          {/* Theme */}
          <div className="settings-section">
            <h2 className="settings-section-title">
              <Icon name="monitor" size={18} />
              Appearance
            </h2>
            <div className="settings-field">
              <label className="settings-label">Theme</label>
              <div className="settings-theme-options">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`settings-theme-btn ${
                      theme === opt ? "settings-theme-btn--active" : ""
                    }`}
                    onClick={() => setTheme(opt)}
                  >
                    <Icon
                      name={
                        opt === "light"
                          ? "sun"
                          : opt === "dark"
                          ? "moon"
                          : "monitor"
                      }
                      size={16}
                    />
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Language */}
          <div className="settings-section">
            <h2 className="settings-section-title">
              <Icon name="globe" size={18} />
              Language & Region
            </h2>
            <div className="settings-field">
              <label className="settings-label" htmlFor="settings-lang">
                Language
              </label>
              <select
                id="settings-lang"
                className="settings-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="pt">Portuguese</option>
                <option value="ja">Japanese</option>
                <option value="zh">Chinese</option>
                <option value="ko">Korean</option>
                <option value="hi">Hindi</option>
                <option value="ar">Arabic</option>
              </select>
            </div>
            <div className="settings-field">
              <label className="settings-label" htmlFor="settings-tz">
                Timezone
              </label>
              <select
                id="settings-tz"
                className="settings-select"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Save preferences */}
          <div className="settings-actions-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSave}
              disabled={saving || !prefsDirty}
            >
              {saving ? "Saving..." : prefsDirty ? "Save Preferences" : "Preferences Saved"}
            </button>
          </div>

          {/* Gateway */}
          <div className="settings-section">
            <h2 className="settings-section-title">
              <Icon name="link" size={18} />
              Gateway
            </h2>
            <div className="settings-field">
              <label className="settings-label">Gateway URL</label>
              <input
                type="text"
                className="settings-input settings-input--readonly"
                value={gatewayConfig.httpBase}
                readOnly
              />
              <span className="settings-hint">Set via VITE_GATEWAY_URL at build time.</span>
            </div>
          </div>

          {/* Agent Data */}
          <AgentDataSection />

          {/* Data management */}
          <div className="settings-section">
            <h2 className="settings-section-title">
              <Icon name="database" size={18} />
              Data Management
            </h2>
            <div className="settings-data-actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleExportSessions}
              >
                <Icon name="download" size={16} />
                Export Sessions
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={handleClearAll}
              >
                <Icon name="trash" size={16} />
                Clear All Data
              </button>
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="settings-section">
            <h2 className="settings-section-title">
              <Icon name="zap" size={18} />
              Keyboard Shortcuts
            </h2>
            <div className="settings-shortcuts">
              <div className="settings-shortcut-row">
                <span className="settings-shortcut-keys"><kbd>Space</kbd></span>
                <span>Play / pause session audio</span>
              </div>
              <div className="settings-shortcut-row">
                <span className="settings-shortcut-keys"><kbd>&larr;</kbd> <kbd>&rarr;</kbd></span>
                <span>Seek audio backward / forward 5s</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentDataSection() {
  const importRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const handleExportAgents = useCallback(() => {
    const agents = loadAgents();
    if (agents.length === 0) {
      showToast("No agents to export", "error");
      return;
    }
    const blob = new Blob([JSON.stringify(agents, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whissle_agents_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Agents exported", "success");
  }, []);

  const handleImportAgents = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!Array.isArray(parsed)) throw new Error("Expected an array of agent configs.");
        let count = 0;
        for (const agent of parsed) {
          if (agent && typeof agent === "object" && agent.id && agent.name) {
            saveAgent(agent as AgentConfig);
            count++;
          }
        }
        setImportMsg(`Imported ${count} agent${count !== 1 ? "s" : ""} successfully.`);
        showToast(`Imported ${count} agent${count !== 1 ? "s" : ""}`, "success");
      } catch (err) {
        setImportMsg(`Import failed: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">
        <Icon name="mic" size={18} />
        Agent Data
      </h2>
      <p className="settings-hint" style={{ marginBottom: 12 }}>
        Export your agent configurations as JSON for backup or transfer, or import agents from a file.
      </p>
      <div className="settings-data-actions">
        <button type="button" className="btn btn--secondary" onClick={handleExportAgents}>
          <Icon name="download" size={14} /> Export Agents
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => importRef.current?.click()}>
          <Icon name="upload" size={14} /> Import Agents
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleImportAgents}
        />
      </div>
      {importMsg && <p className="settings-hint" style={{ marginTop: 8 }}>{importMsg}</p>}
    </div>
  );
}
