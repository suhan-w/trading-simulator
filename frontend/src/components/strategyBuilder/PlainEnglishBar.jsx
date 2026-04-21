export function toPlainEnglishSimple(rules) {
  if (!rules.length) return null;
  return rules.map((rule, ri) => {
    if (rule.type === "risk") {
      return `Risk: ${rule.action}${rule.actionVal ? " at " + rule.actionVal + "%" : ""}.`;
    }
    const condStr = rule.conds
      .map((c, ci) => {
        const j = ci === 0 ? "" : ` ${c.joiner} `;
        const v = c.val ? ` ${c.val}` : "";
        return `${j}${c.ind} ${c.op}${v}`;
      })
      .join("");
    const verb = rule.type === "entry" ? "Buy" : "Sell";
    return `Rule ${ri + 1}: ${verb} when ${condStr} → ${rule.action}.`;
  });
}

export function toPlainEnglishAdvanced(rules) {
  if (!rules.length) return null;
  return rules.map((rule, ri) => {
    const stepStr = rule.steps
      .map((step, si) => {
        const cs = step.conds
          .map((c, ci) => {
            const j = ci === 0 ? "" : ` ${c.joiner} `;
            const v = c.val ? ` ${c.val}` : "";
            return `${j}${c.ind} ${c.op}${v}`;
          })
          .join("");
        return si === 0 ? cs : `then ${cs}`;
      })
      .join(", ");
    const verb = rule.type === "risk" ? rule.action : rule.type === "entry" ? "Buy" : "Sell";
    return `Rule ${ri + 1}: ${verb} when ${stepStr}.`;
  });
}

export default function PlainEnglishBar({ sentences }) {
  if (!sentences || !sentences.length) {
    return (
      <div style={barStyle}>
        <span style={tagStyle}>Reading</span>
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
          Add rules above to see your strategy in plain English.
        </span>
      </div>
    );
  }
  return (
    <div style={barStyle}>
      <span style={tagStyle}>Reading</span>
      <span style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.65, flex: 1 }}>
        {sentences.map((s, i) => (
          <span key={`${i}-${typeof s === "string" ? s : s?.id || "sentence"}`}>
            {i > 0 ? " " : null}
            <span style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{typeof s === "string" ? s : s?.text || ""}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

const barStyle = {
  borderTop: "0.5px solid var(--color-border-tertiary)",
  padding: "10px 16px",
  background: "var(--color-background-secondary)",
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
};
const tagStyle = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--color-text-tertiary)",
  whiteSpace: "nowrap",
  paddingTop: 1,
};

