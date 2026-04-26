import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { compileUnifiedRulesToRunPython } from "../utils/strategyRunCompiler";
import { parsePythonToStrategy } from "../utils/strategyParser";
import { randomId } from "../utils/randomId";

const TOKENS = {
  pageBg: "#f5f4f0",
  cardBg: "#ffffff",
  cardBorder: "0.5px solid #e4e2db",
  ghostBorder: "#d0cec8",
  summaryDark: "#1a1a1a",
};
const FIXED_SIM_ACCOUNT_SIZE = 100000;

const INDICATORS = [
  { kind: "SMA", type: "line", full: "Simple Moving Average", what: "Smooths price using a rolling average to reveal trend direction." },
  { kind: "EMA", type: "line", full: "Exponential Moving Average", what: "Weights recent prices more heavily to react faster than SMA." },
  { kind: "MACD", type: "line", full: "Moving Average Convergence Divergence", what: "Compares fast and slow EMA momentum to detect trend shifts." },
  { kind: "Volume", type: "line", full: "Volume", what: "Tracks participation behind price moves to confirm conviction." },
  { kind: "RSI", type: "oscillator", full: "Relative Strength Index", what: "Measures momentum on a 0-100 scale for overbought/oversold context." },
  { kind: "Stochastic", type: "oscillator", full: "Stochastic Oscillator", what: "Compares current close to recent range using a 0-100 oscillator." },
  { kind: "Bollinger Bands", type: "band", full: "Bollinger Bands", what: "Builds upper/lower volatility bands around a moving average." },
  { kind: "Keltner Channel", type: "band", full: "Keltner Channel", what: "Builds ATR-based channel envelopes around an EMA trend line." },
];
const LINE_INDICATORS = INDICATORS.filter((i) => i.type === "line");
const BAND_INDICATORS = INDICATORS.filter((i) => i.type === "band");
const CONDITIONS = [
  { id: "crosses_above", label: "Crosses above" },
  { id: "crosses_below", label: "Crosses below" },
  { id: "greater_than", label: "Greater than" },
  { id: "less_than", label: "Less than" },
  { id: "two_indicators_cross", label: "Two indicators cross" },
  { id: "inside_band", label: "Inside band" },
];
const ACTIONS = [
  { kind: "buy_all_cash", label: "Buy — all cash", side: "buy" },
  { kind: "buy_percent_portfolio", label: "Buy — % portfolio", side: "buy" },
  { kind: "sell_entire_position", label: "Sell — entire position", side: "sell" },
  { kind: "sell_percent_position", label: "Sell — % position", side: "sell" },
];
const RISKS = [
  { kind: "stop_loss", label: "Stop loss %", pct: 2 },
  { kind: "take_profit", label: "Take profit %", pct: 5 },
];

const GLOSSARY = {
  SMA: {
    what: "Simple Moving Average tracks the average close over a fixed period and smooths noise.",
    does: "Creates a slower, stable trend reference line that helps confirm direction.",
    use: "Use when you want fewer false signals and stronger trend confirmation.",
    examples: ["Buy when price crosses above SMA (20), then buy all cash.", "Sell when price crosses below SMA (20), then sell entire position."],
  },
  EMA: {
    what: "Exponential Moving Average is a weighted moving average that reacts faster to recent price.",
    does: "Detects trend changes earlier than SMA while still smoothing raw price.",
    use: "Use in faster markets where you want earlier entries and exits.",
    examples: ["Buy when EMA (20) crosses above SMA (50), then buy % portfolio.", "Sell when price crosses below EMA (20), then sell % position."],
  },
  MACD: {
    what: "MACD compares fast and slow EMA momentum to show trend acceleration and deceleration.",
    does: "Helps detect momentum turns and trend confirmation.",
    use: "Use to filter entries so trades follow strengthening momentum.",
    examples: ["Buy when MACD crosses above 0, then buy all cash.", "Sell when MACD crosses below 0, then sell entire position."],
  },
  Volume: {
    what: "Volume measures participation behind a move.",
    does: "Shows whether breakouts and trends are supported by strong activity.",
    use: "Use as a confirmation layer before taking entries.",
    examples: ["Buy when Volume is greater than 1000000 and price crosses above SMA (20).", "Sell when Volume is less than 300000 during weakness."],
  },
  RSI: {
    what: "RSI is a 0-100 oscillator that measures recent momentum strength.",
    does: "Highlights overbought and oversold regions and momentum shifts.",
    use: "Use for mean-reversion and momentum confirmation, especially with 30/70 levels.",
    examples: ["Buy when RSI (14) crosses above 30, then buy all cash.", "Sell when RSI (14) is greater than 70, then sell entire position."],
  },
  Stochastic: {
    what: "Stochastic compares current close to recent high-low range on a 0-100 scale.",
    does: "Shows where price sits in its recent range and possible turning points.",
    use: "Use when you want quicker oscillator signals in ranging markets.",
    examples: ["Buy when Stochastic crosses above 20, then buy % portfolio.", "Sell when Stochastic crosses below 80, then sell % position."],
  },
  "Bollinger Bands": {
    what: "Bollinger Bands wrap price with a moving average plus volatility envelopes.",
    does: "Shows expansion/contraction and potential mean-reversion zones.",
    use: "Use for volatility-aware entries, especially with band touch and re-entry setups.",
    examples: ["Buy when price is inside Bollinger Bands after a lower-band break.", "Sell when price crosses below Bollinger Bands middle band."],
  },
  "Keltner Channel": {
    what: "Keltner Channel uses EMA and ATR to form smoother volatility channels.",
    does: "Tracks trend context with less noise than Bollinger in some regimes.",
    use: "Use for trend pullback entries and channel breakout confirmation.",
    examples: ["Buy when price crosses above Keltner upper band, then buy all cash.", "Sell when price crosses below Keltner middle band, then sell entire position."],
  },
  crosses_above: {
    what: "Crosses above triggers only on the bar where one value moves from below to above another.",
    does: "Captures fresh upward momentum shifts.",
    use: "Use for first-signal entries instead of persistent state checks.",
    examples: ["Buy when RSI (14) crosses above 30.", "Buy when price crosses above SMA (20)."],
  },
  crosses_below: {
    what: "Crosses below triggers only when one value moves from above to below another.",
    does: "Captures fresh downward momentum shifts.",
    use: "Use for timely exits or bearish confirmations.",
    examples: ["Sell when RSI (14) crosses below 70.", "Sell when price crosses below EMA (20)."],
  },
  greater_than: {
    what: "Greater than is a state condition that stays true while value remains above a level.",
    does: "Represents sustained strength, not a one-time crossing event.",
    use: "Use when you need persistence, like trend filters.",
    examples: ["Buy when RSI (14) is greater than 55.", "Buy when Volume is greater than 1,000,000."],
  },
  less_than: {
    what: "Less than is a state condition that stays true while value remains below a level.",
    does: "Represents sustained weakness or discounted regions.",
    use: "Use for pullback entries or weak-momentum exits.",
    examples: ["Buy when RSI (14) is less than 30.", "Sell when MACD is less than 0."],
  },
  two_indicators_cross: {
    what: "Two indicators cross compares one line indicator against another line indicator.",
    does: "Captures relative trend shifts between fast and slow signals.",
    use: "Use for classic crossover systems like EMA vs SMA.",
    examples: ["Buy when EMA (20) crosses above SMA (50).", "Sell when EMA (20) crosses below SMA (50)."],
  },
  inside_band: {
    what: "Inside band checks whether price has returned between upper and lower envelopes.",
    does: "Signals normalization after a volatility expansion.",
    use: "Use for re-entry logic after band breakouts.",
    examples: ["Buy when price is inside Bollinger Bands.", "Sell when price moves back inside Keltner Channel after upper extension."],
  },
  buy_all_cash: {
    what: "Buy all cash allocates all available cash to the position.",
    does: "Maximizes exposure for the next entry signal.",
    use: "Use in simple single-asset strategies where you want full conviction entries.",
    examples: ["Entry rule complete -> Buy all cash.", "Momentum confirmation -> Buy all cash."],
  },
  buy_percent_portfolio: {
    what: "Buy % portfolio opens a position using a chosen percentage of account value.",
    does: "Controls exposure size at entry.",
    use: "Use for scaling or risk-controlled entries.",
    examples: ["Buy when RSI crosses above 30, then buy 25% portfolio.", "Buy trend breakout, then buy 40% portfolio."],
  },
  sell_entire_position: {
    what: "Sell entire position closes the full open position.",
    does: "Fully exits risk on the signal bar.",
    use: "Use when your exit condition invalidates the trade thesis.",
    examples: ["Sell when RSI crosses above 70, then sell entire position.", "Sell when price crosses below SMA (20)."],
  },
  sell_percent_position: {
    what: "Sell % position closes part of the open position.",
    does: "Realizes partial profit while keeping some exposure.",
    use: "Use for staged exits and profit-taking ladders.",
    examples: ["Sell 50% when first target is reached.", "Sell 25% on early weakness, keep remainder for trend."],
  },
  stop_loss: {
    what: "Stop loss defines a maximum downside percentage from entry.",
    does: "Automatically limits losses when price moves against the trade.",
    use: "Use on nearly every strategy to control tail risk.",
    examples: ["Set stop loss to 2% for tight risk.", "Set stop loss to 5% for wider swings."],
  },
  take_profit: {
    what: "Take profit defines a target gain percentage for exiting.",
    does: "Locks in gains when price reaches the objective.",
    use: "Use when strategy favors predefined reward capture.",
    examples: ["Set take profit to 8% for swing trades.", "Set take profit to 3% for short horizon setups."],
  },
};

const BADGE = {
  line: { bg: "#E6F1FB", text: "#0C447C", border: "#185FA5", label: "Line" },
  oscillator: { bg: "#FAEEDA", text: "#633806", border: "#854F0B", label: "Osc" },
  band: { bg: "#E1F5EE", text: "#085041", border: "#0F6E56", label: "Band" },
  buy: { bg: "#eaf3de", text: "#27500a", border: "#639922", label: "Buy" },
  sell: { bg: "#FCEBEB", text: "#791F1F", border: "#E24B4A", label: "Sell" },
  risk: { bg: "#FFF3CD", text: "#7a5800", border: "#EF9F27", label: "Risk" },
  condition: { bg: "#EEEDFE", text: "#3C3489", border: "#AFA9EC", label: "Cond" },
};

const PARAM_UNIT = {
  period: "bars",
  fast: "bars",
  slow: "bars",
  signal: "bars",
  overbought: "0-100",
  oversold: "0-100",
  stddev: "σ",
  atrMultiplier: "x",
};

const DROP_MSG_LINE_CROSS = "Only Line indicators work here";
const DROP_MSG_BAND_INSIDE = "Inside band only works with band indicators (Bollinger Bands, Keltner Channel)";

const BAND_ZONE_LABEL = {
  full: "between upper and lower",
  upper_half: "between middle and upper",
  lower_half: "between lower and middle",
};

function formatIndicatorShort(ind) {
  if (!ind) return "…";
  const p = ind.params || {};
  if (ind.kind === "SMA" || ind.kind === "EMA") return `${ind.kind} (${p.period ?? 20})`;
  if (ind.kind === "MACD") return `${ind.kind} (${p.fast ?? 12}/${p.slow ?? 26})`;
  if (ind.kind === "RSI" || ind.kind === "Stochastic") return `${ind.kind} (${p.period ?? 14})`;
  if (ind.kind === "Bollinger Bands") return `${ind.kind} (${p.period ?? 20})`;
  if (ind.kind === "Keltner Channel") return `${ind.kind} (${p.period ?? 20})`;
  if (ind.kind === "Volume") return ind.kind;
  return ind.kind;
}

/** Plain-English narrative under “Code”; glosses jargon on first mention only (option 8). */
function indicatorWithGloss(ind, seenKinds) {
  if (!ind) return "…";
  const short = formatIndicatorShort(ind);
  const full = INDICATORS.find((x) => x.kind === ind.kind)?.full;
  if (full && !seenKinds.has(ind.kind)) {
    seenKinds.add(ind.kind);
    return `${short} (${full})`;
  }
  return short;
}

function friendlyBandZoneSentence(z) {
  if (z === "upper_half") return "in the upper half of the channel (between the middle and upper lines)";
  if (z === "lower_half") return "in the lower half (between the middle and lower lines)";
  return "between the upper and lower lines of the band";
}

function conditionVerbGloss(condId, seenVerbs) {
  const labels = {
    crosses_above: ["crosses above", " — i.e. moves up through that level on this bar"],
    crosses_below: ["crosses below", " — i.e. moves down through that level on this bar"],
    greater_than: ["is above", " — stays higher than that level"],
    less_than: ["is below", " — stays lower than that level"],
  };
  const pair = labels[condId];
  if (!pair) return CONDITIONS.find((c) => c.id === condId)?.label?.toLowerCase() || condId;
  const [short, gloss] = pair;
  if (!seenVerbs.has(condId)) {
    seenVerbs.add(condId);
    return `${short}${gloss}`;
  }
  return short;
}

function describeActionFriendly(action, seenActions) {
  if (!action?.kind) return "choose an action";
  const pct = Number(action.params?.value ?? 50);
  switch (action.kind) {
    case "buy_all_cash": {
      if (!seenActions.has("buy_all_cash")) {
        seenActions.add("buy_all_cash");
        return "buy using all available cash (full size)";
      }
      return "buy using all available cash";
    }
    case "buy_percent_portfolio": {
      if (!seenActions.has("buy_pct")) {
        seenActions.add("buy_pct");
        return `buy ${pct}% of the portfolio (part of account value)`;
      }
      return `buy ${pct}% of the portfolio`;
    }
    case "sell_entire_position": {
      if (!seenActions.has("sell_all")) {
        seenActions.add("sell_all");
        return "sell the entire open position";
      }
      return "sell the entire position";
    }
    case "sell_percent_position": {
      if (!seenActions.has("sell_pct")) {
        seenActions.add("sell_pct");
        return `sell ${pct}% of the open position (partial exit)`;
      }
      return `sell ${pct}% of the position`;
    }
    default:
      return ACTIONS.find((a) => a.kind === action.kind)?.label || action.kind;
  }
}

function describeConditionRowPlain(row, ctx) {
  const { seenKinds, seenVerbs } = ctx;
  if (!row.condition) return null;

  if (row.condition === "two_indicators_cross") {
    const a = row.indicator ? indicatorWithGloss(row.indicator, seenKinds) : "(first trend line)";
    const b = row.secondIndicator ? indicatorWithGloss(row.secondIndicator, seenKinds) : "(second trend line)";
    let tail = "";
    if (!ctx.twoCrossGlossUsed) {
      ctx.twoCrossGlossUsed = true;
      tail = " — whenever those two lines cross (either direction)";
    }
    return `${a} and ${b}${tail}`;
  }

  if (row.condition === "inside_band") {
    const band = row.indicator ? indicatorWithGloss(row.indicator, seenKinds) : "the volatility band";
    const zone = row.bandZone || "full";
    let zoneBit = friendlyBandZoneSentence(zone);
    if (!ctx.seenInsideZones.has(zone)) {
      ctx.seenInsideZones.add(zone);
      zoneBit += zone === "full"
        ? " (typical “price came back inside the envelope” setup)"
        : " (narrower slice of the channel)";
    }
    return `price is ${zoneBit} for ${band}`;
  }

  if (!row.indicator) return null;
  const ind = indicatorWithGloss(row.indicator, seenKinds);
  const verb = conditionVerbGloss(row.condition, seenVerbs);
  const v = row.value;
  const osc = row.indicator.type === "oscillator";
  const target = osc ? `the ${v} level on that gauge` : `the ${v} threshold`;
  if (row.condition === "crosses_above" || row.condition === "crosses_below") {
    return `${ind} ${verb} ${target}`;
  }
  return `${ind} ${verb} ${target}`;
}

function describeRiskPlain(rule, ctx) {
  const parts = [];
  if (Number(rule.stopLoss || 0) > 0) {
    if (!ctx.riskSlGlossed) {
      ctx.riskSlGlossed = true;
      parts.push(`exit if price falls ${rule.stopLoss}% against you (stop loss — caps downside)`);
    } else {
      parts.push(`stop loss ${rule.stopLoss}%`);
    }
  }
  if (Number(rule.takeProfit || 0) > 0) {
    if (!ctx.riskTpGlossed) {
      ctx.riskTpGlossed = true;
      parts.push(`take profit at ${rule.takeProfit}% gain (lock in profit)`);
    } else {
      parts.push(`take profit ${rule.takeProfit}%`);
    }
  }
  if (!parts.length) return null;
  return `Risk: ${parts.join("; ")}.`;
}

function plainEnglishFromUnifiedRules(rules) {
  const entry = rules.find((r) => r.kind === "entry");
  const exitRule = rules.find((r) => r.kind === "exit");
  const risk = rules.find((r) => r.kind === "risk");
  const ctx = {
    seenKinds: new Set(),
    seenVerbs: new Set(),
    twoCrossGlossUsed: false,
    seenInsideZones: new Set(),
    seenActions: new Set(),
    riskSlGlossed: false,
    riskTpGlossed: false,
  };
  const lines = [];

  const buildRuleSentence = (rule, title) => {
    const rows = rule.conditions || [];
    const chunks = [];
    for (let i = 0; i < rows.length; i++) {
      const piece = describeConditionRowPlain(rows[i], ctx);
      if (piece) {
        if (chunks.length) {
          const join = rule.combinators?.[i - 1] === "OR" ? "or" : "and";
          chunks.push(join);
        }
        chunks.push(piece);
      }
    }
    const when = chunks.length ? chunks.join(" ") : "your entry/exit conditions aren’t complete yet";
    const action = describeActionFriendly(rule.action, ctx.seenActions);
    return `${title}: When ${when}, then ${action}.`;
  };

  if (entry) lines.push(buildRuleSentence(entry, "Entry"));
  if (exitRule) lines.push(buildRuleSentence(exitRule, "Exit"));
  const riskLine = risk ? describeRiskPlain(risk, ctx) : null;
  if (riskLine) lines.push(riskLine);

  return lines.filter(Boolean);
}

function iconButton(label, onClick) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{ width: 22, height: 22, borderRadius: 6, border: 0, background: "transparent", color: "#666", cursor: "pointer" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#f0ede8"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {label}
    </button>
  );
}

const compat = (type, condId) => {
  if (!type || !condId) return true;
  if (condId === "two_indicators_cross") return type === "line";
  if (condId === "inside_band") return type === "band";
  return true;
};

const mkIndicator = (kind) => {
  const m = INDICATORS.find((x) => x.kind === kind);
  const params =
    kind === "SMA" || kind === "EMA" ? { period: 20, appliedTo: "Close" } :
    kind === "MACD" ? { fast: 12, slow: 26, signal: 9 } :
    kind === "RSI" ? { period: 14, overbought: 70, oversold: 30 } :
    kind === "Stochastic" ? { period: 14 } :
    kind === "Bollinger Bands" ? { period: 20, stddev: 2 } :
    kind === "Keltner Channel" ? { period: 20, atrMultiplier: 2 } :
    kind === "Volume" ? { period: 20 } : {};
  return { id: randomId(), kind, type: m?.type || "line", params, band: null };
};
const mkRow = () => ({ id: randomId(), indicator: null, condition: null, value: null, secondIndicator: null, bandZone: "full" });
const mkRule = (kind) => kind === "risk"
  ? { id: randomId(), kind, title: "Risk rule", stopLoss: 2, takeProfit: null }
  : { id: randomId(), kind, title: `${kind === "entry" ? "Entry" : "Exit"} rule`, conditions: [mkRow()], combinators: [], action: null };

/** Survives dragend vs drop ordering bugs; cleared after applyDrop reads it */
const SIDEBAR_DRAG_STORAGE_KEY = "cowrie-strategy-builder-drag-payload-v1";

function StrategyBuilder({ code, setCode, autoSyncCodeFromVisual = false, onSaveStrategy, onOpenBacktesting, onRunAvailabilityChange, onExpandEditor, renderLayout }, ref) {
  const [rules, setRules] = useState([mkRule("entry"), mkRule("exit")]);
  const [detailKey, setDetailKey] = useState(null);
  const [tooltip, setTooltip] = useState({ key: null, text: "" });
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [closingGlossary, setClosingGlossary] = useState(false);
  const hoverTimer = useRef(null);
  const dragPayloadRef = useRef(null);
  const isDraggingRef = useRef(false);
  const actionKinds = useMemo(() => new Set(ACTIONS.map((a) => a.kind)), []);
  const [codeText, setCodeText] = useState(code || "");
  const [customCode, setCustomCode] = useState(false);
  const [visualLocked, setVisualLocked] = useState(false);
  const [codeUtilityTab, setCodeUtilityTab] = useState("checklist");
  const plannerCapital = FIXED_SIM_ACCOUNT_SIZE;
  const [plannerRiskPct, setPlannerRiskPct] = useState(1);
  const [plannerStopPct, setPlannerStopPct] = useState(2);
  const [plannerTakeProfitPct, setPlannerTakeProfitPct] = useState(4);
  const [saveFeedback, setSaveFeedback] = useState("");
  /** Palette presets for composite condition tiles (sidebar) */
  const [paletteTwoCross, setPaletteTwoCross] = useState({ first: "EMA", second: "SMA" });
  const [paletteInsideBand, setPaletteInsideBand] = useState({ kind: "Bollinger Bands", period: 20 });
  const [dropTip, setDropTip] = useState(null);
  const [shakeRowId, setShakeRowId] = useState(null);
  const [insideBandPopoverRowId, setInsideBandPopoverRowId] = useState(null);
  const [secondIndicatorDropHotRowId, setSecondIndicatorDropHotRowId] = useState(null);
  const [hoveredSidebarKey, setHoveredSidebarKey] = useState(null);
  const [draggingSidebarKey, setDraggingSidebarKey] = useState(null);
  const editorRef = useRef(null);

  const hasEntry = rules.some((r) => r.kind === "entry");
  const hasExitOrRisk = rules.some((r) => r.kind === "exit" || r.kind === "risk");
  const rowDone = (r) => {
    if (!r.indicator || !r.condition) return false;
    if (r.condition === "inside_band") return r.indicator.type === "band";
    if (r.condition === "two_indicators_cross") return r.indicator.type === "line" && !!r.secondIndicator;
    return r.value != null;
  };
  const ruleDone = (rule) => rule.kind === "risk"
    ? Number(rule.stopLoss || 0) > 0 || Number(rule.takeProfit || 0) > 0
    : !!rule.action && rule.conditions.length > 0 && rule.conditions.every(rowDone);
  const allComplete = rules.length > 0 && rules.every(ruleDone);
  const canTest = hasEntry && hasExitOrRisk && allComplete;
  useEffect(() => onRunAvailabilityChange?.({ disabled: !canTest }), [canTest, onRunAvailabilityChange]);

  const pythonFromVisual = useMemo(
    () =>
      compileUnifiedRulesToRunPython(
        structuredClone(rules.map((r) => (r.kind !== "risk" ? { ...r, action: r.action || { kind: "buy_all_cash", params: {} } } : r)))
      ),
    [rules]
  );
  useEffect(() => {
    if (autoSyncCodeFromVisual && !customCode) {
      setCodeText(pythonFromVisual);
      setCode(pythonFromVisual);
    }
  }, [autoSyncCodeFromVisual, customCode, pythonFromVisual, setCode]);

  const parseState = useMemo(() => {
    if (!codeText.trim()) return { parseable: false, reason: "Code is empty." };
    if (!customCode && codeText.includes("cowrie-backtest-strategy")) {
      return { parseable: true, reason: "Synced from visual rules — executable for backtesting." };
    }
    const parsed = parsePythonToStrategy(codeText);
    if (parsed) return { parseable: true, reason: "Code can be round-tripped into visual rules." };
    return { parseable: false, reason: "Custom logic cannot be represented by visual DSL." };
  }, [codeText, customCode]);
  const entryRule = useMemo(() => rules.find((r) => r.kind === "entry"), [rules]);
  const exitRule = useMemo(() => rules.find((r) => r.kind === "exit"), [rules]);
  const riskRule = useMemo(() => rules.find((r) => r.kind === "risk"), [rules]);
  const checklistItems = useMemo(() => {
    const entryReady = !!entryRule && ruleDone(entryRule);
    const exitReady = !!exitRule && ruleDone(exitRule);
    const hasRisk = !!riskRule;
    const hasSizingAction = rules.some((r) => r.kind !== "risk" && r.action?.kind?.includes("percent"));
    return [
      { label: "Entry rule is complete (when + then)", done: entryReady },
      { label: "Exit rule is complete (when + then)", done: exitReady },
      { label: "Risk rule exists (recommended)", done: hasRisk },
      { label: "At least one position sizing action uses %", done: hasSizingAction },
      { label: "Strategy can be tested now", done: canTest && (!customCode || parseState.parseable) },
    ];
  }, [entryRule, exitRule, riskRule, rules, canTest, parseState.parseable]);
  const plainEnglishLines = useMemo(() => plainEnglishFromUnifiedRules(rules), [rules]);
  const plannerRiskAmount = useMemo(() => Math.max(0, Number(plannerCapital) || 0) * ((Number(plannerRiskPct) || 0) / 100), [plannerCapital, plannerRiskPct]);
  const plannerPositionSize = useMemo(() => {
    const stop = Number(plannerStopPct) || 0;
    if (stop <= 0) return 0;
    return plannerRiskAmount / (stop / 100);
  }, [plannerRiskAmount, plannerStopPct]);
  const plannerRr = useMemo(() => {
    const stop = Number(plannerStopPct) || 0;
    const take = Number(plannerTakeProfitPct) || 0;
    if (stop <= 0) return 0;
    return take / stop;
  }, [plannerStopPct, plannerTakeProfitPct]);
  useEffect(() => {
    if (!saveFeedback) return undefined;
    const t = setTimeout(() => setSaveFeedback(""), 1800);
    return () => clearTimeout(t);
  }, [saveFeedback]);
  useEffect(() => {
    if (!dropTip) return undefined;
    const t = setTimeout(() => setDropTip(null), 4500);
    return () => clearTimeout(t);
  }, [dropTip]);
  useEffect(() => {
    if (insideBandPopoverRowId == null) return undefined;
    const onDown = (e) => {
      const el = e.target;
      if (el.closest?.("[data-sb-inside-band-popover]") || el.closest?.("[data-sb-inside-band-anchor]")) return;
      setInsideBandPopoverRowId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [insideBandPopoverRowId]);

  const summary = (rule) => {
    if (rule.kind === "risk") {
      const parts = [];
      if (Number(rule.stopLoss || 0) > 0) parts.push(`Stop loss ${rule.stopLoss}%`);
      if (Number(rule.takeProfit || 0) > 0) parts.push(`Take profit ${rule.takeProfit}%`);
      return parts.length ? parts.join(" · ") : "Risk not set";
    }
    const row = rule.conditions[0];
    if (!row?.indicator || !row?.condition || !rule.action) return "Incomplete";
    const pctVal = Number(rule.action.params?.value ?? 50);
    let actionReadable = ACTIONS.find((x) => x.kind === rule.action.kind)?.label || rule.action.kind;
    if (rule.action.kind === "buy_percent_portfolio") actionReadable = `Buy ${pctVal}% portfolio`;
    else if (rule.action.kind === "sell_percent_position") actionReadable = `Sell ${pctVal}% position`;
    const sideVerb = rule.kind === "entry" ? "Buy" : "Sell";
    if (row.condition === "two_indicators_cross") {
      const i1 = formatIndicatorShort(row.indicator);
      const i2 = formatIndicatorShort(row.secondIndicator);
      return `${sideVerb} when ${i1} crosses ${i2} → ${actionReadable}`;
    }
    if (row.condition === "inside_band") {
      const z = row.bandZone || "full";
      const zoneBit = z === "full" ? "(between upper and lower)" : z === "upper_half" ? "(between middle and upper)" : "(between lower and middle)";
      return `${sideVerb} when price is inside ${row.indicator.kind} ${zoneBit} → ${actionReadable}`;
    }
    const c = CONDITIONS.find((x) => x.id === row.condition)?.label || row.condition;
    return `${row.indicator.kind} ${c} ${row.value ?? ""} → ${actionReadable}`;
  };
  const applyPlaybook = (kind) => {
    const entry = mkRule("entry");
    const exit = mkRule("exit");
    let risk = null;
    if (kind === "trend") {
      entry.conditions = [{ ...mkRow(), indicator: mkIndicator("EMA"), condition: "crosses_above", value: 20, secondIndicator: null }];
      entry.action = { kind: "buy_percent_portfolio", params: { value: 40 } };
      exit.conditions = [{ ...mkRow(), indicator: mkIndicator("EMA"), condition: "crosses_below", value: 20, secondIndicator: null }];
      exit.action = { kind: "sell_entire_position", params: {} };
      risk = { id: randomId(), kind: "risk", title: "Risk rule", stopLoss: 3, takeProfit: null };
    } else if (kind === "mean") {
      entry.conditions = [{ ...mkRow(), indicator: mkIndicator("RSI"), condition: "crosses_above", value: 30, secondIndicator: null }];
      entry.action = { kind: "buy_percent_portfolio", params: { value: 30 } };
      exit.conditions = [{ ...mkRow(), indicator: mkIndicator("RSI"), condition: "greater_than", value: 70, secondIndicator: null }];
      exit.action = { kind: "sell_percent_position", params: { value: 50 } };
      risk = { id: randomId(), kind: "risk", title: "Risk rule", stopLoss: null, takeProfit: 6 };
    } else {
      entry.conditions = [{ ...mkRow(), indicator: mkIndicator("Bollinger Bands"), condition: "crosses_above", value: 0, secondIndicator: null }];
      entry.action = { kind: "buy_all_cash", params: {} };
      exit.conditions = [{ ...mkRow(), indicator: mkIndicator("Bollinger Bands"), condition: "inside_band", value: null, secondIndicator: null }];
      exit.action = { kind: "sell_entire_position", params: {} };
      risk = { id: randomId(), kind: "risk", title: "Risk rule", stopLoss: 4, takeProfit: null };
    }
    setRules([entry, exit, risk]);
    setCodeUtilityTab("checklist");
    setCustomCode(false);
    setVisualLocked(false);
  };

  const openGlossary = (key) => {
    if (glossaryOpen && detailKey === key) {
      setClosingGlossary(true);
      setTimeout(() => { setGlossaryOpen(false); setClosingGlossary(false); setDetailKey(null); }, 150);
      return;
    }
    setDetailKey(key);
    setGlossaryOpen(true);
    setClosingGlossary(false);
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && glossaryOpen) {
        setClosingGlossary(true);
        setTimeout(() => { setGlossaryOpen(false); setClosingGlossary(false); setDetailKey(null); }, 150);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [glossaryOpen]);

  const onSidebarHover = (key, text) => {
    setHoveredSidebarKey(key);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setTooltip({ key, text: text.split(".")[0] }), 500);
  };
  const clearSidebarHover = () => {
    setHoveredSidebarKey(null);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setTooltip({ key: null, text: "" });
  };

  const beginSidebarDrag = (e, payload) => {
    isDraggingRef.current = true;
    dragPayloadRef.current = payload;
    const serialized = JSON.stringify(payload);
    try {
      sessionStorage.setItem(SIDEBAR_DRAG_STORAGE_KEY, serialized);
    } catch {
      /* ignore */
    }
    e.dataTransfer.setData("application/json", serialized);
    e.dataTransfer.setData("text/plain", serialized);
    e.dataTransfer.setData("text/x-action-kind", typeof payload.value === "string" ? payload.value : "");
    e.dataTransfer.effectAllowed = "copy";
  };

  const endSidebarDrag = () => {
    setTimeout(() => {
      dragPayloadRef.current = null;
      isDraggingRef.current = false;
      try {
        sessionStorage.removeItem(SIDEBAR_DRAG_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }, 200);
  };

  const applyDrop = (e, ruleId, rowId, zone) => {
    e.preventDefault();
    if (visualLocked) return;
    const dt = e.dataTransfer ?? e.nativeEvent?.dataTransfer;
    const refFallback = dragPayloadRef.current;
    let payload = null;
    try {
      const rawStr = `${dt?.getData("application/json") || dt?.getData("text/plain") || ""}`.trim();
      payload = rawStr ? JSON.parse(rawStr) : refFallback;
    } catch {
      payload = refFallback;
    }
    if (!payload && typeof sessionStorage !== "undefined") {
      try {
        const s = sessionStorage.getItem(SIDEBAR_DRAG_STORAGE_KEY);
        if (s) payload = JSON.parse(s);
      } catch {
        /* ignore */
      }
    }
    if (!payload) return;
    if (typeof payload === "string" && actionKinds.has(payload)) {
      payload = { kind: "action", value: payload };
    } else if (!payload.kind && typeof payload.value === "string" && actionKinds.has(payload.value)) {
      payload = { kind: "action", value: payload.value };
    } else if (!payload.kind && typeof payload.action === "string" && actionKinds.has(payload.action)) {
      payload = { kind: "action", value: payload.action };
    }
    try {
      sessionStorage.removeItem(SIDEBAR_DRAG_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const dropOutcome = { tip: null, shakeRowId: null };
    setRules((prev) => prev.map((rule) => {
      if (rule.id !== ruleId) return rule;
      if (rule.kind === "risk" && zone === "risk-type") {
        if (payload.kind === "risk") {
          return payload.value === "stop_loss"
            ? { ...rule, stopLoss: Number(rule.stopLoss || 2) || 2 }
            : { ...rule, takeProfit: Number(rule.takeProfit || 5) || 5 };
        }
        return rule;
      }
      if (zone === "action") {
        if (payload.kind !== "action") return rule;
        return { ...rule, action: { kind: payload.value, params: payload.value.includes("percent") ? { value: 50 } : {} } };
      }
      if (zone === "new-row") {
        let row = mkRow();
        if (payload.kind === "indicator") row.indicator = mkIndicator(payload.value);
        if (payload.kind === "condition") {
          row.condition = payload.value;
          if (payload.value === "two_indicators_cross" || payload.value === "inside_band") row.value = null;
          if (payload.value === "two_indicators_cross" && payload.presetFirstKind && payload.presetSecondKind) {
            row.indicator = mkIndicator(payload.presetFirstKind);
            row.secondIndicator = mkIndicator(payload.presetSecondKind);
          }
          if (payload.value === "inside_band" && payload.presetBandKind) {
            let ind = mkIndicator(payload.presetBandKind);
            if (payload.presetParams && typeof payload.presetParams === "object") {
              ind = { ...ind, params: { ...ind.params, ...payload.presetParams } };
            }
            row.indicator = ind;
            row.secondIndicator = null;
          }
        }
        return { ...rule, conditions: [...rule.conditions, row], combinators: [...rule.combinators, "AND"] };
      }
      if (zone === "second-indicator") {
        const conditions = rule.conditions.map((row) => {
          if (row.id !== rowId) return row;
          if (payload.kind !== "indicator") return row;
          const ind = mkIndicator(payload.value);
          if (row.condition !== "two_indicators_cross") return row;
          if (ind.type !== "line") {
            dropOutcome.tip = DROP_MSG_LINE_CROSS;
            dropOutcome.shakeRowId = rowId;
            return row;
          }
          return { ...row, secondIndicator: ind };
        });
        return { ...rule, conditions };
      }
      const conditions = rule.conditions.map((row) => {
        if (row.id !== rowId) return row;
        if (payload.kind === "indicator") {
          const ind = mkIndicator(payload.value);
          if (row.condition === "two_indicators_cross") {
            if (ind.type !== "line") {
              dropOutcome.tip = DROP_MSG_LINE_CROSS;
              dropOutcome.shakeRowId = rowId;
              return row;
            }
            if (!row.indicator) {
              return { ...row, indicator: ind, secondIndicator: row.secondIndicator ?? null };
            }
            return { ...row, secondIndicator: ind };
          }
          if (row.condition === "inside_band") {
            if (ind.type !== "band") {
              dropOutcome.tip = DROP_MSG_BAND_INSIDE;
              dropOutcome.shakeRowId = rowId;
              return row;
            }
            return { ...row, indicator: ind, secondIndicator: null, bandZone: row.bandZone || "full" };
          }
          return { ...row, indicator: ind, secondIndicator: null, condition: row.condition && compat(ind.type, row.condition) ? row.condition : null };
        }
        if (payload.kind === "condition") {
          if (payload.value === "inside_band" && row.indicator && row.indicator.type !== "band") {
            dropOutcome.tip = DROP_MSG_BAND_INSIDE;
            dropOutcome.shakeRowId = rowId;
            return row;
          }
          if (payload.value === "two_indicators_cross" && row.indicator && row.indicator.type !== "line") {
            dropOutcome.tip = DROP_MSG_LINE_CROSS;
            dropOutcome.shakeRowId = rowId;
            return row;
          }
          let next = { ...row, condition: payload.value };
          if (row.indicator?.type === "oscillator" && (payload.value === "crosses_above" || payload.value === "crosses_below")) next.value = 70;
          if (row.indicator?.type === "oscillator" && payload.value === "less_than") next.value = 30;
          if (payload.value === "two_indicators_cross" || payload.value === "inside_band") next.value = null;
          if (payload.value === "inside_band") next.bandZone = next.bandZone || "full";
          if (payload.value === "two_indicators_cross" && payload.presetFirstKind && payload.presetSecondKind) {
            next = {
              ...next,
              indicator: mkIndicator(payload.presetFirstKind),
              secondIndicator: mkIndicator(payload.presetSecondKind),
            };
          } else if (payload.value === "inside_band" && payload.presetBandKind) {
            let ind = mkIndicator(payload.presetBandKind);
            if (payload.presetParams && typeof payload.presetParams === "object") {
              ind = { ...ind, params: { ...ind.params, ...payload.presetParams } };
            }
            next = { ...next, indicator: ind, secondIndicator: null, bandZone: "full" };
          }
          return next;
        }
        return row;
      });
      return { ...rule, conditions };
    }));
    if (dropOutcome.tip) setDropTip(dropOutcome.tip);
    if (dropOutcome.shakeRowId) {
      setShakeRowId(dropOutcome.shakeRowId);
      setTimeout(() => setShakeRowId(null), 550);
    }
    setCustomCode(false);
    setVisualLocked(false);
  };

  const blockMeta = useMemo(() => {
    const rows = [
      ...INDICATORS.map((i) => ({ key: i.kind, title: i.kind, subtitle: `${i.full} · ${i.type}`, what: i.what, source: "indicator" })),
      ...CONDITIONS.map((c) => ({ key: c.id, title: c.label, subtitle: "Condition block", what: `Compares indicator values via ${c.label.toLowerCase()} logic.`, source: "condition" })),
      ...ACTIONS.map((a) => ({ key: a.kind, title: a.label, subtitle: `${a.side} action`, what: "Places a portfolio action when a rule fires.", source: "action" })),
      ...RISKS.map((r) => ({ key: r.kind, title: r.label, subtitle: "Risk control", what: "Applies protective exits around open positions.", source: "risk" })),
    ];
    return rows.find((x) => x.key === detailKey) || null;
  }, [detailKey]);
  const glossaryMeta = useMemo(() => {
    if (!blockMeta) return null;
    const info = GLOSSARY[blockMeta.key] || null;
    const indicator = INDICATORS.find((i) => i.kind === blockMeta.key);
    const supported = blockMeta.source === "indicator"
      ? CONDITIONS.filter((c) => compat(indicator?.type, c.id)).map((c) => c.label)
      : blockMeta.source === "condition"
        ? ["Any indicator type allowed by this condition"]
        : blockMeta.source === "action"
          ? ["No condition restriction (action applies after rule conditions are true)"]
          : ["Risk controls run independently from entry/exit condition matching"];
    return {
      what: info?.what || blockMeta.what,
      does: info?.does || "Defines one piece of rule logic for strategy execution.",
      use: info?.use || "Use when this behavior should be explicit and testable.",
      examples: info?.examples || ["Build a rule with this block and validate in the code panel."],
      supported,
    };
  }, [blockMeta]);
  const renderGlossaryGraphic = () => {
    if (!blockMeta) return null;
    const key = blockMeta.key;
    const source = blockMeta.source;
    const indicatorType = INDICATORS.find((i) => i.kind === key)?.type;

    if (source === "indicator" && indicatorType === "oscillator") {
      return (
        <svg viewBox="0 0 270 68" style={{ width: "100%", height: "100%" }}>
          <line x1="8" y1="16" x2="262" y2="16" stroke="#d8b36f" strokeDasharray="3 3" />
          <line x1="8" y1="52" x2="262" y2="52" stroke="#d8b36f" strokeDasharray="3 3" />
          <path d="M8 48 L32 44 L56 40 L80 34 L104 28 L128 22 L152 20 L176 24 L200 32 L224 44 L262 50" stroke="#854F0B" fill="none" />
          <text x="12" y="14" fontSize="9" fill="#7a5b2b">70</text>
          <text x="12" y="64" fontSize="9" fill="#7a5b2b">30</text>
          <text x="218" y="12" fontSize="9" fill="#666">Oscillator</text>
        </svg>
      );
    }

    if (source === "indicator" && indicatorType === "band") {
      return (
        <svg viewBox="0 0 270 68" style={{ width: "100%", height: "100%" }}>
          <path d="M8 18 L34 20 L60 19 L86 22 L112 23 L138 22 L164 24 L190 25 L216 24 L262 26" stroke="#0F6E56" fill="none" />
          <path d="M8 34 L34 35 L60 34 L86 36 L112 37 L138 36 L164 37 L190 38 L216 37 L262 38" stroke="#0F6E56" fill="none" />
          <path d="M8 50 L34 49 L60 48 L86 50 L112 52 L138 51 L164 53 L190 54 L216 53 L262 55" stroke="#0F6E56" fill="none" />
          <path d="M8 42 L34 38 L60 40 L86 28 L112 30 L138 26 L164 34 L190 30 L216 32 L262 24" stroke="#999" fill="none" />
          <text x="210" y="14" fontSize="9" fill="#085041">Upper</text>
          <text x="210" y="33" fontSize="9" fill="#085041">Middle</text>
          <text x="210" y="61" fontSize="9" fill="#085041">Lower</text>
        </svg>
      );
    }

    if (source === "condition" && key === "two_indicators_cross") {
      return (
        <svg viewBox="0 0 270 68" style={{ width: "100%", height: "100%" }}>
          <path d="M8 52 L48 46 L88 40 L128 32 L168 24 L208 18 L262 14" stroke="#185FA5" fill="none" />
          <path d="M8 14 L48 18 L88 24 L128 30 L168 36 L208 42 L262 48" stroke="#3C3489" fill="none" />
          <circle cx="128" cy="31" r="3.2" fill="#111" />
          <text x="136" y="26" fontSize="9" fill="#444">Cross point</text>
        </svg>
      );
    }

    if (source === "condition" && key === "inside_band") {
      return (
        <svg viewBox="0 0 270 68" style={{ width: "100%", height: "100%" }}>
          <path d="M8 18 L60 18 L112 20 L164 19 L216 21 L262 20" stroke="#0F6E56" fill="none" />
          <path d="M8 50 L60 50 L112 52 L164 51 L216 53 L262 52" stroke="#0F6E56" fill="none" />
          <path d="M8 40 L34 38 L60 36 L86 34 L112 30 L138 28 L164 31 L190 34 L216 36 L262 38" stroke="#999" fill="none" />
          <rect x="8" y="18" width="254" height="34" fill="#E1F5EE" opacity="0.22" />
          <text x="188" y="14" fontSize="9" fill="#085041">inside zone</text>
        </svg>
      );
    }

    if (source === "action") {
      return (
        <svg viewBox="0 0 270 68" style={{ width: "100%", height: "100%" }}>
          <path d="M8 54 L42 50 L76 46 L110 40 L144 34 L178 28 L212 22 L262 16" stroke="#999" fill="none" />
          <line x1="58" y1="56" x2="58" y2="18" stroke={actionSide(key) === "buy" ? "#639922" : "#E24B4A"} strokeDasharray="3 3" />
          <polygon points={actionSide(key) === "buy" ? "58,20 52,30 64,30" : "58,54 52,44 64,44"} fill={actionSide(key) === "buy" ? "#639922" : "#E24B4A"} />
          <text x="68" y="24" fontSize="9" fill={actionSide(key) === "buy" ? "#27500a" : "#791F1F"}>{actionSide(key) === "buy" ? "Buy trigger" : "Sell trigger"}</text>
        </svg>
      );
    }

    if (source === "risk") {
      return (
        <svg viewBox="0 0 270 68" style={{ width: "100%", height: "100%" }}>
          <path d="M8 52 L40 48 L72 44 L104 36 L136 30 L168 24 L200 20 L262 14" stroke="#999" fill="none" />
          <line x1="8" y1={key === "stop_loss" ? "58" : "18"} x2="262" y2={key === "stop_loss" ? "58" : "18"} stroke="#EF9F27" strokeDasharray="4 3" />
          <text x="176" y={key === "stop_loss" ? "54" : "14"} fontSize="9" fill="#7a5800">{key === "stop_loss" ? "Stop floor" : "Take-profit target"}</text>
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 270 68" style={{ width: "100%", height: "100%" }}>
        <path d="M8 48 L34 40 L60 44 L86 30 L112 33 L138 22 L164 28 L190 20 L216 23 L262 14" stroke="#999" fill="none" />
        <path d="M8 55 L34 52 L60 50 L86 45 L112 42 L138 38 L164 34 L190 30 L216 26 L262 22" stroke="#639922" fill="none" />
      </svg>
    );
  };

  const renderParams = () => null;

  const hasRiskRule = rules.some((r) => r.kind === "risk");
  const primaryRiskRule = rules.find((r) => r.kind === "risk");
  const hasStopLossRule = Number(primaryRiskRule?.stopLoss || 0) > 0;
  const hasTakeProfitRule = Number(primaryRiskRule?.takeProfit || 0) > 0;
  const workspaceCol = (
    <section
      style={{
        padding: "0 16px",
        borderRight: "0.5px solid #e4e2db",
        minWidth: 0,
        maxHeight: hasRiskRule ? "calc(100vh - 180px)" : "none",
        overflowY: hasRiskRule ? "auto" : "visible",
        overflowX: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, borderBottom: "1px solid var(--border-light)", paddingBottom: 10 }}>
        <div>
          <h2 className="card-title">Rules</h2>
          <div style={{ marginTop: 2, fontSize: 11, color: "#888" }}>Build entry, exit, and risk logic by combining conditions with actions.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={{ border: "0.5px solid #d0cec8", borderRadius: 7, background: "#fff", padding: "7px 10px", fontSize: 12 }}
            onClick={() => {
              setRules([mkRule("entry"), mkRule("exit")]);
              setCodeUtilityTab("checklist");
              setCustomCode(false);
              setVisualLocked(false);
            }}
          >
            Reset
          </button>
          <button
            type="button"
            style={{ border: "0.5px solid #d0cec8", borderRadius: 7, background: "#fff", padding: "7px 10px", fontSize: 12 }}
            onClick={() => {
              const res = onSaveStrategy?.();
              if (res?.ok) setSaveFeedback(`Saved: ${res.title}`);
              else setSaveFeedback(res?.reason || "Could not save strategy.");
            }}
          >
            {saveFeedback ? saveFeedback : "Save"}
          </button>
          <button type="button" style={{ border: 0, borderRadius: 7, background: "#111", color: "#fff", padding: "7px 10px", fontSize: 12 }} onClick={() => onOpenBacktesting?.()}>Test →</button>
        </div>
      </div>
      {visualLocked ? <div style={{ border: "1px solid #E24B4A", background: "#FCEBEB", color: "#791F1F", borderRadius: 8, padding: 10, marginBottom: 10 }}>Custom code active — visual editing paused. Reset to visual in Code.</div> : null}
      {!rules.length ? (
        <div style={{ border: "1px dashed #d9d6cf", borderRadius: 10, background: "#fff", textAlign: "center", padding: "40px 16px", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Start building your strategy</div>
          <div style={{ marginTop: 5, fontSize: 11, color: "#888" }}>Drag a block from the left to add your first rule.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 14 }}>
            {["entry", "exit", "risk"].map((k) => <button key={k} type="button" onClick={() => setRules((p) => [...p, mkRule(k)])} style={{ border: "1px dashed #d0cec8", borderRadius: 8, padding: "9px 10px", fontSize: 11, color: "#888", background: "#fff" }}>● {k[0].toUpperCase() + k.slice(1)}</button>)}
          </div>
        </div>
      ) : (
        <>
          {rules.map((rule) => (
            <div key={rule.id} style={{ background: TOKENS.cardBg, border: TOKENS.cardBorder, borderLeft: `3px solid ${rule.kind === "entry" ? "#639922" : rule.kind === "exit" ? "#E24B4A" : "#EF9F27"}`, borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 600, borderRadius: rule.kind === "risk" ? 6 : 20, padding: "2px 8px", border: `1px solid ${rule.kind === "entry" ? "#639922" : rule.kind === "exit" ? "#E24B4A" : "#EF9F27"}`, color: rule.kind === "entry" ? "#27500a" : rule.kind === "exit" ? "#791F1F" : "#7a5800", background: rule.kind === "entry" ? "#eaf3de" : rule.kind === "exit" ? "#FCEBEB" : "#FFF3CD" }}>{rule.kind.toUpperCase()}</span>
                <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 500, flex: 1 }}>{rule.title}</span>
                {rule.kind === "risk" ? iconButton("×", () => setRules((prev) => prev.filter((r) => r.id !== rule.id))) : null}
              </div>
              {rule.kind === "risk" ? (
                <div
                  style={{ border: "0.5px solid #e4e2db", borderRadius: 7, padding: "7px 9px", background: "#fff", minHeight: 36 }}
                  onDragOverCapture={(e) => e.preventDefault()}
                  onDropCapture={(e) => applyDrop(e, rule.id, null, "risk-type")}
                >
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => applyDrop(e, rule.id, null, "risk-type")}>
                    {Number(rule.stopLoss || 0) > 0 ? (
                      <div style={{ display: "inline-flex", alignItems: "stretch", border: `0.5px solid ${BADGE.risk.border}`, borderRadius: 7, overflow: "hidden", background: "#fff" }}>
                        <button type="button" onClick={() => openGlossary("stop_loss")} style={{ fontSize: 11.5, border: 0, background: BADGE.risk.bg, color: BADGE.risk.text, padding: "4px 9px" }}>
                          Stop loss
                        </button>
                        <input type="number" aria-label="Stop loss percentage" value={rule.stopLoss ?? ""} onChange={(e) => setRules((prev) => prev.map((r) => r.id === rule.id ? ({ ...r, stopLoss: e.target.value === "" ? null : Number(e.target.value) }) : r))} style={{ width: 56, border: 0, background: "#fff", fontSize: 11.5, textAlign: "right", fontFamily: "monospace", padding: "0 8px", outline: "none" }} />
                        <span style={{ height: 26, display: "inline-flex", alignItems: "center", padding: "0 6px", borderLeft: "0.5px solid #ece8de", background: "#fff", fontSize: 9.5, color: "#9a968d" }}>%</span>
                        <button type="button" onClick={() => setRules((prev) => prev.map((r) => r.id === rule.id ? ({ ...r, stopLoss: null }) : r))} style={{ border: 0, borderLeft: "0.5px solid #ece8de", background: "#fff", color: "#777", padding: "0 8px", fontSize: 12, cursor: "pointer" }}>×</button>
                      </div>
                    ) : null}
                    {Number(rule.takeProfit || 0) > 0 ? (
                      <div style={{ display: "inline-flex", alignItems: "stretch", border: `0.5px solid ${BADGE.risk.border}`, borderRadius: 7, overflow: "hidden", background: "#fff" }}>
                        <button type="button" onClick={() => openGlossary("take_profit")} style={{ fontSize: 11.5, border: 0, background: BADGE.risk.bg, color: BADGE.risk.text, padding: "4px 9px" }}>
                          Take profit
                        </button>
                        <input type="number" aria-label="Take profit percentage" value={rule.takeProfit ?? ""} onChange={(e) => setRules((prev) => prev.map((r) => r.id === rule.id ? ({ ...r, takeProfit: e.target.value === "" ? null : Number(e.target.value) }) : r))} style={{ width: 56, border: 0, background: "#fff", fontSize: 11.5, textAlign: "right", fontFamily: "monospace", padding: "0 8px", outline: "none" }} />
                        <span style={{ height: 26, display: "inline-flex", alignItems: "center", padding: "0 6px", borderLeft: "0.5px solid #ece8de", background: "#fff", fontSize: 9.5, color: "#9a968d" }}>%</span>
                        <button type="button" onClick={() => setRules((prev) => prev.map((r) => r.id === rule.id ? ({ ...r, takeProfit: null }) : r))} style={{ border: 0, borderLeft: "0.5px solid #ece8de", background: "#fff", color: "#777", padding: "0 8px", fontSize: 12, cursor: "pointer" }}>×</button>
                      </div>
                    ) : null}
                    {Number(rule.stopLoss || 0) <= 0 && Number(rule.takeProfit || 0) <= 0 ? (
                      <div style={{ border: "0.5px dashed #d5d3cc", borderRadius: 7, background: "#faf9f6", color: "#999", fontStyle: "italic", fontSize: 11, padding: "6px 9px" }}>
                        Drag Stop loss % or Take profit % here
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#8A8278", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>When all these are true</div>
                  {rule.conditions.map((row, i) => (
                    <div key={row.id} style={{ marginBottom: 8 }}>
                      {i > 0 ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 5 }}>
                          {["AND", "OR"].map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, combinators: r.combinators.map((x, xi) => xi === i - 1 ? c : x) })))}
                              style={{
                                fontSize: 9.5,
                                borderRadius: 20,
                                border: "0.5px solid #dfdcd4",
                                background: rule.combinators[i - 1] === c ? "#f4f2ff" : "#faf9f6",
                                color: rule.combinators[i - 1] === c ? "#5a54a5" : "#8b877f",
                                padding: "1px 7px",
                              }}
                            >
                              {c}
                            </button>
                          ))}
                          <button
                            type="button"
                            aria-label="Remove this condition"
                            onClick={() => setRules((prev) => prev.map((r) => {
                              if (r.id !== rule.id) return r;
                              const nextConditions = r.conditions.filter((_, idx) => idx !== i);
                              const nextCombinators = r.combinators.filter((_, idx) => idx !== i - 1);
                              return { ...r, conditions: nextConditions.length ? nextConditions : [mkRow()], combinators: nextCombinators };
                            }))}
                            style={{ border: 0, background: "transparent", color: "#aaa", fontSize: 12, lineHeight: 1, padding: "0 2px", cursor: "pointer" }}
                          >
                            ×
                          </button>
                        </div>
                      ) : null}
                      <div
                        style={{
                          border:
                            row.condition === "two_indicators_cross" || row.condition === "inside_band"
                              ? "none"
                              : row.indicator || row.condition
                                ? "0.5px solid #e4e2db"
                                : "1.5px dashed rgba(0,0,0,0.13)",
                          borderRadius: row.condition === "two_indicators_cross" || row.condition === "inside_band" ? 0 : 7,
                          background:
                            row.condition === "two_indicators_cross" || row.condition === "inside_band"
                              ? "transparent"
                              : row.indicator || row.condition
                                ? "#fff"
                                : "#faf9f6",
                          padding:
                            row.condition === "two_indicators_cross" || row.condition === "inside_band"
                              ? 0
                              : row.indicator || row.condition
                                ? "7px 9px"
                                : "16px 18px",
                          minHeight: 36,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                          width: "100%",
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => applyDrop(e, rule.id, row.id, "row")}
                      >
                        {!row.indicator && !row.condition ? <span style={{ fontSize: 11, color: "#aaa", fontStyle: "italic" }}>Drag a condition here</span> : null}
                        {row.condition === "two_indicators_cross" ? (
                          <div className={shakeRowId === row.id ? "sb-cond-row--shake" : undefined} style={{ width: "100%" }}>
                            <div style={{ background: "#fff", border: "0.5px solid #e4e2db", borderRadius: 10, padding: "12px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                {row.indicator ? (
                                  <div style={{ display: "inline-flex", alignItems: "center", borderRadius: 8, border: "0.5px solid #185FA5", background: "#E6F1FB", color: "#0C447C", overflow: "hidden", flexShrink: 0 }}>
                                    <button type="button" onClick={() => openGlossary(row.indicator.kind)} style={{ padding: "6px 10px", fontSize: 12, fontWeight: 500, border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}>{row.indicator.kind}</button>
                                    {row.indicator.kind !== "Volume" ? <span style={{ width: 0.5, alignSelf: "stretch", background: "rgba(0,0,0,0.12)" }} /> : null}
                                    {row.indicator.kind === "SMA" || row.indicator.kind === "EMA" ? (
                                      <div style={{ display: "inline-flex", alignItems: "center", padding: "6px 8px", background: "rgba(14,68,124,0.06)" }}>
                                        <input type="number" value={Number(row.indicator.params?.period ?? 20)} onChange={(e) => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, conditions: r.conditions.map((x) => x.id !== row.id || !x.indicator ? x : ({ ...x, indicator: { ...x.indicator, params: { ...x.indicator.params, period: Number(e.target.value || 0) } } })) })))} style={{ width: 28, border: 0, background: "transparent", textAlign: "right", fontSize: 11, fontFamily: "monospace", color: "inherit", outline: "none" }} />
                                        <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>bars</span>
                                      </div>
                                    ) : null}
                                    {row.indicator.kind === "MACD" ? (
                                      <div style={{ display: "inline-flex", alignItems: "center", padding: "6px 8px", background: "rgba(14,68,124,0.06)", fontFamily: "monospace", fontSize: 11 }}>
                                        {["fast", "slow", "signal"].map((k, idx2) => (
                                          <span key={`${row.id}-tc1-${k}`} style={{ display: "inline-flex", alignItems: "center" }}>
                                            <input type="number" value={Number(row.indicator.params?.[k] ?? (k === "fast" ? 12 : k === "slow" ? 26 : 9))} onChange={(e) => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, conditions: r.conditions.map((x) => x.id !== row.id || !x.indicator ? x : ({ ...x, indicator: { ...x.indicator, params: { ...x.indicator.params, [k]: Number(e.target.value || 0) } } })) })))} style={{ width: 24, border: 0, background: "transparent", textAlign: "right", fontSize: 11, fontFamily: "monospace", color: "inherit", outline: "none" }} />
                                            {idx2 < 2 ? <span style={{ opacity: 0.6, margin: "0 3px" }}>/</span> : null}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                    <span style={{ width: 0.5, alignSelf: "stretch", background: "rgba(0,0,0,0.12)" }} />
                                    <button type="button" aria-label={`Remove ${row.indicator.kind}`} onClick={() => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, conditions: r.conditions.map((x) => x.id !== row.id ? x : ({ ...x, indicator: null, secondIndicator: null, condition: null, value: null })) })))} style={{ padding: "6px 8px", fontSize: 11, opacity: 0.4, border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}>×</button>
                                  </div>
                                ) : null}
                                <span style={{ background: "#EEEDFE", color: "#3C3489", border: "0.5px solid #AFA9EC", borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap" }}>crosses</span>
                                <div
                                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setSecondIndicatorDropHotRowId(row.id); }}
                                  onDragLeave={() => setSecondIndicatorDropHotRowId(null)}
                                  onDrop={(e) => { e.stopPropagation(); setSecondIndicatorDropHotRowId(null); applyDrop(e, rule.id, row.id, "second-indicator"); }}
                                >
                                  {row.secondIndicator ? (
                                    <div style={{ display: "inline-flex", alignItems: "center", borderRadius: 8, border: "0.5px solid #854F0B", background: "#FAEEDA", color: "#633806", overflow: "hidden", flexShrink: 0 }}>
                                      <button type="button" onClick={() => openGlossary(row.secondIndicator.kind)} style={{ padding: "6px 10px", fontSize: 12, fontWeight: 500, border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}>{row.secondIndicator.kind}</button>
                                      {row.secondIndicator.kind !== "Volume" ? <span style={{ width: 0.5, alignSelf: "stretch", background: "rgba(0,0,0,0.12)" }} /> : null}
                                      {row.secondIndicator.kind === "SMA" || row.secondIndicator.kind === "EMA" ? (
                                        <div style={{ display: "inline-flex", alignItems: "center", padding: "6px 8px", background: "rgba(101,56,6,0.06)" }}>
                                          <input type="number" value={Number(row.secondIndicator.params?.period ?? 20)} onChange={(e) => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, conditions: r.conditions.map((x) => x.id !== row.id || !x.secondIndicator ? x : ({ ...x, secondIndicator: { ...x.secondIndicator, params: { ...x.secondIndicator.params, period: Number(e.target.value || 0) } } })) })))} style={{ width: 28, border: 0, background: "transparent", textAlign: "right", fontSize: 11, fontFamily: "monospace", color: "inherit", outline: "none" }} />
                                          <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>bars</span>
                                        </div>
                                      ) : null}
                                      {row.secondIndicator.kind === "MACD" ? (
                                        <div style={{ display: "inline-flex", alignItems: "center", padding: "6px 8px", background: "rgba(101,56,6,0.06)", fontFamily: "monospace", fontSize: 11 }}>
                                          {["fast", "slow", "signal"].map((k, idx2) => (
                                            <span key={`${row.id}-tc2-${k}`} style={{ display: "inline-flex", alignItems: "center" }}>
                                              <input type="number" value={Number(row.secondIndicator.params?.[k] ?? (k === "fast" ? 12 : k === "slow" ? 26 : 9))} onChange={(e) => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, conditions: r.conditions.map((x) => x.id !== row.id || !x.secondIndicator ? x : ({ ...x, secondIndicator: { ...x.secondIndicator, params: { ...x.secondIndicator.params, [k]: Number(e.target.value || 0) } } })) })))} style={{ width: 24, border: 0, background: "transparent", textAlign: "right", fontSize: 11, fontFamily: "monospace", color: "inherit", outline: "none" }} />
                                              {idx2 < 2 ? <span style={{ opacity: 0.6, margin: "0 3px" }}>/</span> : null}
                                            </span>
                                          ))}
                                        </div>
                                      ) : null}
                                      <span style={{ width: 0.5, alignSelf: "stretch", background: "rgba(0,0,0,0.12)" }} />
                                      <button type="button" aria-label={`Remove second ${row.secondIndicator.kind}`} onClick={() => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, conditions: r.conditions.map((x) => x.id !== row.id ? x : ({ ...x, secondIndicator: null })) })))} style={{ padding: "6px 8px", fontSize: 11, opacity: 0.4, border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}>×</button>
                                    </div>
                                  ) : (
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `${secondIndicatorDropHotRowId === row.id ? "0.5px solid #AFA9EC" : "0.5px dashed #AFA9EC"}`, background: secondIndicatorDropHotRowId === row.id ? "#f3f1ff" : "#EEEDFE", color: "#7F77DD", fontSize: 11, cursor: "pointer" }}>
                                      <span style={{ fontSize: 10, opacity: 0.6 }}>+</span>
                                      <span>drop a Line indicator</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div style={{ background: "#f8f7f4", borderRadius: 6, padding: "7px 10px", fontSize: 11, marginTop: 10 }}>
                                {row.indicator && row.secondIndicator
                                  ? `Triggers when ${formatIndicatorShort(row.indicator)} and ${formatIndicatorShort(row.secondIndicator)} cross — fires in either direction`
                                  : "Drop a second Line indicator to complete this condition"}
                              </div>
                            </div>
                          </div>
                        ) : row.condition === "inside_band" ? (
                          <div style={{ width: "100%" }}>
                            <div style={{ background: "#fff", border: "0.5px solid #e4e2db", borderRadius: 10, padding: "12px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                {row.indicator ? (
                                  <div style={{ display: "inline-flex", alignItems: "center", borderRadius: 8, border: "0.5px solid #0F6E56", background: "#E1F5EE", color: "#085041", overflow: "hidden", flexShrink: 0 }}>
                                    <button type="button" onClick={() => openGlossary(row.indicator.kind)} style={{ padding: "6px 10px", fontSize: 12, fontWeight: 500, border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}>{row.indicator.kind}</button>
                                    <span style={{ width: 0.5, alignSelf: "stretch", background: "rgba(0,0,0,0.12)" }} />
                                    <div style={{ display: "inline-flex", alignItems: "center", padding: "6px 8px", background: "rgba(15,110,86,0.06)" }}>
                                      <input type="number" value={Number(row.indicator.params?.period ?? 20)} onChange={(e) => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, conditions: r.conditions.map((x) => x.id !== row.id || !x.indicator ? x : ({ ...x, indicator: { ...x.indicator, params: { ...x.indicator.params, period: Number(e.target.value || 0) } } })) })))} style={{ width: 28, border: 0, background: "transparent", textAlign: "right", fontSize: 11, fontFamily: "monospace", color: "inherit", outline: "none" }} />
                                      <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>bars</span>
                                    </div>
                                    <span style={{ width: 0.5, alignSelf: "stretch", background: "rgba(0,0,0,0.12)" }} />
                                    <div style={{ display: "inline-flex", alignItems: "center", padding: "6px 8px", background: "rgba(15,110,86,0.06)" }}>
                                      <input type="number" value={Number(row.indicator.kind === "Keltner Channel" ? row.indicator.params?.atrMultiplier ?? 2 : row.indicator.params?.stddev ?? 2)} onChange={(e) => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, conditions: r.conditions.map((x) => x.id !== row.id || !x.indicator ? x : ({ ...x, indicator: { ...x.indicator, params: { ...x.indicator.params, [row.indicator.kind === "Keltner Channel" ? "atrMultiplier" : "stddev"]: Number(e.target.value || 0) } } })) })))} style={{ width: 28, border: 0, background: "transparent", textAlign: "right", fontSize: 11, fontFamily: "monospace", color: "inherit", outline: "none" }} />
                                      <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>{row.indicator.kind === "Keltner Channel" ? "×" : "σ"}</span>
                                    </div>
                                    <span style={{ width: 0.5, alignSelf: "stretch", background: "rgba(0,0,0,0.12)" }} />
                                    <button type="button" aria-label={`Remove ${row.indicator.kind}`} onClick={() => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, conditions: r.conditions.map((x) => x.id !== row.id ? x : ({ ...x, indicator: null, condition: null, value: null, secondIndicator: null })) })))} style={{ padding: "6px 8px", fontSize: 11, opacity: 0.4, border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}>×</button>
                                  </div>
                                ) : (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "0.5px dashed #0F6E56", background: "#E1F5EE", color: "#085041", fontSize: 11 }}>drop a Band indicator</span>
                                )}
                                <span style={{ background: "#E1F5EE", color: "#085041", border: "0.5px solid #0F6E56", borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap" }}>is inside band</span>
                              </div>
                              <div style={{ marginTop: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: "#888", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Zone</div>
                                <div style={{ display: "flex", gap: 3, background: "#f5f4f0", borderRadius: 7, padding: 3, width: "fit-content" }}>
                                  {[
                                    ["full", "Upper to lower"],
                                    ["upper_half", "Middle to upper"],
                                    ["lower_half", "Lower to middle"],
                                  ].map(([zid, zlab]) => (
                                    <button key={zid} type="button" onClick={() => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, conditions: r.conditions.map((x) => x.id !== row.id ? x : ({ ...x, bandZone: zid })) })))} style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, border: (row.bandZone || "full") === zid ? "0.5px solid #0F6E56" : "none", background: (row.bandZone || "full") === zid ? "#fff" : "transparent", color: (row.bandZone || "full") === zid ? "#085041" : "#888", fontWeight: (row.bandZone || "full") === zid ? 500 : 400, cursor: "pointer" }}>{zlab}</button>
                                  ))}
                                </div>
                              </div>
                              <div style={{ background: "#f8f7f4", borderRadius: 6, padding: "7px 10px", fontSize: 11, marginTop: 8 }}>
                                {(row.bandZone || "full") === "upper_half"
                                  ? `Triggers when price is in the upper half of ${row.indicator?.kind || "the band"}`
                                  : (row.bandZone || "full") === "lower_half"
                                    ? `Triggers when price is in the lower half of ${row.indicator?.kind || "the band"}`
                                    : `Triggers when price is between the upper and lower ${row.indicator?.kind || "band"} — signals a consolidation period`}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            {row.indicator ? (
                              <div style={{ border: "0.5px solid #e4e2db", borderRadius: 7, background: "#fff", overflow: "hidden", minWidth: 220 }}>
                                <div style={{ padding: "6px 8px" }}>
                                  <div style={{ display: "inline-flex", alignItems: "stretch", border: `0.5px solid ${BADGE[row.indicator.type].border}`, borderRadius: 7, overflow: "hidden", background: "#fff" }}>
                                    <button type="button" onClick={() => openGlossary(row.indicator.kind)} style={{ fontSize: 11.5, border: 0, borderRight: `1px solid ${BADGE[row.indicator.type].border}`, background: BADGE[row.indicator.type].bg, color: BADGE[row.indicator.type].text, borderRadius: 0, padding: "4px 9px" }}>
                                      {row.indicator.kind}
                                    </button>
                                    {Object.keys(row.indicator.params || {})
                                      .filter((k) => k !== "appliedTo")
                                      .map((key) => (
                                        <div key={`${row.id}-${key}`} style={{ display: "inline-flex", alignItems: "stretch" }}>
                                          <input
                                            type="number"
                                            aria-label={`${row.indicator.kind} ${key}`}
                                            value={row.indicator.params[key] ?? ""}
                                            onChange={(e) => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({
                                              ...r,
                                              conditions: r.conditions.map((x) => x.id !== row.id || !x.indicator ? x : ({
                                                ...x,
                                                indicator: { ...x.indicator, params: { ...x.indicator.params, [key]: Number(e.target.value || 0) } },
                                              })),
                                            })))}
                                            style={{ height: 26, width: 56, border: 0, borderLeft: "0.5px solid #ece8de", background: "#fff", padding: "0 7px 0 8px", fontSize: 11.5, color: "#222", outline: "none", textAlign: "right", fontFamily: "monospace" }}
                                          />
                                          <span style={{ height: 26, display: "inline-flex", alignItems: "center", padding: "0 5px 0 4px", borderLeft: "0.5px solid #ece8de", background: "#fff", fontSize: 9.5, color: "#9a968d", letterSpacing: "0.01em" }}>
                                            {PARAM_UNIT[key] || key}
                                          </span>
                                        </div>
                                      ))}
                                    {"appliedTo" in (row.indicator.params || {}) ? (
                                      <select
                                        aria-label={`${row.indicator.kind} applied to`}
                                        value={row.indicator.params.appliedTo ?? "Close"}
                                        onChange={(e) => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({
                                          ...r,
                                          conditions: r.conditions.map((x) => x.id !== row.id || !x.indicator ? x : ({
                                            ...x,
                                            indicator: { ...x.indicator, params: { ...x.indicator.params, appliedTo: e.target.value } },
                                          })),
                                        })))}
                                        style={{ height: 26, border: 0, borderLeft: `1px solid ${BADGE[row.indicator.type].border}`, background: "#fffdf8", padding: "0 8px", fontSize: 11, color: "#444", outline: "none" }}
                                      >
                                        {["Close", "Open", "High", "Low"].map((v) => (
                                          <option key={v} value={v}>{v}</option>
                                        ))}
                                      </select>
                                    ) : null}
                                    <button
                                      type="button"
                                      aria-label={`Remove ${row.indicator.kind} indicator`}
                                      onClick={() => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({
                                        ...r,
                                        conditions: r.conditions.map((x) => x.id !== row.id ? x : ({ ...x, indicator: null, secondIndicator: null })),
                                      })))}
                                      style={{ height: 26, border: 0, borderLeft: `1px solid ${BADGE[row.indicator.type].border}`, background: "#fff", color: "#777", padding: "0 8px", fontSize: 12, cursor: "pointer" }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                            {row.condition ? (
                              <div style={{ display: "inline-flex", alignItems: "stretch", border: "1px solid #AFA9EC", borderRadius: 7, overflow: "hidden", background: "#fff" }}>
                                <button type="button" onClick={() => openGlossary(row.condition)} style={{ fontSize: 11.5, border: 0, borderRight: "1px solid #cdc8f0", background: "#EEEDFE", color: "#3C3489", borderRadius: 0, padding: "4px 9px" }}>
                                  {CONDITIONS.find((x) => x.id === row.condition)?.label || row.condition}
                                </button>
                                <input
                                  type="number"
                                  min={row.indicator?.type === "oscillator" ? 0 : undefined}
                                  max={row.indicator?.type === "oscillator" ? 100 : undefined}
                                  placeholder="Enter value"
                                  aria-label="Condition threshold value"
                                  value={row.value ?? ""}
                                  onChange={(e) => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, conditions: r.conditions.map((x) => x.id !== row.id ? x : ({ ...x, value: Number(e.target.value) })) })))}
                                  style={{ height: 26, width: 92, border: 0, background: "#fffdf8", padding: "0 9px", fontSize: 11.5, color: "#222", outline: "none" }}
                                />
                                <span style={{ height: 26, display: "inline-flex", alignItems: "center", padding: "0 6px", borderLeft: "0.5px solid #ece8de", background: "#fff", fontSize: 9.5, color: "#9a968d", letterSpacing: "0.01em" }}>
                                  {row.indicator?.type === "oscillator" ? "0-100" : "price"}
                                </span>
                                <button
                                  type="button"
                                  aria-label="Remove condition"
                                  onClick={() => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({
                                    ...r,
                                    conditions: r.conditions.map((x) => x.id !== row.id ? x : ({ ...x, condition: null, value: null, secondIndicator: null, bandZone: "full" })),
                                  })))}
                                  style={{ border: 0, borderLeft: "1px solid #cdc8f0", background: "#fff", color: "#777", padding: "0 8px", fontSize: 12, cursor: "pointer" }}
                                >
                                  ×
                                </button>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 6, marginTop: 14, marginBottom: 8, justifyContent: "center" }}>
                    <button
                      type="button"
                      onClick={() => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, conditions: [...r.conditions, mkRow()], combinators: [...r.combinators, "AND"] })))}
                      style={{ border: "0.5px dashed #d0cec8", borderRadius: 7, background: "#fff", color: "#666", padding: "5px 8px", fontSize: 10.5 }}
                    >
                      + Add condition
                    </button>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#8A8278", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6, marginTop: 8 }}>Then do this</div>
                  <div
                    style={{ border: "0.5px solid #e4e2db", borderRadius: 7, background: "#fff", padding: "7px 9px", minHeight: 36 }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragOverCapture={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const rawAction = e.dataTransfer.getData("text/x-action-kind");
                      if (rawAction && actionKinds.has(rawAction)) dragPayloadRef.current = { kind: "action", value: rawAction };
                      applyDrop(e, rule.id, null, "action");
                    }}
                    onDropCapture={(e) => {
                      const rawAction = e.dataTransfer.getData("text/x-action-kind");
                      if (rawAction && actionKinds.has(rawAction)) dragPayloadRef.current = { kind: "action", value: rawAction };
                      applyDrop(e, rule.id, null, "action");
                    }}
                  >
                    {rule.action ? (
                      <div style={{ display: "inline-flex", alignItems: "stretch", border: `0.5px solid ${rule.action.kind.startsWith("buy") ? BADGE.buy.border : BADGE.sell.border}`, borderRadius: 7, overflow: "hidden", background: "#fff" }}>
                        <button type="button" onClick={() => openGlossary(rule.action.kind)} style={{ fontSize: 11.5, border: 0, background: rule.action.kind.startsWith("buy") ? BADGE.buy.bg : BADGE.sell.bg, color: rule.action.kind.startsWith("buy") ? BADGE.buy.text : BADGE.sell.text, borderRadius: 0, padding: "4px 9px" }}>{ACTIONS.find((a) => a.kind === rule.action.kind)?.label || rule.action.kind}</button>
                        {(rule.action.kind === "buy_percent_portfolio" || rule.action.kind === "sell_percent_position") ? (
                          <>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              aria-label={rule.action.kind === "buy_percent_portfolio" ? "Percent of portfolio to allocate" : "Percent of position to sell"}
                              value={Number(rule.action.params?.value ?? 50)}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const n = raw === "" ? 50 : Number(raw);
                                const clamped = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50;
                                setRules((prev) => prev.map((r) => {
                                  if (r.id !== rule.id || !r.action) return r;
                                  return {
                                    ...r,
                                    action: { ...r.action, params: { ...r.action.params, value: clamped } },
                                  };
                                }));
                              }}
                              style={{ width: 56, border: 0, background: "#fff", fontSize: 11.5, textAlign: "right", fontFamily: "monospace", padding: "0 8px", outline: "none", height: 26 }}
                            />
                            <span style={{ height: 26, display: "inline-flex", alignItems: "center", padding: "0 6px", borderLeft: "0.5px solid #ece8de", background: "#fff", fontSize: 9.5, color: "#9a968d" }}>%</span>
                          </>
                        ) : null}
                        <button
                          type="button"
                          aria-label="Remove action"
                          onClick={() => setRules((prev) => prev.map((r) => r.id !== rule.id ? r : ({ ...r, action: null })))}
                          style={{ border: 0, borderLeft: "0.5px solid #ece8de", background: "#fff", color: "#777", padding: "0 8px", fontSize: 12, cursor: "pointer" }}
                        >
                          ×
                        </button>
                      </div>
                    ) : <span style={{ fontSize: 11, color: "#aaa", fontStyle: "italic" }}>Drop an action block here</span>}
                  </div>
                </>
              )}
              <div style={{ marginTop: 8, borderRadius: 7, background: "#f8f7f4", padding: "11px 16px", fontSize: 11.5, color: "#555", lineHeight: 1.55 }}>ⓘ {summary(rule)}</div>
            </div>
          ))}
        </>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "nowrap" }}>
          <div
            style={{ display: "inline-flex", gap: 6 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              let payload = null;
              try {
                const raw = e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain") || "";
                payload = raw ? JSON.parse(raw) : dragPayloadRef.current;
              } catch {
                payload = dragPayloadRef.current;
              }
              if (payload?.kind !== "risk") return;
              setRules((prev) => {
                const existing = prev.find((r) => r.kind === "risk");
                if (!existing) {
                  return [...prev, payload.value === "stop_loss" ? { ...mkRule("risk"), stopLoss: 2, takeProfit: null } : { ...mkRule("risk"), stopLoss: null, takeProfit: 5 }];
                }
                return prev.map((r) => {
                  if (r.id !== existing.id) return r;
                  return payload.value === "stop_loss"
                    ? { ...r, stopLoss: Number(r.stopLoss || 2) || 2 }
                    : { ...r, takeProfit: Number(r.takeProfit || 5) || 5 };
                });
              });
            }}
          >
            {!hasStopLossRule || !hasTakeProfitRule ? (
              <button
                type="button"
                onClick={() => setRules((prev) => {
                  const existing = prev.find((r) => r.kind === "risk");
                  if (!existing) return [...prev, { ...mkRule("risk"), stopLoss: 2, takeProfit: null }];
                  return prev.map((r) => {
                    if (r.id !== existing.id) return r;
                    if (!hasStopLossRule) return { ...r, stopLoss: 2 };
                    if (!hasTakeProfitRule) return { ...r, takeProfit: 5 };
                    return r;
                  });
                })}
                style={{ border: "0.5px dashed #d0cec8", borderRadius: 8, color: "#7a5800", background: "#fdf8ed", padding: "9px 16px", fontSize: 10, whiteSpace: "nowrap" }}
              >
                + Add risk rule
              </button>
            ) : <span />}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "0.5px solid #d9d6ce", borderRadius: 999, background: "#f7f6f2", color: "#555", padding: "9px 16px", fontSize: 9.5, width: "fit-content", whiteSpace: "nowrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: checklistItems.filter((x) => x.done).length === checklistItems.length ? "#639922" : "#EF9F27" }} />
            {checklistItems.filter((x) => x.done).length}/{checklistItems.length} checks complete
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "#777", paddingLeft: 2 }}>
          {canTest ? "Looks good. Use the top-right Test button when you're ready." : "Complete missing rule fields, then run Test from the top-right controls."}
        </div>
      </div>
    </section>
  );

  const codeCol = (
    <section style={{ paddingLeft: 16, minWidth: 0 }}>
      <div className="cs-card min-w-0 overflow-hidden">
        <div className="cs-card-header pb-2">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <h2 className="card-title">Code</h2>
            <button type="button" className="backtest-expand-btn" onClick={() => onExpandEditor?.()}>Expand</button>
          </div>
        </div>
        <div className="min-w-0 border-t border-ink/[0.06] px-4 py-3">
      <div style={{ marginBottom: 10, background: TOKENS.summaryDark, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ background: "#252525", borderBottom: "0.5px solid #333", padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 10, color: "#888" }}>Auto-generated from rules · strategy.py</div>
          <div style={{ display: "flex", gap: 6 }}>
            {["Copy"].map((b) => (
              <button key={b} type="button" style={{ fontSize: 10, color: "#ccc", border: "0.5px solid #444", background: "transparent", borderRadius: 6, padding: "3px 6px" }}
                onClick={() => {
                  if (b === "Copy") navigator.clipboard.writeText(codeText || "");
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: 209 }}>
          <Editor
            height="100%"
            defaultLanguage="python"
            theme="vs-dark"
            value={codeText}
            onMount={(ed) => { editorRef.current = ed; }}
            onChange={() => {}}
            options={{ fontSize: 11.5, lineHeight: 19, minimap: { enabled: false }, readOnly: true, domReadOnly: true, scrollBeyondLastLine: false }}
          />
        </div>
      </div>
      <div
        style={{
          marginBottom: 10,
          padding: "12px 14px",
          borderRadius: 10,
          border: TOKENS.cardBorder,
          background: "#faf9f6",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
        }}
        aria-live="polite"
      >
        <div style={{ fontSize: 10, fontWeight: 600, color: "#888", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>How it reads</div>
        {plainEnglishLines.length ? (
          plainEnglishLines.map((line, i) => (
            <p key={`pe-${i}-${line.slice(0, 24)}`} style={{ margin: i === 0 ? 0 : "10px 0 0", fontSize: 12.5, color: "#333", lineHeight: 1.6 }}>
              {line}
            </p>
          ))
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "#888", fontStyle: "italic", lineHeight: 1.5 }}>Add rules in the workspace to see a plain-English walkthrough.</p>
        )}
      </div>
      <div style={{ marginTop: 10, background: "#fff", border: TOKENS.cardBorder, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 6, padding: 8, borderBottom: "0.5px solid #e4e2db", background: "#faf9f6" }}>
          {[
            ["checklist", "Checklist"],
            ["playbook", "Playbook"],
            ["risk", "Risk Planner"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCodeUtilityTab(id)}
              style={{
                border: "0.5px solid #d0cec8",
                borderRadius: 7,
                background: codeUtilityTab === id ? "#fff" : "#f5f4f0",
                color: codeUtilityTab === id ? "#111" : "#666",
                fontSize: 11,
                padding: "5px 9px",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {codeUtilityTab === "checklist" ? (
          <div style={{ padding: 10, fontSize: 11, color: "#444", lineHeight: 1.55 }}>
            <div style={{ marginBottom: 8, fontSize: 10.5, color: "#666" }}>Complete these to make your strategy test-ready.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {checklistItems.map((item, idx) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 7, border: "0.5px solid #eceae4", borderRadius: 7, padding: "6px 8px", background: item.done ? "#f3faeb" : "#fff" }}>
                  <span style={{ width: 16, height: 16, borderRadius: 999, border: `1px solid ${item.done ? "#639922" : "#d0cec8"}`, color: item.done ? "#27500a" : "#999", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700 }}>{item.done ? "✓" : idx + 1}</span>
                  <span style={{ color: item.done ? "#27500a" : "#444" }}>{item.label}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 10.5, color: parseState.parseable ? "#27500a" : "#791F1F" }}>
              Code check: {parseState.reason}
            </div>
          </div>
        ) : null}
        {codeUtilityTab === "playbook" ? (
          <div style={{ padding: 10, fontSize: 11, color: "#444" }}>
            <div style={{ marginBottom: 8, fontSize: 10.5, color: "#666" }}>Start from a proven structure, then tweak in the workspace.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[
                ["trend", "Trend Following", "EMA momentum entry, EMA loss-of-momentum exit, stop loss included."],
                ["mean", "Mean Reversion", "RSI oversold entry, RSI strength exit, partial profit-taking preset."],
                ["breakout", "Volatility Breakout", "Band break entry, return-inside-band exit, wider stop preset."],
              ].map(([id, title, desc]) => (
                <div key={id} style={{ border: "0.5px solid #e4e2db", borderRadius: 8, padding: "8px 9px", background: "#fff" }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 10.5, color: "#666", marginBottom: 7 }}>{desc}</div>
                  <button type="button" onClick={() => applyPlaybook(id)} style={{ border: "0.5px solid #d0cec8", borderRadius: 6, background: "#f8f7f4", padding: "4px 8px", fontSize: 10.5 }}>
                    Apply playbook
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {codeUtilityTab === "risk" ? (
          <div style={{ padding: "10px", fontSize: 11, color: "#444", lineHeight: 1.55, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ background: "#F5F2ED", border: "1px solid #E2DDD6", borderRadius: 8, padding: "8px 10px" }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#AAA49C", marginBottom: 4, display: "block" }}>
                Simulation account size (fixed for all users)
              </span>
              <p style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.3px", color: "#18160F", margin: 0 }}>
                ${plannerCapital.toLocaleString()}
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                ["Risk per trade (%)", plannerRiskPct, setPlannerRiskPct, false],
                ["Stop distance (%)", plannerStopPct, setPlannerStopPct, false],
                ["Take profit (%)", plannerTakeProfitPct, setPlannerTakeProfitPct, true],
              ].map(([label, value, setter, full]) => (
                <label
                  key={label}
                  style={{ display: "flex", flexDirection: "column", gridColumn: full ? "1 / -1" : "auto" }}
                >
                  <span style={{ fontSize: 11, fontWeight: 500, color: "#7A7268", marginBottom: 4, display: "block" }}>{label}</span>
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => setter(Number(e.target.value || 0))}
                    style={{
                      background: "#FFFFFF",
                      border: "1.5px solid #E2DDD6",
                      borderRadius: 8,
                      padding: "7px 10px",
                      fontSize: 13,
                      fontWeight: 500,
                      fontFamily: "inherit",
                      color: "#18160F",
                      width: "100%",
                      appearance: "none",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#C89030";
                      e.currentTarget.style.outline = "none";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(200,144,48,0.1)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#E2DDD6";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </label>
              ))}
            </div>

            <div style={{ height: 1, background: "#E2DDD6", margin: "2px 0" }} />

            <div style={{ background: "#F5F2ED", border: "1px solid #E2DDD6", borderRadius: 8, overflow: "hidden", boxShadow: "inset 3px 0 0 #5A8C2E" }}>
              {[
                ["Risk amount", `$${plannerRiskAmount.toFixed(2)}`],
                ["Suggested position size", `$${plannerPositionSize.toFixed(2)}`],
                ["Risk/Reward", `1 : ${plannerRr.toFixed(2)}`],
              ].map(([label, value], idx, arr) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "7px 10px",
                    borderBottom: idx === arr.length - 1 ? "none" : "1px solid #EEEBE6",
                  }}
                >
                  <span style={{ fontSize: 12, color: "#7A7268" }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#18160F" }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: plannerRr >= 1.5 ? "#5A8C2E" : "#C04040", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: plannerRr >= 1.5 ? "#5A8C2E" : "#C04040", fontWeight: 500 }}>
                {plannerRr >= 1.5 ? "RR looks healthy for many systems." : "Consider raising target or tightening stop to improve RR."}
              </span>
            </div>
          </div>
        ) : null}
      </div>
        </div>
      </div>
    </section>
  );

  const sidebar = (
    <aside style={{ width: 200, paddingRight: 16, paddingTop: 4, maxHeight: "calc(100vh - 180px)", overflowY: "auto", overflowX: "hidden" }}>
      {[
        {
          title: "Indicators",
          accent: "#185FA5",
          groups: [
            { label: "Line", kind: "indicator", items: INDICATORS.filter((i) => i.type === "line") },
            { label: "Oscillator", kind: "indicator", items: INDICATORS.filter((i) => i.type === "oscillator") },
            { label: "Band", kind: "indicator", items: INDICATORS.filter((i) => i.type === "band") },
          ],
        },
        { title: "Conditions", accent: "#534AB7", groups: [{ label: "", kind: "condition", items: CONDITIONS }] },
        { title: "Actions", accent: "#639922", groups: [{ label: "", kind: "action", items: ACTIONS }] },
        { title: "Risk", accent: "#EF9F27", groups: [{ label: "", kind: "risk", items: RISKS }] },
      ].map((section, sectionIdx) => (
        <div key={section.title} style={{ marginTop: sectionIdx === 0 ? 0 : 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <span style={{ width: 3, height: 14, borderRadius: 2, background: section.accent, flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: "#666", letterSpacing: "0.07em", textTransform: "uppercase" }}>{section.title}</span>
          </div>
          {section.groups.map((group) => (
            <div key={`${section.title}-${group.label || "default"}`}>
              {group.label ? (
                <div style={{ fontSize: 9, fontWeight: 600, color: "#aaa", letterSpacing: "0.06em", textTransform: "uppercase", margin: "8px 0 5px 4px" }}>
                  {group.label}
                </div>
              ) : null}
              {group.items.map((item) => {
                const key = item.kind || item.id;
                const active = detailKey === key;
                const hovered = hoveredSidebarKey === key;
                const dragging = draggingSidebarKey === key;
                const hoverHint = item.what || GLOSSARY[key]?.what || "Open glossary for block details.";
                const payload =
                  group.kind === "condition" && item.id === "two_indicators_cross"
                    ? {
                        kind: "condition",
                        value: "two_indicators_cross",
                        presetFirstKind: paletteTwoCross.first,
                        presetSecondKind: paletteTwoCross.second,
                      }
                    : group.kind === "condition" && item.id === "inside_band"
                      ? {
                          kind: "condition",
                          value: "inside_band",
                          presetBandKind: paletteInsideBand.kind,
                          presetParams: { period: Number(paletteInsideBand.period) || 20 },
                        }
                      : { kind: group.kind, value: key };

                const badge =
                  group.kind === "indicator"
                    ? BADGE[item.type]
                    : group.kind === "action"
                      ? BADGE[item.side]
                      : group.kind === "risk"
                        ? BADGE.risk
                        : item.id === "two_indicators_cross" || item.id === "inside_band"
                          ? BADGE.condition
                          : null;

                return (
                  <div
                    key={key}
                    draggable
                    onDragStart={(e) => {
                      setDraggingSidebarKey(key);
                      beginSidebarDrag(e, payload);
                    }}
                    onDragEnd={() => {
                      setDraggingSidebarKey(null);
                      endSidebarDrag();
                    }}
                    onClick={() => {
                      if (isDraggingRef.current) return;
                      openGlossary(key);
                    }}
                    onMouseEnter={() => onSidebarHover(key, hoverHint)}
                    onMouseLeave={clearSidebarHover}
                    style={{
                      background: active ? "#f8f7f4" : hovered ? "#fafaf8" : "#fff",
                      border: active ? "0.5px solid #111" : hovered ? "0.5px solid #aaa" : "0.5px solid #e4e2db",
                      borderRadius: 8,
                      padding: "7px 10px",
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      position: "relative",
                      cursor: "grab",
                      opacity: dragging ? 0.5 : 1,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", color: "#222", fontSize: 12, fontWeight: 500 }}>
                      <span style={{ fontSize: 9, color: "#ccc", marginRight: 5 }}>⠿</span>
                      {item.label || item.kind}
                    </span>
                    {badge ? (
                      <span style={{ fontSize: 9, borderRadius: 20, border: `0.5px solid ${badge.border}`, background: badge.bg, color: badge.text, padding: "2px 7px", fontWeight: 500 }}>
                        {badge.label}
                      </span>
                    ) : null}
                    {tooltip.key === key ? <div style={{ position: "absolute", left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)", background: "#1a1a1a", color: "#fff", fontSize: 10, borderRadius: 6, padding: 8, maxWidth: 200, zIndex: 30 }}>{tooltip.text}</div> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </aside>
  );

  const glossaryOverlay = (
    <aside
      style={{
        width: 300,
        position: "absolute",
        top: 0,
        right: 0,
        height: "100%",
        background: "#fff",
        borderLeft: "0.5px solid #e0ded8",
        padding: "20px 18px",
        overflowY: "auto",
        zIndex: 20,
        boxShadow: "-4px 0 12px rgba(0,0,0,0.04)",
        transform: glossaryOpen && !closingGlossary ? "translate3d(0,0,0)" : "translate3d(100%,0,0)",
        opacity: glossaryOpen && !closingGlossary ? 1 : 0,
        transition: `transform ${closingGlossary ? 150 : 200}ms ease-${closingGlossary ? "in" : "out"}, opacity ${closingGlossary ? 150 : 200}ms ease-${closingGlossary ? "in" : "out"}`,
        pointerEvents: glossaryOpen ? "auto" : "none",
      }}
    >
      {blockMeta ? (
        <>
          <div style={{ display: "flex", alignItems: "center", paddingBottom: 10, borderBottom: "0.5px solid #e0ded8", marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: blockMeta.source === "indicator" ? BADGE[INDICATORS.find((x) => x.kind === blockMeta.key)?.type || "line"].bg : blockMeta.source === "action" ? BADGE[actionSide(blockMeta.key)].bg : blockMeta.source === "risk" ? BADGE.risk.bg : "#EEEDFE", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600 }}>
              {blockMeta.title.slice(0, 3).toUpperCase()}
            </div>
            <div style={{ marginLeft: 8, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{blockMeta.title}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{blockMeta.subtitle}</div>
            </div>
            <button type="button" onClick={() => openGlossary(blockMeta.key)} style={{ border: 0, background: "transparent", fontSize: 18, color: "#777", cursor: "pointer" }}>×</button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#999", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>What it is</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.55 }}>{glossaryMeta?.what}</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#999", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>What it does</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.55 }}>{glossaryMeta?.does}</div>
            <div style={{ marginTop: 8, borderRadius: 7, background: "#faf9f6", padding: "8px 10px" }}>
              <div style={{ fontSize: 10, fontWeight: 500 }}>When to use it</div>
              <div style={{ marginTop: 4, fontSize: 10.5, color: "#666" }}>{glossaryMeta?.use}</div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#999", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Compatible conditions</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CONDITIONS.map((c) => {
                const ok = blockMeta.source !== "indicator" ? true : compat(INDICATORS.find((i) => i.kind === blockMeta.key)?.type, c.id);
                return <span key={c.id} style={{ fontSize: 10, borderRadius: 20, padding: "2px 7px", border: `0.5px solid ${ok ? "#97C459" : "#d3d1c7"}`, background: ok ? "#eaf3de" : "#f1efe8", color: ok ? "#27500a" : "#999", textDecoration: ok ? "none" : "line-through" }}>{c.label}</span>;
              })}
            </div>
            <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 4 }}>
              {(glossaryMeta?.supported || []).map((line, idx) => (
                <div key={`${blockMeta.key}-supported-${idx}`} style={{ fontSize: 10.5, color: "#666" }}>- {line}</div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#999", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Graphic example</div>
            <div style={{ height: 80, borderRadius: 7, background: "#faf9f6", padding: 6 }}>
              {renderGlossaryGraphic()}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#999", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Example rules</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(glossaryMeta?.examples || []).map((example, idx) => (
                <div key={`${blockMeta.key}-example-${idx}`} style={{ borderRadius: 7, background: idx === 0 ? "#eaf3de" : "#f7f6f2", color: idx === 0 ? "#27500a" : "#444", padding: "7px 10px", fontSize: 11.5 }}>
                  {example}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </aside>
  );

  useImperativeHandle(ref, () => ({
    getBuilderMode: () => "unified",
    getRules: () => JSON.parse(JSON.stringify(rules)),
    getSimpleRules: () => JSON.parse(JSON.stringify(rules)),
    getAdvancedRules: () => JSON.parse(JSON.stringify(rules)),
    importSimpleRules: (next) => Array.isArray(next) && setRules(next),
    importAdvancedRules: (next) => Array.isArray(next) && setRules(next),
    applyTemplate: (key) => {
      if (key === "rsi") {
        const e = mkRule("entry");
        e.conditions = [{ ...mkRow(), indicator: mkIndicator("RSI"), condition: "crosses_above", value: 30, secondIndicator: null }];
        e.action = { kind: "buy_all_cash", params: {} };
        const x = mkRule("exit");
        x.conditions = [{ ...mkRow(), indicator: mkIndicator("RSI"), condition: "crosses_above", value: 70, secondIndicator: null }];
        x.action = { kind: "sell_entire_position", params: {} };
        setRules([e, x]);
      } else {
        setRules([mkRule("entry"), mkRule("exit")]);
      }
      setCustomCode(false);
      setVisualLocked(false);
    },
    markCodeDirty: () => setCustomCode(true),
  }), [rules, setCode, pythonFromVisual]);

  const body = (
    <div style={{ position: "relative", background: TOKENS.pageBg, borderRadius: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr", gap: 0, minWidth: 0 }}>
        {sidebar}
        {workspaceCol}
        {codeCol}
      </div>
      {glossaryOverlay}
      {dropTip ? (
        <div role="status" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 100, background: "#1a1a1a", color: "#fff", padding: "10px 14px", borderRadius: 8, fontSize: 12, maxWidth: 380, boxShadow: "0 4px 24px rgba(0,0,0,0.15)", lineHeight: 1.45 }}>
          {dropTip}
        </div>
      ) : null}
    </div>
  );

  if (typeof renderLayout === "function") return renderLayout({ mode: "visual", modeTabs: null, palette: null, panel: body });
  return body;
}

function actionSide(kind) {
  return kind.startsWith("buy") ? "buy" : "sell";
}

export default forwardRef(StrategyBuilder);
