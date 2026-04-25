import { makeCondition } from "../types/strategyRules";

function makeRule(type, conds, action, actionVal = "5") {
  return {
    id: crypto.randomUUID(),
    type,
    conds,
    action,
    actionVal: String(actionVal),
  };
}

export function templateTitle(key) {
  if (key === "ma") return "Moving Average Crossover";
  if (key === "rsi") return "RSI Overbought/Oversold";
  return "Buy and Hold";
}

export function makeTemplateSimpleRules(key) {
  if (key === "ma") {
    return [
      makeRule(
        "entry",
        [makeCondition({ ind: "SMA", op: "crosses above", indParams: { smaPeriod: "20" } })],
        "Buy — all cash"
      ),
      makeRule(
        "exit",
        [makeCondition({ ind: "SMA", op: "crosses below", indParams: { smaPeriod: "50" } })],
        "Sell — entire position"
      ),
    ];
  }
  if (key === "rsi") {
    return [
      makeRule(
        "entry",
        [makeCondition({ ind: "RSI", op: "is below", val: "30", indParams: { rsiPeriod: "14" } })],
        "Buy — all cash"
      ),
      makeRule(
        "exit",
        [makeCondition({ ind: "RSI", op: "is above", val: "70", indParams: { rsiPeriod: "14" } })],
        "Sell — entire position"
      ),
    ];
  }
  return [makeRule("entry", [makeCondition({ ind: "Price", op: "is above", val: "-1" })], "Buy — all cash")];
}
