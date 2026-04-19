// Rule shapes for Simple and Advanced modes
//
// Simple mode rule:
// { id, type: 'entry'|'exit'|'risk', conds: Condition[], action: string, actionVal: string }
//
// Advanced mode rule:
// { id, type, steps: Step[], action, actionVal }
// Step: { id, conds: Condition[] }
//
// Condition: { id, ind: string, op: string, val: string, joiner: 'AND'|'OR' }

export const INDICATORS = [
  "RSI(14)",
  "SMA(20)",
  "SMA(50)",
  "EMA(12)",
  "EMA(26)",
  "MACD",
  "Bollinger upper",
  "Bollinger lower",
  "Price",
  "Volume",
];

export const OPERATORS = ["crosses above", "crosses below", "is above", "is below"];

export const ENTRY_ACTIONS = ["Buy — all cash", "Buy — 50% portfolio", "Buy — fixed amount"];
export const EXIT_ACTIONS = ["Sell — entire position", "Sell — 50% position"];
export const RISK_ACTIONS = ["Stop loss %", "Take profit %", "Max position %"];

export function defaultAction(type) {
  if (type === "entry") return ENTRY_ACTIONS[0];
  if (type === "exit") return EXIT_ACTIONS[0];
  return RISK_ACTIONS[0];
}

export function makeCondition(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    ind: INDICATORS[0],
    op: OPERATORS[0],
    val: "",
    joiner: "AND",
    ...overrides,
  };
}

export function makeStep(overrides = {}) {
  return { id: crypto.randomUUID(), conds: [makeCondition()], ...overrides };
}

export function makeSimpleRule(type) {
  return {
    id: crypto.randomUUID(),
    type,
    conds: [makeCondition()],
    action: defaultAction(type),
    actionVal: "5",
  };
}

export function makeAdvancedRule(type) {
  return {
    id: crypto.randomUUID(),
    type,
    steps: [makeStep()],
    action: defaultAction(type),
    actionVal: "5",
  };
}

