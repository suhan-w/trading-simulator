import { useState } from "react";
import ConditionRow from "./ConditionRow";
import JoinerPill from "./JoinerPill";
import { ENTRY_ACTIONS, EXIT_ACTIONS, RISK_ACTIONS, makeCondition, makeStep } from "../../types/strategyRules";
import {
  actionFromPaletteBlock,
  conditionPatchFromPaletteBlock,
  dataTransferHasCowriePalette,
  parsePaletteDragType,
  shouldAppendConditionFromPalette,
} from "../../utils/paletteDropMap";
import { conditionIdFromLabel, indicatorTypeFor } from "../../constants/indicatorTypes";

function condValidation(cond) {
  const type = indicatorTypeFor(cond.ind);
  const conditionId = conditionIdFromLabel(cond.op);
  const isTwoCross = conditionId === "two_indicators_cross";
  const needsBand = type === "band" && conditionId !== "price_inside_band";
  const needsValue = conditionId !== "price_inside_band" && conditionId !== "two_indicators_cross";
  const hasValue = cond.val !== null && cond.val !== undefined && String(cond.val).trim() !== "";
  if (!cond.ind || !cond.op) return { incomplete: true, invalid: false, message: "" };
  if (needsBand && !cond.bandSelection) return { incomplete: true, invalid: false, message: "" };
  if (isTwoCross && !String(cond.secondIndicator || "").trim()) return { incomplete: true, invalid: false, message: "" };
  if (needsValue && !hasValue) return { incomplete: true, invalid: false, message: "" };
  if (isTwoCross && indicatorTypeFor(cond.secondIndicator) !== "line") {
    return { incomplete: false, invalid: true, message: "Two indicators cross requires a Line-type second indicator." };
  }
  return { incomplete: false, invalid: false, message: "" };
}

const TYPE_META = {
  entry: { dot: "#2d8a55", bg: "#eaf3de", tc: "#27500a", label: "Entry" },
  exit: { dot: "#c0392b", bg: "#fcebeb", tc: "#791f1f", label: "Exit" },
  risk: { dot: "#888780", bg: "#f1efe8", tc: "#5f5e5a", label: "Risk" },
};

function StepConditions({ step, onChange, variables = [] }) {
  const validations = step.conds.map(condValidation);
  const [whenDragOver, setWhenDragOver] = useState(false);

  function updateCond(condId, field, value) {
    onChange({ ...step, conds: step.conds.map((c) => (c.id === condId ? { ...c, [field]: value } : c)) });
  }
  function deleteCond(condId) {
    if (step.conds.length <= 1) return;
    onChange({ ...step, conds: step.conds.filter((c) => c.id !== condId) });
  }
  function toggleJoiner(condId) {
    onChange({
      ...step,
      conds: step.conds.map((c) => (c.id === condId ? { ...c, joiner: c.joiner === "AND" ? "OR" : "AND" } : c)),
    });
  }
  function addCond() {
    onChange({
      ...step,
      conds: [...step.conds, makeCondition({ ind: "RSI", op: "is above", val: "50", joiner: "AND" })],
    });
  }

  function appendFromPalette(blockType) {
    const patch = conditionPatchFromPaletteBlock(blockType);
    if (!patch) return;
    onChange({
      ...step,
      conds: [...step.conds, makeCondition({ ...patch, joiner: "AND" })],
    });
  }

  function applyPatchToPrimaryCond(blockType) {
    const patch = conditionPatchFromPaletteBlock(blockType);
    if (!patch) return false;
    if (!step.conds.length) {
      onChange({ ...step, conds: [makeCondition({ ...patch, joiner: "AND" })] });
      return true;
    }
    const firstId = step.conds[0].id;
    onChange({
      ...step,
      conds: step.conds.map((c) => (c.id === firstId ? { ...c, ...patch } : c)),
    });
    return true;
  }

  function onWhenDragOver(e) {
    e.preventDefault();
    if (dataTransferHasCowriePalette(e.dataTransfer)) e.dataTransfer.dropEffect = "copy";
    setWhenDragOver(true);
  }

  function onWhenDrop(e) {
    e.preventDefault();
    setWhenDragOver(false);
    const t = parsePaletteDragType(e.dataTransfer);
    if (!t || !shouldAppendConditionFromPalette(t)) return;
    // Match user expectation: dropped block updates the visible condition row.
    if (!applyPatchToPrimaryCond(t)) appendFromPalette(t);
  }

  return (
    <div
      style={{
        marginBottom: 6,
        borderRadius: 8,
        padding: whenDragOver ? 6 : 0,
        border: whenDragOver ? "1.5px dashed rgba(200, 150, 62, 0.45)" : "1.5px dashed transparent",
        background: whenDragOver ? "rgba(200, 150, 62, 0.05)" : "transparent",
        transition: "border-color 0.12s ease, background 0.12s ease",
      }}
      onDragLeave={() => setWhenDragOver(false)}
      onDragOver={onWhenDragOver}
      onDrop={onWhenDrop}
    >
      {step.conds.map((cond, ci) => (
        <div key={cond.id}>
          {ci > 0 ? <JoinerPill value={cond.joiner} onToggle={() => toggleJoiner(cond.id)} /> : null}
          <ConditionRow
            cond={cond}
            onChange={(f, v) => updateCond(cond.id, f, v)}
            onDelete={() => deleteCond(cond.id)}
            showDelete={step.conds.length > 1}
            errorMessage={validations[ci]?.invalid ? validations[ci].message : ""}
            variables={variables}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addCond}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "6px 10px",
          width: "100%",
          border: "0.5px dashed var(--color-border-secondary)",
          borderRadius: 7,
          background: "none",
          fontSize: 11,
          color: "var(--color-text-tertiary)",
          cursor: "pointer",
          marginTop: 4,
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }}>+</span> Add condition
      </button>
    </div>
  );
}

function advancedRuleReading(rule) {
  const c = rule.steps?.[0]?.conds?.[0];
  if (!c || !c.ind || !c.op) return "Complete the rule above to see a summary.";
  if (c.ind === "Bollinger Bands" && c.op === "price inside band") return "Buy when price is inside Bollinger Bands.";
  return `${rule.type === "entry" ? "Buy" : "Sell"} when ${c.ind} ${c.op}${c.val ? ` ${c.val}` : ""}.`;
}

export default function AdvancedRuleCard({ rule, index, onChange, onDelete, variables = [] }) {
  const meta = TYPE_META[rule.type] || TYPE_META.entry;
  const actOpts = rule.type === "entry" ? ENTRY_ACTIONS : rule.type === "exit" ? EXIT_ACTIONS : RISK_ACTIONS;
  const needsNum = rule.action?.includes("%") || rule.action?.includes("fixed amount");
  const valueSuffix = rule.action?.includes("%") ? "%" : rule.action?.includes("fixed amount") ? "AUD" : "";
  const [thenDragOver, setThenDragOver] = useState(false);
  const validations = (rule.steps || []).flatMap((s) => (s.conds || []).map(condValidation));
  const hasInvalid = validations.some((v) => v.invalid);
  const hasIncomplete = !hasInvalid && validations.some((v) => v.incomplete);
  const statusStyle = hasInvalid
    ? { border: "1px solid #E24B4A", borderLeft: "4px solid #E24B4A" }
    : hasIncomplete
      ? { border: "1px solid #854F0B", borderLeft: "4px solid #854F0B" }
      : { border: "0.5px solid var(--color-border-tertiary)" };

  function updateStep(stepId, updatedStep) {
    onChange({ ...rule, steps: rule.steps.map((s) => (s.id === stepId ? updatedStep : s)) });
  }
  function addStep() {
    onChange({ ...rule, steps: [...rule.steps, makeStep()] });
  }
  function deleteStep(stepId) {
    if (rule.steps.length <= 1) return;
    onChange({ ...rule, steps: rule.steps.filter((s) => s.id !== stepId) });
  }

  function onThenDragOver(e) {
    e.preventDefault();
    if (dataTransferHasCowriePalette(e.dataTransfer)) e.dataTransfer.dropEffect = "copy";
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
    <div style={{ borderRadius: 8, overflow: "hidden", ...statusStyle }}>
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
        <button
          type="button"
          className="delete-btn"
          onClick={onDelete}
          style={{
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
          }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: 12 }}>
        {rule.steps.map((step, si) => (
          <div key={step.id}>
            {si > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", marginBottom: 4 }}>
                <div style={{ width: 1, height: 20, background: "#c8963e", marginLeft: 10 }} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    padding: "2px 9px",
                    borderRadius: 4,
                    background: "#faeeda",
                    color: "#633806",
                    border: "0.5px solid #ef9f27",
                    letterSpacing: "0.04em",
                  }}
                >
                  THEN (later)
                </span>
                <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>this condition follows after</span>
                {rule.steps.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => deleteStep(step.id)}
                    style={{ marginLeft: "auto", fontSize: 10, color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ) : null}
            <StepConditions step={step} onChange={(updated) => updateStep(step.id, updated)} variables={variables} />
          </div>
        ))}

        <button
          type="button"
          onClick={addStep}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "7px 10px",
            width: "100%",
            border: "0.5px dashed #c8963e",
            borderRadius: 7,
            background: "none",
            fontSize: 12,
            color: "#854f0b",
            cursor: "pointer",
            marginTop: 8,
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1, color: "#c8963e" }}>+</span> Add THEN step (sequential)
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: meta.dot, display: "block" }} />
          <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: meta.tc }}>Then</span>
        </div>
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
                  width: 72,
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
              <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{valueSuffix}</span>
            </>
          ) : null}
        </div>
        {hasIncomplete ? (
          <div
            style={{
              marginTop: 8,
              borderRadius: 6,
              border: "1px solid #854F0B",
              color: "#633806",
              background: "#FAEEDA",
              fontSize: 11,
              padding: "6px 8px",
            }}
          >
            Complete this rule to activate.
          </div>
        ) : null}
        <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>{advancedRuleReading(rule)}</p>
      </div>
    </div>
  );
}

