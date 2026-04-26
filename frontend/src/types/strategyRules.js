import { randomId } from "../utils/randomId";

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

export const INDICATORS = ["SMA", "EMA", "MACD", "Volume", "RSI", "Stochastic", "Bollinger Bands", "Keltner Channel", "Price"];

export const OPERATORS = ["crosses above", "crosses below", "greater than", "less than", "two indicators cross", "price inside band"];

export const ENTRY_ACTIONS = ["Buy — all cash", "Buy — % portfolio", "Buy — fixed amount", "Hold — no trade"];
export const EXIT_ACTIONS = ["Sell — entire position", "Sell — % position", "Sell — fixed amount", "Hold — no trade"];
export const RISK_ACTIONS = ["Stop loss %", "Take profit %", "Max position %"];

export function defaultAction(type) {
  if (type === "entry") return ENTRY_ACTIONS[0];
  if (type === "exit") return EXIT_ACTIONS[0];
  return RISK_ACTIONS[0];
}

export function makeCondition(overrides = {}) {
  const ind = overrides.ind ?? INDICATORS[0];
  const indParams = {
    rsiPeriod: "14",
    smaPeriod: "20",
    emaPeriod: "12",
    macdFast: "12",
    macdSlow: "26",
    macdSignal: "9",
    bbPeriod: "20",
    bbStd: "2",
    kcPeriod: "20",
    kcMultiplier: "1.5",
    volumePeriod: "1",
    appliedTo: "Close",
    ...(overrides.indParams || {}),
  };
  return {
    id: randomId(),
    ind,
    op: OPERATORS[0],
    val: "",
    joiner: "AND",
    indParams,
    bandSelection: null,
    secondIndicator: "",
    ...overrides,
  };
}

export function makeStep(overrides = {}) {
  return { id: randomId(), conds: [makeCondition()], ...overrides };
}

export function makeSimpleRule(type) {
  return {
    id: randomId(),
    type,
    conds: [makeCondition()],
    action: defaultAction(type),
    actionVal: "5",
  };
}

export function makeAdvancedRule(type) {
  return {
    id: randomId(),
    type,
    steps: [makeStep()],
    action: defaultAction(type),
    actionVal: "5",
  };
}

