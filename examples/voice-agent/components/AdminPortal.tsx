import React, { useState, useMemo, useCallback, useRef } from "react";
import type { SessionState, AppSettings } from "../App";
import { loadSessions, clearSessions } from "../lib/session-store";
import { loadAgents, saveAgent } from "../lib/agent-store";
import { computeInsights } from "../lib/insights";
import { gatewayConfig } from "../lib/gateway-config";
import type { AgentConfig } from "../lib/agent-config";
import AgentList from "./AgentList";
import Icon from "./Icon";
import { confirmAction } from "./ConfirmModal";
import { showToast } from "./Toast";

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

  const handleClearData = async () => {
    if (await confirmAction("Clear all data?", "This will remove all session data. This cannot be undone.")) {
      clearSessions();
      showToast("Session data cleared", "success");
      handleRefresh();
    }
  };

  if (viewMode === "settings") {
    return (
      <div className="studio-page">
        <div className="studio-page-header">
          <h1 className="studio-page-title">Settings</h1>
          <p className="studio-page-subtitle">Organization, data, and configuration</p>
        </div>
        <SettingsView
          settings={settings}
          updateSettings={updateSettings}
          onClearData={handleClearData}
          onRefresh={handleRefresh}
        />
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

/* ── Settings View ────────────────────────────────────────────── */

interface SettingsViewProps {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  onClearData: () => void;
  onRefresh: () => void;
}

function SettingsView({ settings, updateSettings, onClearData, onRefresh }: SettingsViewProps) {
  const importRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const handleExportAgents = useCallback(() => {
    const agents = loadAgents();
    if (agents.length === 0) {
      setImportMsg("No agents to export.");
      return;
    }
    const blob = new Blob([JSON.stringify(agents, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whissle_agents_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
        onRefresh();
      } catch (err) {
        setImportMsg(`Import failed: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [onRefresh]);

  return (
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
        <h3 className="settings-group-title">Gateway</h3>
        <label className="field">
          <span className="field-label">Gateway URL</span>
          <input
            type="text"
            className="field-input"
            value={gatewayConfig.httpBase}
            readOnly
          />
          <span className="field-hint">Set via VITE_GATEWAY_URL at build time, or ?gateway= query param.</span>
        </label>
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">Agent Data</h3>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          Export your agent configurations as JSON for backup or transfer, or import agents from a file.
        </p>
        <div className="settings-btn-row">
          <button type="button" className="btn btn--ghost" onClick={handleExportAgents}>
            <Icon name="download" size={14} /> Export Agents
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => importRef.current?.click()}>
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
        {importMsg && <p className="field-hint" style={{ marginTop: 8 }}>{importMsg}</p>}
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">Data Management</h3>
        <p className="field-hint" style={{ marginBottom: 12 }}>Remove all stored session and analytics data from this browser.</p>
        <button type="button" className="btn btn--danger" onClick={onClearData}>
          Clear All Session Data
        </button>
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">Keyboard Shortcuts</h3>
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

      <div className="settings-group settings-about">
        <h3 className="settings-group-title">About</h3>
        <p className="field-hint">
          Whissle Studio &mdash; Build & deploy conversational voice AI agents.<br />
          Data is stored locally in this browser.
        </p>
      </div>
    </div>
  );
}
