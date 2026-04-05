import React from "react";

/** Catches render errors so a failed component does not leave #root empty. */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    console.error(err, info.componentStack);
  }

  render() {
    if (this.state.err) {
      const msg = this.state.err?.message || String(this.state.err);
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: 24,
            fontFamily: "system-ui, sans-serif",
            background: "#f5f3ef",
            color: "#111",
          }}
        >
          <h1 style={{ fontSize: 18, margin: "0 0 12px" }}>Something went wrong</h1>
          <pre
            style={{
              fontSize: 13,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              margin: "0 0 16px",
              padding: 12,
              background: "#fff",
              borderRadius: 8,
              border: "1px solid rgba(17,17,17,0.1)",
            }}
          >
            {msg}
          </pre>
          <button
            type="button"
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#111",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
