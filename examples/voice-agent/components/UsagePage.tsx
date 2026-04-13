import React, { useState, useEffect, useCallback } from "react";
import { gatewayConfig } from "../lib/gateway-config";
import { getDeviceId } from "../lib/device-id";
import Icon from "./Icon";

interface DailyUsage {
  date: string;
  requests: number;
}

interface UsageData {
  total_requests: number;
  total_tokens: number;
  top_tools: { name: string; count: number }[];
  daily: DailyUsage[];
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const deviceId = getDeviceId();

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sessionToken = gatewayConfig.getSessionToken();
      const headers: Record<string, string> = {
        "X-Device-Id": deviceId,
      };
      if (sessionToken) headers["X-Session-Token"] = sessionToken;

      const res = await fetch(
        `${gatewayConfig.httpBase}/agent/usage?user_id=${deviceId}&period=30d`,
        { headers }
      );

      if (res.status === 404) {
        setError("Usage tracking not available");
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      setUsage(data);
    } catch (err: unknown) {
      const msg = (err as Error).message || "Failed to load usage data";
      if (msg.includes("404")) {
        setError("Usage tracking not available");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const maxDaily =
    usage?.daily?.reduce((m, d) => Math.max(m, d.requests), 0) || 1;

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <div className="studio-page">
      <div className="studio-page-header">
        <h1 className="studio-page-title">Usage Dashboard</h1>
        <p className="studio-page-subtitle">
          Monitor your API usage over the last 30 days
        </p>
      </div>

      {loading && (
        <div className="usage-loading">
          <div className="research-stream-dot" />
          Loading usage data...
        </div>
      )}

      {error && (
        <div className="usage-error-state">
          <div className="empty-icon">
            <Icon name="activity" size={32} />
          </div>
          <h3>{error}</h3>
          <p>This feature may not be enabled for your account.</p>
        </div>
      )}

      {usage && !error && (
        <>
          {/* Summary cards */}
          <div className="usage-summary-cards">
            <div className="usage-card">
              <div className="usage-card-icon">
                <Icon name="zap" size={20} />
              </div>
              <div className="usage-card-content">
                <span className="usage-card-value">
                  {(usage.total_requests ?? 0).toLocaleString()}
                </span>
                <span className="usage-card-label">Total Requests</span>
              </div>
            </div>
            <div className="usage-card">
              <div className="usage-card-icon">
                <Icon name="activity" size={20} />
              </div>
              <div className="usage-card-content">
                <span className="usage-card-value">
                  {(usage.total_tokens ?? 0).toLocaleString()}
                </span>
                <span className="usage-card-label">Tokens Used</span>
              </div>
            </div>
            <div className="usage-card">
              <div className="usage-card-icon">
                <Icon name="wrench" size={20} />
              </div>
              <div className="usage-card-content">
                <span className="usage-card-value">
                  {usage.top_tools?.length ?? 0}
                </span>
                <span className="usage-card-label">Tools Used</span>
              </div>
            </div>
          </div>

          {/* Top tools */}
          {usage.top_tools && usage.top_tools.length > 0 && (
            <div className="usage-section">
              <h2 className="usage-section-title">Top Tools</h2>
              <div className="usage-tools-list">
                {usage.top_tools.map((tool) => (
                  <div className="usage-tool-item" key={tool.name}>
                    <span className="usage-tool-name">{tool.name}</span>
                    <span className="usage-tool-count">
                      {tool.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily usage chart */}
          {usage.daily && usage.daily.length > 0 && (
            <div className="usage-section">
              <h2 className="usage-section-title">Daily Usage</h2>
              <div className="usage-chart">
                {usage.daily.map((day) => (
                  <div className="usage-chart-bar-wrapper" key={day.date}>
                    <div
                      className="usage-chart-bar"
                      style={{
                        height: `${Math.max(
                          4,
                          (day.requests / maxDaily) * 100
                        )}%`,
                      }}
                      title={`${day.requests} requests`}
                    />
                    <span className="usage-chart-label">
                      {formatDate(day.date)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !usage && !error && (
        <div className="studio-empty-state">
          <div className="empty-icon">
            <Icon name="activity" size={32} />
          </div>
          <h3>No usage data</h3>
          <p>Usage data will appear here as you interact with the agent.</p>
        </div>
      )}
    </div>
  );
}
