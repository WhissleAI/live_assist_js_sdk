import React, { useState, useMemo, useCallback } from "react";
import type { SessionState, AppSettings } from "../App";
import { loadSessions, clearSessions } from "../lib/session-store";
import { loadAgents } from "../lib/agent-store";
import { computeInsights } from "../lib/insights";
import AgentList from "./AgentList";

interface Props {
  session: SessionState;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  viewMode: "agents" | "settings";
}

export default function AdminPortal({ session, settings, updateSettings, viewMode }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);

  const agents = useMemo(() => loadAgents(), [refreshKey]);
  const storedSessions = useMemo(() => loadSessions(), [session.isActive, refreshKey]);
  const insights = useMemo(() => computeInsights(storedSessions), [storedSessions]);

  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const handleClearData = () => {
    if (confirm("Clear all session data? This cannot be undone.")) {
      clearSessions();
      handleRefresh();
    }
  };

  if (viewMode === "settings") {
    return (
      <div className="studio-page">
        <div className="studio-page-header">
          <h1 className="studio-page-title">Settings</h1>
          <p className="studio-page-subtitle">Organization and data management</p>
        </div>
        <div className="admin-settings fade-in">
          <div className="settings-group">
            <h3 className="settings-group-title">Organization</h3>
            <label className="field">
              <span className="field-label">Organization Name</span>
              <input
                type="text"
                className="field-input"
                value={settings.organizationName}
                onChange={(e) => updateSettings({ organizationName: e.target.value })}
                placeholder="Your Company"
              />
            </label>
          </div>
          <div className="settings-group">
            <h3 className="settings-group-title">Data Management</h3>
            <p className="field-hint" style={{ marginBottom: 12 }}>Remove all stored session and analytics data from this browser.</p>
            <button type="button" className="btn btn--danger" onClick={handleClearData}>
              Clear All Session Data
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-page">
      <div className="studio-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="studio-page-title">Voice Agents</h1>
          <p className="studio-page-subtitle">Build and deploy conversational voice agents</p>
        </div>
        <div className="admin-stats">
          <div className="stat-chip">
            <span className="stat-value">{agents.length}</span>
            <span className="stat-label">{agents.length === 1 ? "Agent" : "Agents"}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-value">{insights.totalSessionCount}</span>
            <span className="stat-label">Sessions</span>
          </div>
          <div className="stat-chip">
            <span className="stat-value">{insights.totalMinutes}</span>
            <span className="stat-label">Minutes</span>
          </div>
        </div>
      </div>
      <AgentList agents={agents} onRefresh={handleRefresh} />
    </div>
  );
}
