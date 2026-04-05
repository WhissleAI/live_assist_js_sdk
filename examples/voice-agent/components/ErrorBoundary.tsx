import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleClearData = () => {
    try {
      localStorage.removeItem("whissle_kids_sessions");
      localStorage.removeItem("whissle_agents_sessions");
      localStorage.removeItem("whissle_agents");
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            padding: 32,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            color: "#1e293b",
            background: "#f8fafc",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", marginBottom: 8, fontWeight: 700 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#64748b", maxWidth: 420, marginBottom: 24, lineHeight: 1.5 }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: "10px 20px",
                background: "#6366f1",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: 500,
              }}
            >
              Try Again
            </button>
            <button
              onClick={this.handleClearData}
              style={{
                padding: "10px 20px",
                background: "transparent",
                color: "#64748b",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              Clear Data &amp; Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
