import React, { useState, useRef, useCallback } from "react";
import { gatewayConfig } from "../lib/gateway-config";
import { getDeviceId } from "../lib/device-id";
import Icon from "./Icon";

interface Source {
  title?: string;
  url?: string;
  snippet?: string;
}

export default function ResearchPage() {
  const [query, setQuery] = useState("");
  const [streamText, setStreamText] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || loading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setStreamText("");
    setSources([]);
    setError(null);

    try {
      const deviceId = getDeviceId();
      const url = gatewayConfig.agentStreamUrl;

      const body = {
        query: query.trim(),
        user_id: deviceId,
        source_app: "whissle_studio",
        mode_hint: "deep_research",
        context: "",
      };

      const sessionToken = gatewayConfig.getSessionToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-Device-Id": deviceId,
      };
      if (sessionToken) headers["X-Session-Token"] = sessionToken;

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${text}`);
      }

      if (!res.body) {
        const text = await res.text();
        setStreamText(text);
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const event = parsed.event as string;

            if (event === "chunk" && typeof parsed.text === "string") {
              accumulated += parsed.text;
              setStreamText(accumulated);
            }

            if (event === "done") {
              if (typeof parsed.summary === "string") {
                setStreamText(parsed.summary);
              }
              if (Array.isArray(parsed.sources)) {
                setSources(parsed.sources.map((s: Record<string, unknown>) => ({
                  title: s.title as string || s.url as string || "",
                  url: s.url as string || "",
                  snippet: s.snippet as string || "",
                })));
              }
            }

            if (event === "error") {
              setError(typeof parsed.message === "string" ? parsed.message : "Unknown error");
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message || "Research failed");
      }
    } finally {
      setLoading(false);
    }
  }, [query, loading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch]);

  return (
    <div className="studio-page">
      <div className="studio-page-header">
        <h1 className="studio-page-title">Research</h1>
        <p className="studio-page-subtitle">Deep research with sourced citations powered by AI</p>
      </div>

      <div className="research-input-bar">
        <input
          type="text"
          className="research-input"
          placeholder="Ask a research question..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSearch}
          disabled={!query.trim() || loading}
        >
          {loading ? "Researching..." : <><Icon name="search" size={16} /> Research</>}
        </button>
      </div>

      {error && (
        <div className="research-error">{error}</div>
      )}

      {loading && !streamText && (
        <div className="research-stream-indicator">
          <div className="research-stream-dot" />
          Searching and analyzing sources...
        </div>
      )}

      {streamText && (
        <div className="research-results">
          {loading && (
            <div className="research-stream-indicator research-stream-indicator--spaced">
              <div className="research-stream-dot" />
              Still researching...
            </div>
          )}
          <div dangerouslySetInnerHTML={{ __html: markdownToHtml(streamText) }} />
        </div>
      )}

      {sources.length > 0 && (
        <div className="research-sources">
          <h3 className="research-sources-title">
            Sources ({sources.length})
          </h3>
          {sources.map((s, i) => (
            <div key={i} className="research-source-item">
              <span className="research-source-num">[{i + 1}]</span>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a>
              ) : (
                <span>{s.title}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && !streamText && (
        <div className="studio-empty-state">
          <div className="empty-icon"><Icon name="search" size={32} /></div>
          <h3>Ask anything</h3>
          <p>Enter a research question to get a comprehensive, sourced answer.</p>
        </div>
      )}
    </div>
  );
}

function markdownToHtml(md: string): string {
  // Escape HTML entities first to prevent XSS
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Inline code
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");

  // Links: [text](url) — only allow http(s) URLs
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Unordered lists: lines starting with - or *
  html = html.replace(/^(?:[-*]) (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Ordered lists: lines starting with 1. 2. etc.
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    if (match.includes("<ul>")) return match;
    return `<ol>${match}</ol>`;
  });

  // Paragraphs
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, "");

  return html;
}
