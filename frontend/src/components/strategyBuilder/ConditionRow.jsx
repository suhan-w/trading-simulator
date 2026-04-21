import { useMemo, useState } from "react";
import { INDICATORS } from "../../types/strategyRules";
import {
  conditionPatchFromPaletteBlock,
  dataTransferHasCowriePalette,
  parsePaletteDragType,
} from "../../utils/paletteDropMap";
import {
  CONDITION_ANNOTATION,
  CONDITION_COMPAT,
  INDICATOR_GROUPS,
  TYPE_BADGE_TOKENS,
  compatibleConditions,
  conditionIdFromLabel,
  conditionLabelFromId,
  indicatorTypeFor,
  normalizeIndicatorName,
} from "../../constants/indicatorTypes";

const pillBase = {
  minHeight: 30,
  fontSize: 12,
  borderRadius: 8,
  border: "0.5px solid #d6d3cd",
  background: "#fff",
  color: "#111",
  padding: "6px 10px",
};

function normalizeIndicator(ind) {
  const normalized = normalizeIndicatorName(ind);
  if (!String(ind || "").trim()) return "";
  return INDICATORS.includes(normalized) ? normalized : "";
}

export default function ConditionRow({ cond, onChange, onDelete, showDelete, errorMessage = "", variables = [] }) {
  const indicator = normalizeIndicator(cond.ind || "");
  const indicatorType = indicatorTypeFor(indicator);
  const conditionId = conditionIdFromLabel(cond.op);
  const bandSelection = cond.bandSelection || null;
  const params = cond.indParams || {};
  const [dragOver, setDragOver] = useState(false);
  const [showParams, setShowParams] = useState(false);
  const compat = CONDITION_COMPAT[conditionId]?.[indicatorType] || "allowed";
  const availableConditions = useMemo(
    () => compatibleConditions(indicatorType, bandSelection).filter((o) => !(indicatorType === "band" && !bandSelection && o.id !== "price_inside_band")),
    [indicatorType, bandSelection]
  );
  const needsBandBeforeCondition = indicatorType === "band" && !bandSelection && conditionId !== "price_inside_band";
  const needsValue =
    conditionId !== "two_indicators_cross" &&
    conditionId !== "price_inside_band" &&
    !(indicatorType === "band" && needsBandBeforeCondition);

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
    if (!patch) {
      try {
        const rawVar = e.dataTransfer.getData("application/x-cowrie-variable");
        if (rawVar) {
          const parsed = JSON.parse(rawVar);
          if (parsed?.source === "variable") {
            onChange("valSourceVar", String(parsed.name || ""));
            onChange("val", String(parsed.value ?? ""));
          }
        }
      } catch {
        // ignore variable parse failures
      }
      return;
    }
    if (patch.ind != null) {
      const nextIndicator = normalizeIndicatorName(patch.ind);
      onChange("ind", nextIndicator);
      onChange("indicatorType", indicatorTypeFor(nextIndicator));
      onChange("bandSelection", null);
      onChange("secondIndicator", "");
      onChange("op", conditionLabelFromId("greater_than"));
      onChange("val", "");
    }
    if (patch.op != null) {
      onChange("op", conditionLabelFromId(conditionIdFromLabel(patch.op)));
      onChange("val", "");
    }
    if (patch.val != null) onChange("val", patch.val);
  }

  function setIndicator(next) {
    const normalized = normalizeIndicatorName(next);
    onChange("ind", normalized);
    onChange("indicatorType", indicatorTypeFor(normalized));
    onChange("bandSelection", null);
    onChange("secondIndicator", "");
    onChange("op", "");
    onChange("val", "");
  }

  function setCondition(nextId) {
    onChange("op", conditionLabelFromId(nextId));
    onChange("val", "");
    if (nextId === "price_inside_band") onChange("bandSelection", null);
  }

  const badge = indicatorType ? TYPE_BADGE_TOKENS[indicatorType] : null;
  const selectedVariable = variables.find((v) => v.name === cond.valSourceVar);
  const fieldEmptyStyle = { border: "0.5px dashed #b9b5ad", color: "#8b877f" };
  const showBandSelector = indicatorType === "band" && conditionId !== "price_inside_band";
  const showConditionLocked = indicatorType === "band" && !bandSelection && conditionId !== "price_inside_band";

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
      <select value={indicator} onChange={(e) => setIndicator(e.target.value)} style={{ ...pillBase, ...(cond.ind ? null : fieldEmptyStyle) }}>
        <option value="" disabled>
          Indicator
        </option>
        {INDICATOR_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.items.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {badge ? (
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            borderRadius: 20,
            padding: "2px 8px",
            border: `1px solid ${badge.border}`,
            color: badge.text,
            background: badge.bg,
          }}
        >
          {badge.label}
        </span>
      ) : null}
      {indicator !== "Volume" && cond.ind ? (
        <button type="button" style={{ ...pillBase, cursor: "pointer", minHeight: 26, padding: "4px 10px" }} onClick={() => setShowParams((v) => !v)}>
          Parameters
        </button>
      ) : null}

      {showParams && indicator === "SMA" ? (
        <input
          type="number"
          min={1}
          value={params.smaPeriod ?? "20"}
          onChange={(e) => onChange("indParams", { ...params, smaPeriod: e.target.value })}
          style={{ ...pillBase, width: 68, textAlign: "center" }}
          title="SMA period"
          aria-label="SMA period"
        />
      ) : null}
      {showParams && indicator === "EMA" ? (
        <input
          type="number"
          min={1}
          value={params.emaPeriod ?? "12"}
          onChange={(e) => onChange("indParams", { ...params, emaPeriod: e.target.value })}
          style={{ ...pillBase, width: 68, textAlign: "center" }}
          title="EMA period"
          aria-label="EMA period"
        />
      ) : null}
      {showParams && indicator === "RSI" ? (
        <input
          type="number"
          min={2}
          value={params.rsiPeriod ?? "14"}
          onChange={(e) => onChange("indParams", { ...params, rsiPeriod: e.target.value })}
          style={{ ...pillBase, width: 68, textAlign: "center" }}
          title="RSI period"
          aria-label="RSI period"
        />
      ) : null}
      {showParams && indicator === "MACD" ? (
        <>
          <input
            type="number"
            min={1}
            value={params.macdFast ?? "12"}
            onChange={(e) => onChange("indParams", { ...params, macdFast: e.target.value })}
            style={{ ...pillBase, width: 58, textAlign: "center" }}
            title="MACD fast period"
            aria-label="MACD fast period"
          />
          <input
            type="number"
            min={1}
            value={params.macdSlow ?? "26"}
            onChange={(e) => onChange("indParams", { ...params, macdSlow: e.target.value })}
            style={{ ...pillBase, width: 58, textAlign: "center" }}
            title="MACD slow period"
            aria-label="MACD slow period"
          />
          <input
            type="number"
            min={1}
            value={params.macdSignal ?? "9"}
            onChange={(e) => onChange("indParams", { ...params, macdSignal: e.target.value })}
            style={{ ...pillBase, width: 58, textAlign: "center" }}
            title="MACD signal period"
            aria-label="MACD signal period"
          />
        </>
      ) : null}
      {showParams && indicator === "Bollinger Bands" ? (
        <>
          <input
            type="number"
            min={2}
            value={params.bbPeriod ?? "20"}
            onChange={(e) => onChange("indParams", { ...params, bbPeriod: e.target.value })}
            style={{ ...pillBase, width: 68, textAlign: "center" }}
            title="Bollinger period"
            aria-label="Bollinger period"
          />
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={params.bbStd ?? "2"}
            onChange={(e) => onChange("indParams", { ...params, bbStd: e.target.value })}
            style={{ ...pillBase, width: 68, textAlign: "center" }}
            title="Bollinger standard deviations"
            aria-label="Bollinger standard deviations"
          />
        </>
      ) : null}
      {showParams && indicator === "Keltner Channel" ? (
        <>
          <input
            type="number"
            min={2}
            value={params.kcPeriod ?? "20"}
            onChange={(e) => onChange("indParams", { ...params, kcPeriod: e.target.value })}
            style={{ ...pillBase, width: 68, textAlign: "center" }}
            title="Keltner period"
            aria-label="Keltner period"
          />
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={params.kcMultiplier ?? "1.5"}
            onChange={(e) => onChange("indParams", { ...params, kcMultiplier: e.target.value })}
            style={{ ...pillBase, width: 68, textAlign: "center" }}
            title="Keltner multiplier"
            aria-label="Keltner multiplier"
          />
        </>
      ) : null}
      {showBandSelector ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {["upper", "middle", "lower"].map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => onChange("bandSelection", b)}
              style={{
                ...pillBase,
                minHeight: 26,
                cursor: "pointer",
                borderRadius: 20,
                border: `1px solid ${bandSelection === b ? "#0F6E56" : "var(--color-border-secondary)"}`,
                background: bandSelection === b ? "#0F6E56" : "var(--color-background-primary)",
                color: bandSelection === b ? "#ffffff" : "var(--color-text-secondary)",
              }}
            >
              {b} band
            </button>
          ))}
        </div>
      ) : null}
      <select
        value={conditionId}
        onChange={(e) => setCondition(e.target.value)}
        style={{ ...pillBase, ...(conditionId ? null : fieldEmptyStyle), ...(showConditionLocked ? { opacity: 0.5, cursor: "not-allowed" } : null) }}
        disabled={showConditionLocked}
      >
        <option value="" disabled>
          Condition
        </option>
        {availableConditions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
            {indicatorType === "oscillator" && ["crosses_above", "crosses_below"].includes(o.id) ? "  (0-100 level)" : ""}
            {indicatorType === "line" && ["greater_than", "less_than"].includes(o.id) ? "  (state-based)" : ""}
          </option>
        ))}
      </select>
      {indicatorType === "oscillator" && compat === "modified" ? (
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{CONDITION_ANNOTATION.oscillator}</span>
      ) : null}
      {conditionId === "price_inside_band" ? (
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>between upper and lower band</span>
      ) : null}
      {conditionId === "two_indicators_cross" ? (
        <>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>crosses</span>
          <select
            value={cond.secondIndicator || "SMA"}
            onChange={(e) => onChange("secondIndicator", e.target.value)}
            style={pillBase}
          >
            {INDICATOR_GROUPS[0].items.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 20,
              padding: "2px 8px",
              border: "1px solid #185FA5",
              color: "#0C447C",
              background: "#E6F1FB",
            }}
          >
            Line only
          </span>
        </>
      ) : null}
      {needsValue && selectedVariable ? (
        <button
          type="button"
          style={{ ...pillBase, borderRadius: 20, minHeight: 24, padding: "2px 10px" }}
          onClick={() => onChange("valSourceVar", "")}
          title="Using variable value; click to clear"
        >
          {selectedVariable.name}
        </button>
      ) : null}
      {needsValue && !selectedVariable ? (
        <input
          type={indicatorType === "oscillator" ? "range" : "number"}
          min={indicatorType === "oscillator" ? 0 : undefined}
          max={indicatorType === "oscillator" ? 100 : undefined}
          step={indicatorType === "oscillator" ? 1 : "any"}
          value={cond.val || (indicatorType === "oscillator" ? 50 : "")}
          onChange={(e) => onChange("val", e.target.value)}
          style={{ ...pillBase, width: indicatorType === "oscillator" ? 140 : 92, textAlign: "center" }}
          placeholder={indicatorType === "oscillator" ? undefined : "Price level"}
        />
      ) : null}
      {needsValue && indicatorType === "oscillator" ? (
        <>
          <span style={{ fontSize: 12, color: "#555" }}>{cond.val || "50"}</span>
          <button
            type="button"
            style={{ ...pillBase, minHeight: 24, borderRadius: 20, padding: "2px 9px", background: "#f1efe8", color: "#633806" }}
            onClick={() => onChange("val", "30")}
          >
            30 oversold
          </button>
          <button
            type="button"
            style={{ ...pillBase, minHeight: 24, borderRadius: 20, padding: "2px 9px", background: "#FAEEDA", color: "#854F0B" }}
            onClick={() => onChange("val", "70")}
          >
            70 overbought
          </button>
        </>
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
      {errorMessage ? (
        <div
          style={{
            width: "100%",
            marginTop: 4,
            fontSize: 11,
            borderRadius: 6,
            padding: "4px 6px",
            border: "1px solid #E24B4A",
            color: "#A32D2D",
            background: "#FCEBEB",
          }}
        >
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}

