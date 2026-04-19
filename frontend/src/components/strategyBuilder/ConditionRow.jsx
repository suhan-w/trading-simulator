import { useState } from "react";
import { INDICATORS, OPERATORS } from "../../types/strategyRules";
import {
  conditionPatchFromPaletteBlock,
  dataTransferHasCowriePalette,
  parsePaletteDragType,
} from "../../utils/paletteDropMap";

const selStyle = {
  height: 28,
  fontSize: 13,
  fontWeight: 500,
  border: "0.5px solid var(--color-border-secondary)",
  borderRadius: 5,
  background: "var(--color-background-primary)",
  color: "var(--color-text-primary)",
  padding: "0 6px",
};

export default function ConditionRow({ cond, onChange, onDelete, showDelete }) {
  const needsVal = cond.op === "is above" || cond.op === "is below";
  const [dragOver, setDragOver] = useState(false);

  function onDragOverRow(e) {
    if (!dataTransferHasCowriePalette(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function onDragLeaveRow() {
    setDragOver(false);
  }

  function onDropRow(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const blockType = parsePaletteDragType(e.dataTransfer);
    const patch = conditionPatchFromPaletteBlock(blockType || "");
    if (!patch) return;
    Object.entries(patch).forEach(([k, v]) => onChange(k, v));
  }

  return (
    <div
      onDragEnter={onDragOverRow}
      onDragOver={onDragOverRow}
      onDragLeave={onDragLeaveRow}
      onDrop={onDropRow}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        background: dragOver ? "rgba(200, 150, 62, 0.08)" : "var(--color-background-secondary)",
        border: dragOver ? "1.5px dashed rgba(200, 150, 62, 0.65)" : "0.5px solid var(--color-border-tertiary)",
        borderRadius: 8,
        padding: "8px 10px",
        position: "relative",
        paddingRight: showDelete ? 28 : 10,
        transition: "background 0.12s ease, border-color 0.12s ease",
      }}
    >
      <select value={cond.ind} onChange={(e) => onChange("ind", e.target.value)} style={selStyle}>
        {INDICATORS.map((i) => (
          <option key={i}>{i}</option>
        ))}
      </select>
      <select value={cond.op} onChange={(e) => onChange("op", e.target.value)} style={selStyle}>
        {OPERATORS.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      {needsVal ? (
        <input
          type="number"
          value={cond.val || ""}
          onChange={(e) => onChange("val", e.target.value)}
          style={{ ...selStyle, width: 52, textAlign: "center" }}
        />
      ) : null}
      {showDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="delete-btn"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 17,
            height: 17,
            borderRadius: 3,
            border: "0.5px solid var(--color-border-secondary)",
            background: "none",
            cursor: "pointer",
            fontSize: 11,
            color: "var(--color-text-tertiary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

