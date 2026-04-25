import { useMemo, useState } from "react";
import ConditionRow from "./ConditionRow";
import { ENTRY_ACTIONS, EXIT_ACTIONS } from "../../types/strategyRules";
import {
  actionFromPaletteBlock,
  conditionPatchFromPaletteBlock,
  dataTransferHasCowriePalette,
  parsePaletteDragType,
  shouldAppendConditionFromPalette,
} from "../../utils/paletteDropMap";
import { conditionIdFromLabel, indicatorTypeFor } from "../../constants/indicatorTypes";

const TYPE_META = {
  entry: { bg: "#eaf3de", tc: "#27500a", bc: "#639922", label: "ENTRY", title: "When to buy" },
  exit: { bg: "#FCEBEB", tc: "#791F1F", bc: "#E24B4A", label: "EXIT", title: "When to sell" },
};

function indicatorWithParams(cond) {
  const p = cond.indParams || {};
  if (cond.ind === "RSI") return `RSI (${p.rsiPeriod || "14"})`;
  if (cond.ind === "SMA") return `SMA (${p.smaPeriod || "20"})`;
  if (cond.ind === "EMA") return `EMA (${p.emaPeriod || "20"})`;
  if (cond.ind === "Bollinger Bands") return `BB (${p.bbPeriod || "20"}, ${p.bbStd || "2.0"})`;
  return cond.ind || "";
}

function readingSentence(rule) {
  const c = rule.conds?.[0];
  const side = rule.action?.startsWith("Sell") || rule.type === "exit" ? "Sell" : "Buy";
  if (!c?.ind || !c?.op) return "Complete the fields above to see your rule";
  const id = conditionIdFromLabel(c.op);
  const indType = indicatorTypeFor(c.ind);
  if (id === "two_indicators_cross" && !c.secondIndicator) return "Complete the fields above to see your rule";
  if (id !== "two_indicators_cross" && id !== "price_inside_band" && (c.val == null || String(c.val).trim() === "")) {
    return "Complete the fields above to see your rule";
  }
  if (indType === "band" && id !== "price_inside_band" && !c.bandSelection) return "Complete the fields above to see your rule";
  if (id === "price_inside_band") return `${side} when price is inside ${c.ind}`;
  if (id === "two_indicators_cross") return `${side} when ${indicatorWithParams(c)} crosses above ${c.secondIndicator} (20)`;
  if (c.ind === "RSI" && id === "crosses_above" && Number(c.val) === 30) return `${side} when ${indicatorWithParams(c)} crosses above 30 - oversold signal`;
  if (c.ind === "RSI" && id === "crosses_above" && Number(c.val) === 70) return `${side} when ${indicatorWithParams(c)} crosses above 70 - overbought signal`;
  if (indType === "line" && (id === "crosses_above" || id === "crosses_below")) {
    return `${side} when price ${id === "crosses_above" ? "crosses above" : "crosses below"} ${indicatorWithParams(c)}`;
  }
  if (indType === "band" && (id === "crosses_above" || id === "crosses_below")) {
    return `${side} when price ${id === "crosses_above" ? "crosses above" : "crosses below"} ${c.ind} ${c.bandSelection} band`;
  }
  return `${side} when ${indicatorWithParams(c)} is ${id === "greater_than" ? "greater than" : id === "less_than" ? "less than" : c.op.toLowerCase()} ${c.val}`;
}

export default function SimpleRuleCard({ rule, onChange, variables = [], isActive = true, isCollapsed = false, onEditCollapse }) {
  const meta = TYPE_META[rule.type] || TYPE_META.entry;
  const actOpts = rule.type === "entry" ? ENTRY_ACTIONS : EXIT_ACTIONS;
  const needsNum = rule.action?.includes("%") || rule.action?.includes("fixed amount");
  const valueSuffix = rule.action?.includes("%") ? "%" : rule.action?.includes("fixed amount") ? "AUD" : "";
  const [whenDragOver, setWhenDragOver] = useState(false);
  const [thenDragOver, setThenDragOver] = useState(false);

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

  const primaryCond = rule.conds?.[0];
  const validation = primaryCond ? condValidation(primaryCond) : { incomplete: true, invalid: false, message: "" };
  const hasIncomplete = validation.incomplete && !validation.invalid;
  const statusStyle = hasIncomplete
    ? { border: "1px solid #e0ded8", borderLeft: "3px solid #FAEEDA" }
    : isActive
      ? { border: "1px solid #111111" }
      : { border: "0.5px solid #e0ded8" };
  const sentence = useMemo(() => readingSentence(rule), [rule]);
  const cardMuted = !isActive && !isCollapsed;

  function updateCond(field, value) {
    if (!primaryCond) return;
    onChange({ ...rule, conds: rule.conds.map((c) => (c.id === primaryCond.id ? { ...c, [field]: value } : c)) });
  }

  function applyPatchToPrimaryCond(blockType) {
    const patch = conditionPatchFromPaletteBlock(blockType);
    if (!patch || !primaryCond) return;
    onChange({ ...rule, conds: rule.conds.map((c) => (c.id === primaryCond.id ? { ...c, ...patch } : c)) });
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
    applyPatchToPrimaryCond(t);
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
    <div
      style={{
        borderRadius: 12,
        overflow: "hidden",
        padding: 20,
        background: "#fff",
        opacity: cardMuted ? 0.5 : 1,
        pointerEvents: cardMuted ? "none" : "auto",
        ...statusStyle,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: isCollapsed ? 4 : 14, borderBottom: isCollapsed ? "none" : "0.5px solid #ede9e3" }}>
        <span style={{ fontSize: 10, fontWeight: 600, padding: "4px 9px", borderRadius: 20, background: meta.bg, color: meta.tc, border: `1px solid ${meta.bc}` }}>{meta.label}</span>
        <span style={{ fontSize: 16, fontWeight: 500, color: "#111", flex: 1 }}>{meta.title}</span>
        {!hasIncomplete ? <span style={{ fontSize: 12, color: "#111" }}>✓ Complete</span> : null}
        {isCollapsed ? (
          <button type="button" onClick={onEditCollapse} style={{ border: 0, background: "transparent", color: "#555", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>
            Edit
          </button>
        ) : null}
      </div>

      {!isCollapsed && primaryCond ? (
        <div style={{ paddingTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8b877f", marginBottom: 6 }}>When this happens...</div>
          <div onDragLeave={() => setWhenDragOver(false)} onDragOver={onWhenDragOver} onDrop={onWhenDrop} style={{ borderRadius: 8, marginBottom: 6, padding: whenDragOver ? 6 : 0, border: whenDragOver ? "1.5px dashed rgba(200, 150, 62, 0.45)" : "1.5px dashed transparent", background: whenDragOver ? "rgba(200, 150, 62, 0.05)" : "transparent", transition: "border-color 0.12s ease, background 0.12s ease" }}>
            <ConditionRow cond={primaryCond} onChange={updateCond} onDelete={() => {}} showDelete={false} errorMessage={validation.invalid ? validation.message : ""} variables={variables} />
          </div>

          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8b877f", marginTop: 14, marginBottom: 6 }}>Then do this...</div>
          <div onDragLeave={() => setThenDragOver(false)} onDragOver={onThenDragOver} onDrop={onThenDrop} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: thenDragOver ? "rgba(200, 150, 62, 0.08)" : "#f8f7f4", border: thenDragOver ? "1.5px dashed rgba(200, 150, 62, 0.55)" : "0.5px solid #e0ded8", borderRadius: 8, padding: "8px 10px", transition: "background 0.12s ease, border-color 0.12s ease" }}>
            <select value={rule.action} onChange={(e) => onChange({ ...rule, action: e.target.value })} style={{ height: 30, fontSize: 12, fontWeight: 500, border: "0.5px solid #d6d3cd", borderRadius: 8, background: "#fff", color: "#111", padding: "0 10px" }}>
              {actOpts.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            {needsNum ? (
              <>
                <input type="number" value={rule.actionVal} onChange={(e) => onChange({ ...rule, actionVal: e.target.value })} style={{ width: 72, height: 30, fontSize: 12, fontWeight: 500, border: "0.5px solid #d6d3cd", borderRadius: 8, background: "#fff", color: "#111", padding: "0 6px", textAlign: "center" }} />
                <span style={{ fontSize: 12, color: "#666" }}>{valueSuffix}</span>
              </>
            ) : null}
          </div>
          {hasIncomplete ? <div style={{ marginTop: 8, fontSize: 11, color: "#777" }}>Fill in the fields above to complete this rule</div> : null}
        </div>
      ) : null}

      <div style={{ marginTop: 10, borderRadius: 8, background: "#f8f7f4", padding: "10px 14px", fontSize: 12, color: "#555" }}>{sentence}</div>
    </div>
  );
}
