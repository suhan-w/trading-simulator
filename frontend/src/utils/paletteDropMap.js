import { ENTRY_ACTIONS, EXIT_ACTIONS, RISK_ACTIONS } from "../types/strategyRules";

let lastPaletteDragType = null;

export function setLastPaletteDragType(type) {
  lastPaletteDragType = typeof type === "string" && type ? type : null;
}

export function clearLastPaletteDragType() {
  lastPaletteDragType = null;
}

/**
 * Reads palette tile payload from StrategyBuilder drag (application/x-cowrie-block).
 * @param {DataTransfer} dataTransfer
 * @returns {string | null} block type, e.g. "sma", "buy"
 */
/** @param {DataTransfer | null | undefined} dt */
export function dataTransferHasCowriePalette(dt) {
  if (!dt?.types) return Boolean(lastPaletteDragType);
  const types = dt.types;
  // Some browsers expose an empty type list during dragover.
  if (typeof types.length === "number" && types.length === 0) return true;
  const hasCustom =
    (typeof types.includes === "function" && types.includes("application/x-cowrie-block")) ||
    (typeof types.contains === "function" && types.contains("application/x-cowrie-block")) ||
    Array.from(types).includes("application/x-cowrie-block");
  if (hasCustom) return true;
  // Fallback for browsers that strip custom drag MIME types.
  return (
    (typeof types.includes === "function" && types.includes("text/plain")) ||
    (typeof types.contains === "function" && types.contains("text/plain")) ||
    Array.from(types).includes("text/plain")
  );
}

export function parsePaletteDragType(dataTransfer) {
  const tryParse = (raw) => {
    if (!raw) return null;
    try {
      const j = JSON.parse(raw);
      if (j?.source !== "palette" || typeof j?.type !== "string") return null;
      return j.type;
    } catch {
      return null;
    }
  };
  try {
    const primary = tryParse(dataTransfer.getData("application/x-cowrie-block"));
    if (primary) return primary;
    const plain = tryParse(dataTransfer.getData("text/plain"));
    if (plain) return plain;
    return lastPaletteDragType;
  } catch {
    return lastPaletteDragType;
  }
}

/** @returns {Partial<{ ind: string; op: string; val: string }> | null} */
export function conditionPatchFromPaletteBlock(blockType) {
  /** @type {Record<string, Partial<{ ind: string; op: string; val: string }>>} */
  const map = {
    sma: { ind: "SMA" },
    ema: { ind: "EMA" },
    rsi: { ind: "RSI" },
    bollinger: { ind: "Bollinger Bands" },
    macd: { ind: "MACD" },
    volume: { ind: "Volume" },
    if_gt: { op: "greater than", val: "50" },
    if_lt: { op: "less than", val: "50" },
    if_cross_above: { op: "crosses above", val: "" },
    if_cross_below: { op: "crosses below", val: "" },
    if_two_indicators_cross: { op: "two indicators cross", val: "" },
    price_inside_band: { op: "price inside band", val: "" },
  };
  const p = map[blockType];
  return p ? { ...p } : null;
}

const ACTION_BLOCK_TYPES = new Set(["buy", "sell", "hold", "stop_loss", "take_profit", "max_position"]);

export function isPaletteActionBlock(blockType) {
  return ACTION_BLOCK_TYPES.has(blockType);
}

/** @returns {string | null} action label to set on the rule */
export function actionFromPaletteBlock(blockType, ruleType) {
  if (ruleType === "entry") {
    if (blockType === "buy") return ENTRY_ACTIONS[0];
    if (blockType === "hold") return ENTRY_ACTIONS[3];
    return null;
  }
  if (ruleType === "exit") {
    if (blockType === "sell") return EXIT_ACTIONS[0];
    if (blockType === "hold") return EXIT_ACTIONS[3];
    return null;
  }
  if (ruleType === "risk") {
    if (blockType === "stop_loss") return RISK_ACTIONS[0];
    if (blockType === "take_profit") return RISK_ACTIONS[1];
    if (blockType === "max_position") return RISK_ACTIONS[2];
    return null;
  }
  return null;
}

export function shouldAppendConditionFromPalette(blockType) {
  if (!blockType || blockType === "select_data") return false;
  if (isPaletteActionBlock(blockType)) return false;
  return conditionPatchFromPaletteBlock(blockType) != null;
}
