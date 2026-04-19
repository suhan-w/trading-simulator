import { ENTRY_ACTIONS, EXIT_ACTIONS, RISK_ACTIONS } from "../types/strategyRules";

/**
 * Reads palette tile payload from StrategyBuilder drag (application/x-cowrie-block).
 * @param {DataTransfer} dataTransfer
 * @returns {string | null} block type, e.g. "sma", "buy"
 */
/** @param {DataTransfer | null | undefined} dt */
export function dataTransferHasCowriePalette(dt) {
  if (!dt?.types) return false;
  const types = dt.types;
  if (typeof types.includes === "function") return types.includes("application/x-cowrie-block");
  if (typeof types.contains === "function") return types.contains("application/x-cowrie-block");
  return Array.from(types).includes("application/x-cowrie-block");
}

export function parsePaletteDragType(dataTransfer) {
  try {
    const raw = dataTransfer.getData("application/x-cowrie-block");
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j?.source !== "palette" || typeof j?.type !== "string") return null;
    return j.type;
  } catch {
    return null;
  }
}

/** @returns {Partial<{ ind: string; op: string; val: string }> | null} */
export function conditionPatchFromPaletteBlock(blockType) {
  /** @type {Record<string, Partial<{ ind: string; op: string; val: string }>>} */
  const map = {
    sma: { ind: "SMA(20)" },
    ema: { ind: "EMA(12)" },
    rsi: { ind: "RSI(14)" },
    bollinger: { ind: "Bollinger upper" },
    macd: { ind: "MACD" },
    volume: { ind: "Volume" },
    if_gt: { op: "is above", val: "50" },
    if_lt: { op: "is below", val: "50" },
    if_cross_above: { op: "crosses above", val: "" },
    if_cross_below: { op: "crosses below", val: "" },
    if_two_indicators_cross: { op: "crosses above", val: "" },
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
    if (blockType === "hold") return ENTRY_ACTIONS[0];
    return null;
  }
  if (ruleType === "exit") {
    if (blockType === "sell") return EXIT_ACTIONS[0];
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
