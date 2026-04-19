export default function JoinerPill({ value, onToggle }) {
  const isAnd = value === "AND";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 10px" }}>
      <div style={{ flex: 1, height: "0.5px", background: "var(--color-border-tertiary)" }} />
      <button
        type="button"
        onClick={onToggle}
        style={{
          fontSize: 10,
          fontWeight: 500,
          padding: "2px 10px",
          borderRadius: 10,
          cursor: "pointer",
          border: "0.5px solid",
          background: isAnd ? "#e6f1fb" : "#eeedfe",
          color: isAnd ? "#0c447c" : "#3c3489",
          borderColor: isAnd ? "#85b7eb" : "#afa9ec",
          transition: "all 0.1s",
        }}
      >
        {value}
      </button>
      <div style={{ flex: 1, height: "0.5px", background: "var(--color-border-tertiary)" }} />
    </div>
  );
}

