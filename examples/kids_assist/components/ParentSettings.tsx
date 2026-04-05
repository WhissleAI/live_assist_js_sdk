import React, { useState } from "react";
import type { AppSettings } from "../App";
import { clearSessions } from "../lib/session-store";

interface Props {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

export default function ParentSettings({ settings, updateSettings }: Props) {
  const [pin, setPin] = useState(settings.parentPin ?? "");
  const [saved, setSaved] = useState(false);

  const handleSavePin = () => {
    updateSettings({ parentPin: pin.length === 4 ? pin : null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearData = () => {
    if (confirm("Clear all session history? This cannot be undone.")) {
      clearSessions();
      window.location.reload();
    }
  };

  return (
    <div className="parent-settings">
      <div className="settings-group">
        <h3 className="settings-group-title">Child Profile</h3>
        <label className="settings-field">
          <span className="settings-label">Name</span>
          <input
            type="text"
            className="settings-input"
            value={settings.childName}
            onChange={(e) => updateSettings({ childName: e.target.value })}
            placeholder="Optional"
          />
        </label>
        <label className="settings-field">
          <span className="settings-label">Age</span>
          <input
            type="number"
            className="settings-input settings-input--small"
            min={3}
            max={14}
            value={settings.childAge}
            onChange={(e) => updateSettings({ childAge: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">Session Limits</h3>
        <label className="settings-field">
          <span className="settings-label">Max session (min)</span>
          <input
            type="number"
            className="settings-input settings-input--small"
            min={1}
            max={60}
            value={settings.maxSessionMinutes}
            onChange={(e) => updateSettings({ maxSessionMinutes: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">Parent PIN</h3>
        <p className="settings-hint">Set a 4-digit PIN to protect the parent dashboard.</p>
        <div className="settings-pin-row">
          <input
            type="password"
            maxLength={4}
            className="settings-input settings-input--small"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
          />
          <button type="button" className="settings-btn" onClick={handleSavePin}>
            {saved ? "Saved!" : "Save PIN"}
          </button>
          {settings.parentPin && (
            <button
              type="button"
              className="settings-btn settings-btn--outline"
              onClick={() => { updateSettings({ parentPin: null }); setPin(""); }}
            >
              Remove PIN
            </button>
          )}
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">Data</h3>
        <button type="button" className="settings-btn settings-btn--danger" onClick={handleClearData}>
          Clear All Session Data
        </button>
      </div>
    </div>
  );
}
