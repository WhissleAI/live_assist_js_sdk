import type { AgentConfig } from "./agent-config";
import { MODEL_OPTIONS } from "./agent-config";
import { resolveVoiceId, VOICE_CATALOG } from "./voice-catalog";

const STORAGE_KEY = "whissle_agents";

const DEPRECATED_MODELS: Record<string, string> = {
  "gemini-2.0-flash": "gemini-3-flash-preview",
  "gemini-2.0-flash-exp": "gemini-3-flash-preview",
  "gemini-1.5-flash": "gemini-3-flash-preview",
  "gemini-1.5-pro": "gemini-2.5-pro-preview-05-06",
};

function migrateAgent(agent: AgentConfig): AgentConfig {
  let changed = false;
  let patched = { ...agent };

  const validId = resolveVoiceId(agent.voiceId);
  if (validId !== agent.voiceId) {
    const voice = VOICE_CATALOG.find((v) => v.id === validId);
    patched = { ...patched, voiceId: validId, voiceName: voice?.name ?? "Maya" };
    changed = true;
  }

  const replacement = DEPRECATED_MODELS[agent.model];
  if (replacement) {
    patched = { ...patched, model: replacement };
    changed = true;
  } else if (agent.model && !MODEL_OPTIONS.some((m) => m.value === agent.model)) {
    patched = { ...patched, model: MODEL_OPTIONS[0].value };
    changed = true;
  }

  const TOOL_REMAP: Record<string, string> = {
    get_weather: "check_weather",
    schedule_meeting: "create_calendar_event",
  };
  const REMOVED_TOOLS = new Set(["create_ticket", "topic_explained"]);
  if (patched.enabledTools?.length) {
    const migrated = patched.enabledTools
      .map((t) => TOOL_REMAP[t] ?? t)
      .filter((t) => !REMOVED_TOOLS.has(t));
    if (migrated.join(",") !== patched.enabledTools.join(",")) {
      patched = { ...patched, enabledTools: migrated };
      changed = true;
    }
  }

  return changed ? patched : agent;
}

export function loadAgents(): AgentConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const agents = (parsed as AgentConfig[]).map(migrateAgent);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
        return agents;
      }
    }
  } catch {}
  return [];
}

export function getAgent(id: string): AgentConfig | null {
  return loadAgents().find((a) => a.id === id) ?? null;
}

export function saveAgent(config: AgentConfig): void {
  const agents = loadAgents();
  const idx = agents.findIndex((a) => a.id === config.id);
  const updated = { ...config, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    agents[idx] = updated;
  } else {
    agents.push(updated);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
}

export function deleteAgent(id: string): void {
  const agents = loadAgents().filter((a) => a.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
}

export function duplicateAgent(id: string): AgentConfig | null {
  const original = getAgent(id);
  if (!original) return null;
  const now = new Date().toISOString();
  const copy: AgentConfig = {
    ...original,
    id: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: `${original.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    status: "draft",
  };
  saveAgent(copy);
  return copy;
}
