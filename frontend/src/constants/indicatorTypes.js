export const INDICATOR_TAXONOMY = {
  SMA: "line",
  EMA: "line",
  MACD: "line",
  Volume: "line",
  Price: "line",
  RSI: "oscillator",
  Stochastic: "oscillator",
  "Bollinger Bands": "band",
  "Keltner Channel": "band",
};

export const INDICATOR_GROUPS = [
  { label: "Line indicators", items: ["SMA", "EMA", "MACD", "Volume", "Price"] },
  { label: "Oscillators", items: ["RSI", "Stochastic"] },
  { label: "Band indicators", items: ["Bollinger Bands", "Keltner Channel"] },
];

export const TYPE_BADGE_TOKENS = {
  line: { bg: "#E6F1FB", text: "#0C447C", border: "#185FA5", label: "Line" },
  oscillator: { bg: "#FAEEDA", text: "#633806", border: "#854F0B", label: "Oscillator" },
  band: { bg: "#E1F5EE", text: "#085041", border: "#0F6E56", label: "Band" },
};

export const CONDITION_DEFS = [
  { id: "crosses_above", label: "Crosses above" },
  { id: "crosses_below", label: "Crosses below" },
  { id: "greater_than", label: "Greater than" },
  { id: "less_than", label: "Less than" },
  { id: "two_indicators_cross", label: "Two indicators cross" },
  { id: "price_inside_band", label: "Price inside band" },
];

export const CONDITION_COMPAT = {
  crosses_above: { line: "allowed", oscillator: "modified", band: "allowed" },
  crosses_below: { line: "allowed", oscillator: "modified", band: "allowed" },
  greater_than: { line: "modified", oscillator: "allowed", band: "modified" },
  less_than: { line: "modified", oscillator: "allowed", band: "modified" },
  two_indicators_cross: { line: "allowed", oscillator: "hidden", band: "hidden" },
  price_inside_band: { line: "hidden", oscillator: "hidden", band: "allowed" },
};

export const CONDITION_ANNOTATION = {
  oscillator: "compares to a level (0-100)",
};

export function normalizeIndicatorName(ind) {
  const raw = String(ind || "").trim();
  if (!raw) return "SMA";
  if (raw.startsWith("SMA")) return "SMA";
  if (raw.startsWith("EMA")) return "EMA";
  if (raw.startsWith("MACD")) return "MACD";
  if (raw.startsWith("Volume")) return "Volume";
  if (raw.startsWith("Price")) return "Price";
  if (raw.startsWith("RSI")) return "RSI";
  if (raw.startsWith("Stochastic")) return "Stochastic";
  if (raw.startsWith("Bollinger")) return "Bollinger Bands";
  if (raw.startsWith("Keltner")) return "Keltner Channel";
  return raw;
}

export function indicatorTypeFor(indicator) {
  const normalized = normalizeIndicatorName(indicator);
  return INDICATOR_TAXONOMY[normalized] || "line";
}

export function normalizeConditionId(op) {
  const raw = String(op || "").trim().toLowerCase();
  if (raw === "crosses above") return "crosses_above";
  if (raw === "crosses below") return "crosses_below";
  if (raw === "is above" || raw === "greater than") return "greater_than";
  if (raw === "is below" || raw === "less than") return "less_than";
  if (raw === "two indicators cross") return "two_indicators_cross";
  if (raw === "price inside band") return "price_inside_band";
  return "greater_than";
}

export function conditionLabelFromId(id) {
  const hit = CONDITION_DEFS.find((d) => d.id === id);
  return hit ? hit.label : "Greater than";
}

export function conditionIdFromLabel(label) {
  return normalizeConditionId(label);
}

export function compatibleConditions(indicatorType, bandSelection) {
  if (!indicatorType) return [];
  if (indicatorType === "band" && !bandSelection) {
    return CONDITION_DEFS.filter((d) => d.id === "price_inside_band");
  }
  return CONDITION_DEFS.filter((d) => CONDITION_COMPAT[d.id]?.[indicatorType] !== "hidden");
}
