import React, { useState, useEffect, useCallback } from "react";
import { gatewayConfig } from "../lib/gateway-config";
import { getDeviceId } from "../lib/device-id";
import Icon from "./Icon";
import { showToast } from "./Toast";
import { confirmAction } from "./ConfirmModal";

const THEME_KEY = "whissle_theme";
const THEME_OPTIONS = ["system", "light", "dark"] as const;

function applyTheme(theme: string) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

interface Preferences {
  language: string;
  timezone: string;
}

export default function SettingsPage() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "system");
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
        if (data.language) setLanguage(data.language);
        if (data.timezone) setTimezone(data.timezone);
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
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
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
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Asia/Kolkata",
    "Australia/Sydney",
    "Pacific/Auckland",
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
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Preferences"}
            </button>
          </div>

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
        </div>
      )}
    </div>
  );
}
