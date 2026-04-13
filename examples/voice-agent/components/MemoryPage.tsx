import React, { useState, useEffect, useCallback } from "react";
import { gatewayConfig } from "../lib/gateway-config";
import { getDeviceId } from "../lib/device-id";
import Icon from "./Icon";

interface MemoryItem {
  text: string;
  type: string;
  created_at: string;
  id?: string;
}

interface MemoryStats {
  total: number;
  by_type: Record<string, number>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case "entity":
      return "memory-badge memory-badge--entity";
    case "preference":
      return "memory-badge memory-badge--preference";
    case "fact":
    default:
      return "memory-badge memory-badge--fact";
  }
}

export default function MemoryPage() {
  const [query, setQuery] = useState("");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const deviceId = getDeviceId();

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const sessionToken = gatewayConfig.getSessionToken();
      const headers: Record<string, string> = {
        "X-Device-Id": deviceId,
      };
      if (sessionToken) headers["X-Session-Token"] = sessionToken;

      const res = await fetch(
        `${gatewayConfig.httpBase}/agent/memory/stats/${deviceId}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // Stats are non-critical
    } finally {
      setStatsLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sessionToken = gatewayConfig.getSessionToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
      };
      if (sessionToken) headers["X-Session-Token"] = sessionToken;

      const res = await fetch(
        `${gatewayConfig.httpBase}/agent/memory/search`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: query.trim() || "*",
            user_id: deviceId,
            limit: 50,
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      const items: MemoryItem[] = Array.isArray(data)
        ? data
        : Array.isArray(data.results)
        ? data.results
        : Array.isArray(data.memories)
        ? data.memories
        : [];
      setMemories(items);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to search memories");
    } finally {
      setLoading(false);
    }
  }, [query, deviceId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  // Load all memories on mount
  useEffect(() => {
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="studio-page">
      <div className="studio-page-header">
        <h1 className="studio-page-title">Memory Browser</h1>
        <p className="studio-page-subtitle">
          Search and browse stored memories from your conversations
        </p>
      </div>

      {/* Stats card */}
      {stats && !statsLoading && (
        <div className="memory-stats-card">
          <div className="memory-stats-item">
            <span className="memory-stats-value">{stats.total}</span>
            <span className="memory-stats-label">Total Memories</span>
          </div>
          {Object.entries(stats.by_type || {}).map(([type, count]) => (
            <div className="memory-stats-item" key={type}>
              <span className="memory-stats-value">{count}</span>
              <span className="memory-stats-label">
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div className="memory-search-bar">
        <input
          type="text"
          className="memory-search-input"
          placeholder="Search memories..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? (
            "Searching..."
          ) : (
            <>
              <Icon name="search" size={16} /> Search
            </>
          )}
        </button>
      </div>

      {error && <div className="memory-error">{error}</div>}

      {/* Memory list */}
      {memories.length > 0 ? (
        <div className="memory-list">
          {memories.map((item, i) => (
            <div className="memory-item" key={item.id || i}>
              <div className="memory-item-header">
                <span className={typeBadgeClass(item.type)}>
                  {item.type || "fact"}
                </span>
                {item.created_at && (
                  <span className="memory-item-date">
                    {formatDate(item.created_at)}
                  </span>
                )}
              </div>
              <p className="memory-item-text">{item.text}</p>
            </div>
          ))}
        </div>
      ) : (
        !loading &&
        !error && (
          <div className="studio-empty-state">
            <div className="empty-icon">
              <Icon name="database" size={32} />
            </div>
            <h3>No memories found</h3>
            <p>
              Memories are created as you interact with the agent. Try a
              different search query or start a conversation.
            </p>
          </div>
        )
      )}
    </div>
  );
}
