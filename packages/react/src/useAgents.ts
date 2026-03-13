import { useState, useEffect, useCallback } from "react";

export interface Agent {
  id: string;
  name: string;
  description: string;
  mode: string;
}

export function useAgents(agentUrl: string) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    if (!agentUrl) {
      setAgents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = `${agentUrl.replace(/\/$/, "")}/live-assist/agents`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`);
      const data = await res.json();
      setAgents(data.agents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agents");
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [agentUrl]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return { agents, loading, error, refetch: fetchAgents };
}
