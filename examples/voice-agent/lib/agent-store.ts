import type { AgentConfig } from "./agent-config";
import { MODEL_OPTIONS } from "./agent-config";
import { resolveVoiceId, VOICE_CATALOG } from "./voice-catalog";
import { gatewayConfig } from "./gateway-config";
import { getDeviceId } from "./device-id";

const STORAGE_KEY = "whissle_agents";
const SYNC_TS_KEY = "whissle_agents_sync_ts";

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
  syncAgentToBackend(updated);
}

export function deleteAgent(id: string): void {
  const agents = loadAgents().filter((a) => a.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
  deleteAgentFromBackend(id);
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

// ---------------------------------------------------------------------------
// Backend sync — fire-and-forget persistence to /agent/configs
// ---------------------------------------------------------------------------

function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Device-Id": getDeviceId(),
  };
  const token = gatewayConfig.getSessionToken();
  if (token) h["X-Session-Token"] = token;
  return h;
}

/** Push a single agent config to the backend. Best-effort — errors are logged, not thrown. */
export function syncAgentToBackend(config: AgentConfig): void {
  const url = `${gatewayConfig.httpBase}/agent/configs`;
  fetch(url, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      user_id: getDeviceId(),
      agent_id: config.id,
      config,
    }),
  }).catch((e) => console.warn("[AgentSync] push failed:", e));
}

/** Delete an agent on the backend. Best-effort. */
export function deleteAgentFromBackend(id: string): void {
  const url = `${gatewayConfig.httpBase}/agent/configs/${encodeURIComponent(id)}`;
  fetch(url, {
    method: "DELETE",
    headers: apiHeaders(),
  }).catch((e) => console.warn("[AgentSync] delete failed:", e));
}

/** Duplicate an agent on the backend. Best-effort. */
export function duplicateAgentOnBackend(id: string): void {
  const url = `${gatewayConfig.httpBase}/agent/configs/${encodeURIComponent(id)}/duplicate`;
  fetch(url, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ user_id: getDeviceId() }),
  }).catch((e) => console.warn("[AgentSync] duplicate failed:", e));
}

/**
 * Pull configs from backend and merge with localStorage.
 * Remote-only configs are added locally; local-only configs are pushed to backend.
 * Returns the merged list.
 */
export async function syncFromBackend(): Promise<AgentConfig[]> {
  const userId = getDeviceId();
  const url = `${gatewayConfig.httpBase}/agent/configs?user_id=${encodeURIComponent(userId)}&limit=100`;

  try {
    const res = await fetch(url, { headers: apiHeaders() });
    if (!res.ok) return loadAgents();

    const remoteList = (await res.json()) as Array<{ id: string; name: string; config?: AgentConfig }>;
    const localAgents = loadAgents();
    const localMap = new Map(localAgents.map((a) => [a.id, a]));
    const remoteIds = new Set<string>();

    // Fetch full configs for remote agents and merge
    const fetchPromises: Promise<void>[] = [];
    for (const remote of remoteList) {
      remoteIds.add(remote.id);
      if (!localMap.has(remote.id)) {
        // Remote-only: fetch full config and add locally
        fetchPromises.push(
          fetch(`${gatewayConfig.httpBase}/agent/configs/${encodeURIComponent(remote.id)}`, {
            headers: apiHeaders(),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data?.config) {
                const migrated = migrateAgent({ ...data.config, id: remote.id } as AgentConfig);
                localMap.set(remote.id, migrated);
              }
            })
            .catch(() => {}),
        );
      }
    }
    await Promise.all(fetchPromises);

    // Push local-only configs to backend
    for (const agent of localAgents) {
      if (!remoteIds.has(agent.id)) {
        syncAgentToBackend(agent);
      }
    }

    const merged = Array.from(localMap.values());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    localStorage.setItem(SYNC_TS_KEY, String(Date.now()));
    return merged;
  } catch (e) {
    console.warn("[AgentSync] sync from backend failed:", e);
    return loadAgents();
  }
}
