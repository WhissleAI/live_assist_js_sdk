import React from "react";
import type { AgentConfig } from "../lib/agent-config";
import { getModelLabel } from "../lib/agent-config";
import { deleteAgent, duplicateAgent } from "../lib/agent-store";
import { navigate } from "../App";
import Icon from "./Icon";

interface Props {
  agents: AgentConfig[];
  onRefresh: () => void;
}

export default function AgentList({ agents, onRefresh }: Props) {
  if (agents.length === 0) {
    return (
      <div className="agent-list-empty fade-in">
        <div className="agent-list-empty-icon">
          <Icon name="mic" size={48} />
        </div>
        <h2>Create your first voice agent</h2>
        <p>Build an AI-powered voice agent in minutes. Choose a template or start from scratch.</p>
        <button type="button" className="btn btn--primary btn--large" onClick={() => navigate("agents/new")}>
          <Icon name="plus" size={16} /> Create Agent
        </button>
      </div>
    );
  }

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete "${name}"? This cannot be undone.`)) {
      deleteAgent(id);
      onRefresh();
    }
  };

  const handleDuplicate = (id: string) => {
    duplicateAgent(id);
    onRefresh();
  };

  return (
    <div className="agent-list fade-in">
      <div className="agent-list-header">
        <h2 className="agent-list-title">Your Agents</h2>
        <button type="button" className="btn btn--primary" onClick={() => navigate("agents/new")}>
          <Icon name="plus" size={16} /> Create Agent
        </button>
      </div>
      <div className="agent-grid">
        {agents.map((agent) => (
          <div key={agent.id} className="agent-card">
            <div className="agent-card-header">
              <span className="agent-card-avatar">{agent.avatar}</span>
              <div className="agent-card-info">
                <span className="agent-card-name">{agent.name}</span>
                <span className={`agent-card-status agent-card-status--${agent.status}`}>
                  {agent.status}
                </span>
              </div>
            </div>
            {agent.description && (
              <p className="agent-card-desc">{agent.description}</p>
            )}
            <div className="agent-card-meta">
              <span><Icon name="mic" size={14} /> {agent.voiceName}</span>
              <span><Icon name="zap" size={14} /> {getModelLabel(agent.model)}</span>
              <span><Icon name="globe" size={14} /> {agent.language.toUpperCase()}</span>
            </div>
            <div className="agent-card-actions">
              <div className="agent-card-actions-primary">
                <button type="button" className="btn btn--small btn--secondary" onClick={() => navigate(`agents/${agent.id}/edit`)}>
                  Edit
                </button>
                {agent.status === "published" && (
                  <button type="button" className="btn btn--small btn--primary" onClick={() => window.open(`#/a/${agent.id}`, "_blank")}>
                    <Icon name="external-link" size={13} /> Open
                  </button>
                )}
              </div>
              <div className="agent-card-actions-secondary">
                <button type="button" className="btn btn--small btn--ghost" onClick={() => navigate("sessions")} title="Sessions">
                  <Icon name="bar-chart" size={14} />
                </button>
                <button type="button" className="btn btn--small btn--ghost" onClick={() => handleDuplicate(agent.id)} title="Duplicate">
                  <Icon name="copy" size={14} />
                </button>
                <button type="button" className="btn btn--small btn--ghost btn--danger-ghost" onClick={() => handleDelete(agent.id, agent.name)} title="Delete">
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
