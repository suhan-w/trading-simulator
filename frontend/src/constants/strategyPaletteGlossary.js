/**
 * Block palette glossary: order matches StrategyBuilder PALETTE top-to-bottom.
 * @typedef {{ categoryLabel: string; title: string; whatItIs: string; howItWorks: string; whenToUse: string; signals: string[]; usedInTemplates: string[] }} GlossaryEntry
 */

const CATEGORY_DOT = {
  data: "#c8963e",
  indicator: "#4a90d9",
  condition: "#7b68ee",
  action: "#2d8a55",
  risk: "#c0392b",
};

const TYPE_CAT = {
  select_stock: "data",
  select_date_range: "data",
  select_data: "data",
  sma: "indicator",
  ema: "indicator",
  rsi: "indicator",
  bollinger: "indicator",
  macd: "indicator",
  volume: "indicator",
  if_gt: "condition",
  if_lt: "condition",
  if_cross_above: "condition",
  if_cross_below: "condition",
  if_two_indicators_cross: "condition",
  buy: "action",
  sell: "action",
  hold: "action",
  stop_loss: "risk",
  take_profit: "risk",
  max_position: "risk",
};

/** @param {string} type */
export function glossaryCategoryDot(type) {
  const c = TYPE_CAT[type];
  return (c && CATEGORY_DOT[c]) || "#888888";
}

/** @type {string[]} */
export const GLOSSARY_BLOCK_ORDER = [
  "select_data",
  "sma",
  "ema",
  "rsi",
  "bollinger",
  "macd",
  "volume",
  "if_gt",
  "if_lt",
  "if_cross_above",
  "if_cross_below",
  "if_two_indicators_cross",
  "buy",
  "sell",
  "hold",
  "stop_loss",
  "take_profit",
  "max_position",
];

/** @type {Record<string, GlossaryEntry>} */
export const GLOSSARY_ENTRIES = {
  sma: {
    categoryLabel: "Indicator",
    title: "SMA (Simple Moving Average)",
    whatItIs:
      "Calculates the average price over a set number of days. Smooths out short term noise to reveal the trend direction.",
    howItWorks: "Sum of closing prices over N days divided by N.",
    whenToUse: "Identifying trend direction and crossover signals.",
    signals: [
      "Price above SMA = uptrend",
      "Price below SMA = downtrend",
      "Short SMA crossing above long SMA = buy signal",
    ],
    usedInTemplates: ["Moving Average Crossover"],
  },
  ema: {
    categoryLabel: "Indicator",
    title: "EMA (Exponential Moving Average)",
    whatItIs:
      "Similar to SMA but gives more weight to recent prices making it more responsive to new information.",
    howItWorks: "Each day's value gives more importance to recent prices using a multiplier.",
    whenToUse: "When you want faster signals than SMA.",
    signals: [
      "Same crossover logic as SMA but reacts faster to price changes",
      "Price above EMA suggests upward bias; below suggests downward bias",
    ],
    usedInTemplates: [],
  },
  rsi: {
    categoryLabel: "Indicator",
    title: "RSI (Relative Strength Index)",
    whatItIs:
      "Measures how fast and how much prices are moving to identify overbought or oversold conditions. Ranges from 0 to 100.",
    howItWorks: "Compares average gains to average losses over N periods.",
    whenToUse: "Identifying reversal points when a stock has moved too far too fast.",
    signals: [
      "Below 30 = oversold, potential buy",
      "Above 70 = overbought, potential sell",
      "50 = neutral",
    ],
    usedInTemplates: ["RSI Overbought/Oversold"],
  },
  bollinger: {
    categoryLabel: "Indicator",
    title: "Bollinger Bands",
    whatItIs:
      "Three lines plotted around price — a middle SMA and two outer bands showing volatility.",
    howItWorks: "Upper and lower bands are 2 standard deviations above and below the middle SMA.",
    whenToUse: "Identifying breakouts and periods of high or low volatility.",
    signals: [
      "Price touching upper band = potentially overbought",
      "Price touching lower band = potentially oversold",
      "Bands squeezing = low volatility, breakout often coming",
    ],
    usedInTemplates: [],
  },
  macd: {
    categoryLabel: "Indicator",
    title: "MACD (Moving Average Convergence Divergence)",
    whatItIs:
      "Shows the relationship between two EMAs to identify momentum changes and trend reversals.",
    howItWorks: "Subtracts the 26-day EMA from the 12-day EMA. A 9-day signal line is then plotted on top.",
    whenToUse: "Identifying momentum shifts and potential trend reversals.",
    signals: [
      "MACD crossing above signal line = bullish",
      "MACD crossing below signal line = bearish",
      "MACD above zero = upward momentum",
    ],
    usedInTemplates: [],
  },
  volume: {
    categoryLabel: "Indicator",
    title: "Volume",
    whatItIs:
      "The number of shares traded in a given period. Confirms whether a price move has conviction behind it.",
    howItWorks: "Simply counts total shares traded each day.",
    whenToUse: "Confirming strength of price moves.",
    signals: [
      "High volume on an up day = strong buying interest",
      "High volume on a down day = strong selling pressure",
      "Low volume move = less reliable signal",
    ],
    usedInTemplates: [],
  },
  select_data: {
    categoryLabel: "Data",
    title: "Stock & date range",
    whatItIs:
      "Chooses which ticker to load and the calendar window for historical prices in one block. You can type the symbol and dates directly.",
    howItWorks:
      "Ticker and dates are stored on the block and appear in generated code comments; the Backtesting page still loads OHLCV for that symbol and range into data[\"price\"].",
    whenToUse: "Start every visual strategy here — same role as the old separate stock and date blocks, combined.",
    signals: [
      "Use Yahoo-format tickers with .AX for Australian listings",
      "Shorter ranges = fewer bars; wider ranges = more history",
    ],
    usedInTemplates: ["Moving Average Crossover", "RSI Overbought/Oversold", "Buy and Hold"],
  },
  select_stock: {
    categoryLabel: "Data",
    title: "Select Stock",
    whatItIs:
      "Tells the backtest which single ASX ticker to load. The chart, metrics, and strategy code all use this symbol’s price history.",
    howItWorks: "The app passes your chosen ticker (e.g. CBA.AX) to the server; your run(data) receives that stock’s OHLCV in data[\"price\"].",
    whenToUse: "Always start a strategy by choosing the stock you want to test.",
    signals: [
      "Use Yahoo-format tickers with .AX for Australian listings",
      "Changing ticker re-runs the same logic on a different name",
    ],
    usedInTemplates: [],
  },
  select_date_range: {
    categoryLabel: "Data",
    title: "Date range",
    whatItIs:
      "Sets the calendar window for historical prices used in the backtest. Shorter windows react faster; longer ones show more regimes.",
    howItWorks: "Start and end dates filter the price series before your strategy’s run(data) executes.",
    whenToUse: "Whenever you want to stress-test a rule over a specific period (e.g. last two years).",
    signals: [
      "Narrow range = fewer bars, faster runs",
      "Wide range = more trades possible, more compute",
    ],
    usedInTemplates: [],
  },
  if_gt: {
    categoryLabel: "Condition",
    title: "IF greater than",
    whatItIs:
      "A rule block that fires when your chosen series moves down through a threshold from above — useful for exiting overbought-type setups in the linear builder.",
    howItWorks: "Each bar after the first, compares the indicator at i and i−1 to your threshold using the builder’s crossing logic.",
    whenToUse: "Pair with an indicator block above it, then a Sell or Buy block below.",
    signals: [
      "Typically used after RSI or similar with a high threshold",
      "Must follow at least one indicator on the canvas",
    ],
    usedInTemplates: ["RSI Overbought/Oversold"],
  },
  if_lt: {
    categoryLabel: "Condition",
    title: "IF less than",
    whatItIs:
      "Fires when the indicator rises up through your threshold from below — classic “leave oversold” pattern for entries.",
    howItWorks: "Uses the last indicator on the canvas and compares consecutive values to the threshold.",
    whenToUse: "After RSI, SMA, or any single series you want to compare to a constant.",
    signals: [
      "Often paired with “Buy” for oversold bounce ideas",
      "Threshold is set on the block (e.g. 30 for RSI)",
    ],
    usedInTemplates: ["RSI Overbought/Oversold"],
  },
  if_cross_above: {
    categoryLabel: "Condition",
    title: "IF crosses above",
    whatItIs:
      "Triggers when the first of two indicators directly above crosses above the second — a classic bullish timing signal.",
    howItWorks: "Requires two indicator blocks immediately above on the canvas; compares values at i and i−1.",
    whenToUse: "Moving-average crossovers, MACD line vs signal when exposed as two series, etc.",
    signals: [
      "First series crosses from at or below to above the second = condition true",
      "Often followed by a Buy block",
    ],
    usedInTemplates: ["Moving Average Crossover"],
  },
  if_cross_below: {
    categoryLabel: "Condition",
    title: "IF crosses below",
    whatItIs:
      "The mirror of crosses above: the first series crosses below the second — often used for exits.",
    howItWorks: "Same two-series logic as crosses above with inverted inequality.",
    whenToUse: "Trend exits, MA death crosses, paired with Sell.",
    signals: [
      "Bearish crossover on the bar where the condition fires",
      "Follow with Sell in template-style strategies",
    ],
    usedInTemplates: ["Moving Average Crossover"],
  },
  if_two_indicators_cross: {
    categoryLabel: "Condition",
    title: "IF two indicators cross",
    whatItIs:
      "Equivalent crossing semantics to “crosses above” for the two indicators placed above — useful when naming the rule that way reads clearer.",
    howItWorks: "Uses the last two indicator series on the stack in order.",
    whenToUse: "Any strategy where you explicitly want a two-line cross entry.",
    signals: ["First indicator crosses above the second", "Requires two indicators above on the canvas"],
    usedInTemplates: [],
  },
  buy: {
    categoryLabel: "Action",
    title: "Buy",
    whatItIs:
      "Places paper long exposure when the preceding condition is true (or buys once at bar zero if there is no IF above).",
    howItWorks: "Uses your size mode: all cash, fixed AUD, or percentage of cash; optional max-position cap from risk blocks.",
    whenToUse: "Entries after RSI, MA cross, or opening buy-and-hold.",
    signals: [
      "After an IF block: buys when that condition fires",
      "Without IF: used for initial full-invested buy in buy-and-hold style layouts",
    ],
    usedInTemplates: ["Moving Average Crossover", "RSI Overbought/Oversold", "Buy and Hold"],
  },
  sell: {
    categoryLabel: "Action",
    title: "Sell",
    whatItIs:
      "Reduces or exits the long position when the preceding condition is true — must be paired with an IF in the linear builder.",
    howItWorks:
      "Choose Sell all, a fixed AUD amount raised from the sale (capped at position value), or a percentage of current position value. Proceeds add to cash.",
    whenToUse: "Exits or trims after signals; partial sells keep remaining shares until you sell again.",
    signals: ["Must follow a condition block", "Sell all closes the position; fixed/% trim partially"],
    usedInTemplates: ["Moving Average Crossover", "RSI Overbought/Oversold"],
  },
  hold: {
    categoryLabel: "Action",
    title: "Hold",
    whatItIs:
      "A no-op marker: it does not place trades. Useful in templates to show “stay invested” after an opening buy.",
    howItWorks: "The compiler ignores hold for signal generation; it is documentation for the canvas flow.",
    whenToUse: "Buy-and-hold style example after an initial Buy.",
    signals: ["Does not change position or cash", "Keeps the story of the strategy readable on the canvas"],
    usedInTemplates: ["Buy and Hold"],
  },
  stop_loss: {
    categoryLabel: "Risk",
    title: "Stop loss",
    whatItIs:
      "After each bar’s signals, if you are long and price falls N% below the entry price, the backtest forces a sell.",
    howItWorks: "Tracks last entry price; compares close to entry × (1 − pct/100).",
    whenToUse: "Cap downside on any layout that includes risk blocks.",
    signals: ["Tighter % = closer stop, more whipsaw risk", "Applies after rule-based buys each bar"],
    usedInTemplates: [],
  },
  take_profit: {
    categoryLabel: "Risk",
    title: "Take profit",
    whatItIs:
      "Locks in gains by selling when price rises N% above the entry price, evaluated each bar after your rules.",
    howItWorks: "Same entry tracking as stop loss; triggers when close ≥ entry × (1 + pct/100).",
    whenToUse: "Mean-reversion or swing ideas where you want a fixed profit objective.",
    signals: ["Lower % = earlier exit", "Multiple blocks use the tightest threshold"],
    usedInTemplates: [],
  },
  max_position: {
    categoryLabel: "Risk",
    title: "Max position size",
    whatItIs:
      "Caps how much of portfolio value can go into a new buy — reduces concentration in one name.",
    howItWorks: "On each buy, spend is limited to the configured % of mark-to-market equity.",
    whenToUse: "Whenever you want smaller test sizes than “all in”.",
    signals: ["Smaller % = smaller positions", "Combines with Buy modes (all cash / fixed / %)"],
    usedInTemplates: [],
  },
};
