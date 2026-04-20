import { useState } from "react";
import ConditionRow from "./ConditionRow";
import JoinerPill from "./JoinerPill";
import { ENTRY_ACTIONS, EXIT_ACTIONS, RISK_ACTIONS, makeCondition } from "../../types/strategyRules";
import {
  actionFromPaletteBlock,
  conditionPatchFromPaletteBlock,
  dataTransferHasCowriePalette,
  parsePaletteDragType,
  shouldAppendConditionFromPalette,
} from "../../utils/paletteDropMap";

const TYPE_META = {
  entry: { dot: "#2d8a55", bg: "#eaf3de", tc: "#27500a", label: "Entry" },
  exit: { dot: "#c0392b", bg: "#fcebeb", tc: "#791f1f", label: "Exit" },
  risk: { dot: "#888780", bg: "#f1efe8", tc: "#5f5e5a", label: "Risk" },
};

const delBtnStyle = {
  width: 17,
  height: 17,
  borderRadius: 3,
  border: "0.5px solid var(--color-border-secondary)",
  background: "none",
  cursor: "pointer",
  fontSize: 10,
  color: "var(--color-text-tertiary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function SectionLabel({ dot, color, label, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, ...style }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: dot, display: "block", flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color }}>
        {label}
      </span>
    </div>
  );
}

function AddButton({ onClick, label, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "7px 10px",
        width: "100%",
        border: "0.5px dashed var(--color-border-secondary)",
        borderRadius: 7,
        background: "none",
        fontSize: 12,
        color: "var(--color-text-tertiary)",
        cursor: "pointer",
        ...style,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> {label}
    </button>
  );
}

export default function SimpleRuleCard({ rule, index, onChange, onDelete }) {
  const meta = TYPE_META[rule.type] || TYPE_META.entry;
  const actOpts = rule.type === "entry" ? ENTRY_ACTIONS : rule.type === "exit" ? EXIT_ACTIONS : RISK_ACTIONS;
  const needsNum = rule.action?.includes("%");
  const [whenDragOver, setWhenDragOver] = useState(false);
  const [thenDragOver, setThenDragOver] = useState(false);

  function updateCond(condId, field, value) {
    onChange({ ...rule, conds: rule.conds.map((c) => (c.id === condId ? { ...c, [field]: value } : c)) });
  }
  function deleteCond(condId) {
    if (rule.conds.length <= 1) return;
    onChange({ ...rule, conds: rule.conds.filter((c) => c.id !== condId) });
  }
  function toggleJoiner(condId) {
    onChange({
      ...rule,
      conds: rule.conds.map((c) => (c.id === condId ? { ...c, joiner: c.joiner === "AND" ? "OR" : "AND" } : c)),
    });
  }
  function addCond() {
    onChange({
      ...rule,
      conds: [
        ...rule.conds,
        makeCondition({
          ind: "SMA(50)",
          op: "is above",
          val: "0",
          joiner: "AND",
        }),
      ],
    });
  }

  function appendCondFromPalette(blockType) {
    const patch = conditionPatchFromPaletteBlock(blockType);
    if (!patch) return;
    onChange({
      ...rule,
      conds: [...rule.conds, makeCondition({ ...patch, joiner: "AND" })],
    });
  }

  function onWhenDragOver(e) {
    if (!dataTransferHasCowriePalette(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setWhenDragOver(true);
  }

  function onWhenDrop(e) {
    e.preventDefault();
    setWhenDragOver(false);
    const t = parsePaletteDragType(e.dataTransfer);
    if (!t || !shouldAppendConditionFromPalette(t)) return;
    appendCondFromPalette(t);
  }

  function onThenDragOver(e) {
    if (!dataTransferHasCowriePalette(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setThenDragOver(true);
  }

  function onThenDrop(e) {
    e.preventDefault();
    setThenDragOver(false);
    const blockType = parsePaletteDragType(e.dataTransfer);
    if (!blockType) return;
    const next = actionFromPaletteBlock(blockType, rule.type);
    if (next) onChange({ ...rule, action: next });
  }

  return (
    <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "var(--color-background-secondary)",
          borderBottom: "0.5px solid var(--color-border-tertiary)",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 4, background: meta.bg, color: meta.tc }}>
          {meta.label}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", flex: 1 }}>Rule {index + 1}</span>
        <button type="button" className="delete-btn" onClick={onDelete} style={delBtnStyle}>
          ×
        </button>
      </div>

      <div style={{ padding: 12 }}>
        <SectionLabel dot="#7b68ee" color="#534ab7" label="When" />
        <div
          onDragLeave={() => setWhenDragOver(false)}
          onDragOver={onWhenDragOver}
          onDrop={onWhenDrop}
          style={{
            borderRadius: 8,
            marginBottom: 6,
            padding: whenDragOver ? 6 : 0,
            border: whenDragOver ? "1.5px dashed rgba(200, 150, 62, 0.45)" : "1.5px dashed transparent",
            background: whenDragOver ? "rgba(200, 150, 62, 0.05)" : "transparent",
            transition: "border-color 0.12s ease, background 0.12s ease",
          }}
        >
        {rule.conds.map((cond, ci) => (
          <div key={cond.id}>
            {ci > 0 ? <JoinerPill value={cond.joiner} onToggle={() => toggleJoiner(cond.id)} /> : null}
            <ConditionRow
              cond={cond}
              onChange={(f, v) => updateCond(cond.id, f, v)}
              onDelete={() => deleteCond(cond.id)}
              showDelete={rule.conds.length > 1}
            />
          </div>
        ))}
        <AddButton onClick={addCond} label="Add condition" style={{ marginTop: 6 }} />
        </div>

        <SectionLabel dot={meta.dot} color={meta.tc} label="Then" style={{ marginTop: 14 }} />
        <div
          onDragLeave={() => setThenDragOver(false)}
          onDragOver={onThenDragOver}
          onDrop={onThenDrop}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            background: thenDragOver ? "rgba(200, 150, 62, 0.08)" : "var(--color-background-secondary)",
            border: thenDragOver ? "1.5px dashed rgba(200, 150, 62, 0.55)" : "0.5px solid var(--color-border-tertiary)",
            borderRadius: 8,
            padding: "8px 10px",
            transition: "background 0.12s ease, border-color 0.12s ease",
          }}
        >
          <select
            value={rule.action}
            onChange={(e) => onChange({ ...rule, action: e.target.value })}
            style={{
              height: 28,
              fontSize: 13,
              fontWeight: 500,
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: 5,
              background: "var(--color-background-primary)",
              color: "var(--color-text-primary)",
              padding: "0 6px",
            }}
          >
            {actOpts.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          {needsNum ? (
            <>
              <input
                type="number"
                value={rule.actionVal}
                onChange={(e) => onChange({ ...rule, actionVal: e.target.value })}
                style={{
                  width: 48,
                  height: 28,
                  fontSize: 13,
                  fontWeight: 500,
                  border: "0.5px solid var(--color-border-secondary)",
                  borderRadius: 5,
                  background: "var(--color-background-primary)",
                  color: "var(--color-text-primary)",
                  padding: "0 6px",
                  textAlign: "center",
                }}
              />
              <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>%</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

