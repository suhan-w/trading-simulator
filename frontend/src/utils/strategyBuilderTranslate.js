/**
 * Linear visual strategy → sandboxed run(data) Python (Plan 1 compiler).
 * data["price"] is injected; ticker/range are from the backtest form (comments only).
 */

/** @typedef {{ id: string, type: string, params?: Record<string, unknown>}} VisualBlock */

const DATA_TYPES = new Set(["select_stock", "select_date_range", "select_data"]);
const INDICATOR_TYPES = new Set(["sma", "ema", "rsi", "bollinger", "macd", "volume"]);
const CONDITION_TYPES = new Set(["if_gt", "if_lt", "if_cross_above", "if_cross_below", "if_two_indicators_cross"]);
const RISK_TYPES = new Set(["stop_loss", "take_profit", "max_position"]);

/** User-facing names (match Strategy palette where possible). */
const BLOCK_LABELS = {
  select_stock: "Select stock",
  select_date_range: "Select date range",
  select_data: "Select data",
  sma: "SMA",
  ema: "EMA",
  rsi: "RSI",
  bollinger: "Bollinger",
  macd: "MACD",
  volume: "Volume",
  if_gt: "IF greater than",
  if_lt: "IF less than",
  if_cross_above: "IF crosses above",
  if_cross_below: "IF crosses below",
  if_two_indicators_cross: "IF two indicators cross",
  buy: "Buy",
  sell: "Sell",
  hold: "Hold",
  stop_loss: "Stop loss",
  take_profit: "Take profit",
  max_position: "Max position",
};

function blockLabel(type) {
  return BLOCK_LABELS[type] || type;
}

function num(b, key, fallback) {
  const v = Number(b?.params?.[key]);
  return Number.isFinite(v) ? v : fallback;
}

/** @param {VisualBlock[]} blocks */
function stripLeadingData(blocks) {
  const out = [...blocks];
  while (out.length && DATA_TYPES.has(out[0].type)) {
    out.shift();
  }
  return out;
}

function emitBuyLines(mode, fixed, pct, indent) {
  const sp = indent;
  if (mode === "fixed") {
    return `${sp}q = min(${fixed}, cash) / pr\n${sp}shares = q\n${sp}cash -= q * pr`;
  }
  if (mode === "pct") {
    return `${sp}spend = cash * (${pct} / 100.0)\n${sp}shares = spend / pr\n${sp}cash -= spend`;
  }
  return `${sp}shares = cash / pr\n${sp}cash = 0.0`;
}

/**
 * Linear semantics: each IF references indicator block ids (dropdowns); indicators emit series in program order;
 * IF must be immediately followed by Buy/Sell; Buy without a preceding IF buys once at bar 0; risk blocks apply every bar after signals.
 *
 * @param {VisualBlock[]} program
 * @param {string[]} errors
 * @returns {{ setup: string[]; rules: RuleRow[]; bar0Buys: VisualBlock[]; risks: VisualBlock[] }}
 */
/** @typedef {{ when: string; side: "buy" | "sell"; buyMode?: string; buyFixed?: number; buyPct?: number; sellMode?: string; sellFixed?: number; sellPct?: number }} RuleRow */
function parseLinearProgram(program, errors) {
  /** @type {string[]} */
  const setup = [];
  /** Block id → pandas series variable name emitted in setup (MACD uses its line series). */
  /** @type {Map<string, string>} */
  const indicatorSeriesByBlockId = new Map();
  /** @type {RuleRow[]} */
  const rules = [];
  /** @type {VisualBlock[]} */
  const bar0Buys = [];
  /** @type {VisualBlock[]} */
  const risks = [];

  let ix = 0;
  const nextName = (prefix) => `${prefix}_${ix++}`;

  /** @type {null | { ok: true; expr: string } | { ok: false }} */
  let pendingWhen = null;

  const pushIndicator = (b) => {
    const t = b.type;
    if (t === "sma") {
      const p = Math.max(1, Math.round(num(b, "period", 20)));
      const v = nextName("sma");
      setup.push(`    ${v} = c.rolling(${p}).mean()`);
      indicatorSeriesByBlockId.set(b.id, v);
      return;
    }
    if (t === "ema") {
      const p = Math.max(1, Math.round(num(b, "period", 12)));
      const v = nextName("ema");
      setup.push(`    ${v} = c.ewm(span=${p}, adjust=False).mean()`);
      indicatorSeriesByBlockId.set(b.id, v);
      return;
    }
    if (t === "rsi") {
      const p = Math.max(2, Math.round(num(b, "period", 14)));
      const v = nextName("rsi");
      setup.push(`    ${v}_delta = c.diff()`);
      setup.push(`    ${v}_gain = ${v}_delta.clip(lower=0.0)`);
      setup.push(`    ${v}_loss = (-${v}_delta).clip(lower=0.0)`);
      setup.push(`    ${v}_avg_g = ${v}_gain.rolling(${p}).mean()`);
      setup.push(`    ${v}_avg_l = ${v}_loss.rolling(${p}).mean()`);
      setup.push(`    ${v}_rs = ${v}_avg_g / ${v}_avg_l.replace(0.0, 1e-12)`);
      setup.push(`    ${v} = 100.0 - (100.0 / (1.0 + ${v}_rs))`);
      indicatorSeriesByBlockId.set(b.id, v);
      return;
    }
    if (t === "bollinger") {
      const p = Math.max(2, Math.round(num(b, "period", 20)));
      const mid = nextName("bb_mid");
      const sd = nextName("bb_sd");
      const up = nextName("bb_up");
      const lo = nextName("bb_lo");
      setup.push(`    ${mid} = c.rolling(${p}).mean()`);
      setup.push(`    ${sd} = c.rolling(${p}).std()`);
      setup.push(`    ${up} = ${mid} + 2.0 * ${sd}`);
      setup.push(`    ${lo} = ${mid} - 2.0 * ${sd}`);
      indicatorSeriesByBlockId.set(b.id, mid);
      return;
    }
    if (t === "macd") {
      const fast = Math.max(1, Math.round(num(b, "fast", 12)));
      const slow = Math.max(1, Math.round(num(b, "slow", 26)));
      const signal = Math.max(1, Math.round(num(b, "signal", 9)));
      const ef = nextName("macd_ef");
      const es = nextName("macd_es");
      const line = nextName("macd_line");
      const sig = nextName("macd_sig");
      setup.push(`    ${ef} = c.ewm(span=${fast}, adjust=False).mean()`);
      setup.push(`    ${es} = c.ewm(span=${slow}, adjust=False).mean()`);
      setup.push(`    ${line} = ${ef} - ${es}`);
      setup.push(`    ${sig} = ${line}.ewm(span=${signal}, adjust=False).mean()`);
      indicatorSeriesByBlockId.set(b.id, line);
      return;
    }
    if (t === "volume") {
      const v = nextName("vol");
      const period = Math.max(1, Math.round(num(b, "period", 1)));
      setup.push(`    ${v} = df["Volume"].astype(float)`);
      if (period > 1) setup.push(`    ${v} = ${v}.rolling(${period}).mean()`);
      indicatorSeriesByBlockId.set(b.id, v);
      return;
    }
    errors.push(`This indicator type is not supported in the visual compiler: ${t}. Remove it or pick SMA, EMA, RSI, Bollinger, MACD, or Volume.`);
  };

  const buildCondition = (b) => {
    const t = b.type;
    const th = num(b, "threshold", 50);

    if (t === "if_gt" || t === "if_lt") {
      const idStr = b.params?.indicator != null ? String(b.params.indicator).trim() : "";
      const a = idStr ? indicatorSeriesByBlockId.get(idStr) : null;
      if (!a) {
        if (idStr) {
          errors.push(
            `${blockLabel(t)} references an indicator that is not in this strategy (or appears after this condition). Add the indicator in the Indicators lane and pick it from the dropdown.`
          );
        }
        return null;
      }
      if (t === "if_lt") {
        return `_ok2(${a}, i - 1) and _ok2(${a}, i) and float(${a}.iloc[i - 1]) < ${th} <= float(${a}.iloc[i])`;
      }
      return `_ok2(${a}, i - 1) and _ok2(${a}, i) and float(${a}.iloc[i - 1]) > ${th} >= float(${a}.iloc[i])`;
    }
    if (t === "if_cross_above" || t === "if_cross_below" || t === "if_two_indicators_cross") {
      const idA = b.params?.indicator_a != null ? String(b.params.indicator_a).trim() : "";
      const idB = b.params?.indicator_b != null ? String(b.params.indicator_b).trim() : "";
      const A = idA ? indicatorSeriesByBlockId.get(idA) : null;
      const B = idB ? indicatorSeriesByBlockId.get(idB) : null;
      if (!A || !B) {
        if (idA && idB) {
          errors.push(
            `${blockLabel(t)} references one or more indicators that are not in this strategy. Add both indicator blocks and pick them from the A and B dropdowns.`
          );
        }
        return null;
      }
      if (t === "if_cross_below") {
        return (
          `_ok2(${A}, i) and _ok2(${B}, i) and _ok2(${A}, i - 1) and _ok2(${B}, i - 1) and ` +
          `float(${A}.iloc[i]) < float(${B}.iloc[i]) and float(${A}.iloc[i - 1]) >= float(${B}.iloc[i - 1])`
        );
      }
      return (
        `_ok2(${A}, i) and _ok2(${B}, i) and _ok2(${A}, i - 1) and _ok2(${B}, i - 1) and ` +
        `float(${A}.iloc[i]) > float(${B}.iloc[i]) and float(${A}.iloc[i - 1]) <= float(${B}.iloc[i - 1])`
      );
    }
    return null;
  };

  for (let i = 0; i < program.length; i++) {
    const b = program[i];
    const t = b.type;

    // DATA blocks are allowed, but must be at the very top (before any indicators/conditions/actions).
    // They act as optional configuration hints; the Strategy page can still override via form inputs.
    // If users place them later, treat it as an ordering error.
    if (DATA_TYPES.has(t)) {
      const seenNonData = program.slice(0, i).some((x) => !DATA_TYPES.has(x.type));
      if (seenNonData) {
        errors.push(
          `${blockLabel(t)} must stay at the very top of the flow (before indicators, IFs, and trades). Move it above the other blocks or delete the extra copy lower down.`
        );
      }
      continue;
    }

    if (INDICATOR_TYPES.has(t)) {
      if (pendingWhen?.ok) {
        errors.push(
          "You still owe a trade under the previous IF. Put Buy, Sell, or Hold under that IF in the Actions lane before adding another indicator."
        );
      }
      pendingWhen = null;
      pushIndicator(b);
      continue;
    }

    if (CONDITION_TYPES.has(t)) {
      if (pendingWhen?.ok) {
        errors.push(
          "Two IF blocks are stacked without a trade between them. After each IF, add Buy, Sell, or Hold, then you can start the next IF."
        );
      }
      const w = buildCondition(b);
      pendingWhen = w ? { ok: true, expr: w } : { ok: false };
      continue;
    }

    if (t === "buy" || t === "sell") {
      if (pendingWhen?.ok) {
        if (t === "buy") {
          const rawMode = (b.params?.mode || "all_cash").toString();
          const mode = rawMode === "fixed" ? "fixed" : rawMode === "pct" ? "pct" : "all_cash";
          rules.push({
            when: pendingWhen.expr,
            side: "buy",
            buyMode: mode,
            buyFixed: num(b, "fixedAmount", 0.5),
            buyPct: num(b, "pctAmount", 100),
          });
        } else {
          const rawSell = (b.params?.mode || "all").toString();
          const sellMode = rawSell === "fixed" ? "fixed" : rawSell === "pct" ? "pct" : "all";
          rules.push({
            when: pendingWhen.expr,
            side: "sell",
            sellMode,
            sellFixed: num(b, "fixedAmount", 0.5),
            sellPct: num(b, "pctAmount", 100),
          });
        }
        pendingWhen = null;
      } else if (pendingWhen && !pendingWhen.ok) {
        errors.push(
          "This Buy or Sell follows an IF that could not be built (usually: pick the indicator(s) for that IF, or add the indicator blocks first). Fix the IF block, then try again."
        );
        pendingWhen = null;
      } else if (t === "buy") {
        bar0Buys.push(b);
      } else {
        errors.push(
          "Sell always needs an IF immediately above it (for example: IF crosses below, then Sell). Add that IF or use Buy for an entry-only rule."
        );
      }
      continue;
    }

    if (t === "hold") {
      if (pendingWhen?.ok) {
        errors.push(
          "Hold cannot sit directly under an IF. Use Buy or Sell when the condition fires, or place Hold between completed rules instead."
        );
      }
      pendingWhen = null;
      continue;
    }

    if (RISK_TYPES.has(t)) {
      if (pendingWhen?.ok) {
        errors.push(
          "Finish the active IF with Buy or Sell before adding stop loss, take profit, or max position."
        );
      }
      pendingWhen = null;
      risks.push(b);
      continue;
    }

    errors.push(`Unknown block: ${t}. Remove it or choose a block from the palette.`);
  }

  if (pendingWhen?.ok) {
    errors.push(
      "The strategy ends with an IF that has no Buy or Sell under it. Add Buy, Sell, or Hold below that last IF."
    );
  }

  return { setup, rules, bar0Buys, risks };
}

function emitRunBody(ticker, start, end, parsed) {
  const { setup, rules, bar0Buys, risks } = parsed;

  const stopPcts = risks.filter((r) => r.type === "stop_loss").map((r) => num(r, "pct", 5));
  const tpPcts = risks.filter((r) => r.type === "take_profit").map((r) => num(r, "pct", 10));
  const maxPosPcts = risks.filter((r) => r.type === "max_position").map((r) => num(r, "pct", 25));

  const stopF = stopPcts.length ? Math.min(...stopPcts.map((p) => Math.max(0.01, p))) / 100 : null;
  const tpF = tpPcts.length ? Math.min(...tpPcts.map((p) => Math.max(0.01, p))) / 100 : null;
  const maxPosF = maxPosPcts.length ? Math.min(...maxPosPcts.map((p) => Math.max(0.01, p))) / 100 : null;

  const lines = [];
  lines.push(`def run(data):`);
  lines.push(`    # Visual builder (linear compiler) — ${ticker}, ${start} → ${end} from form`);
  lines.push(`    def _ok2(series, j):`);
  lines.push(`        try:`);
  lines.push(`            x = float(series.iloc[j])`);
  lines.push(`            return x == x`);
  lines.push(`        except Exception:`);
  lines.push(`            return False`);
  lines.push(`    df = data["price"].copy()`);
  lines.push(`    c = df["Close"].astype(float)`);
  if (setup.length) {
    lines.push(...setup);
  }
  lines.push(`    cash = 1.0`);
  lines.push(`    shares = 0.0`);
  lines.push(`    equity = []`);
  lines.push(`    trades = []`);
  lines.push(`    entry_px = None`);
  if (stopF != null) lines.push(`    _stop_thr = ${stopF}`);
  if (tpF != null) lines.push(`    _tp_thr = ${tpF}`);
  if (maxPosF != null) lines.push(`    _max_pos = ${maxPosF}`);
  lines.push(`    for i in range(len(c)):`);
  lines.push(`        pr = float(c.iloc[i])`);
  lines.push(`        equity.append(cash + shares * pr)`);

  for (const bb of bar0Buys) {
    const rawMode = (bb.params?.mode || "all_cash").toString();
    const mode = rawMode === "fixed" ? "fixed" : rawMode === "pct" ? "pct" : "all_cash";
    const fixed = num(bb, "fixedAmount", 0.5);
    const pct = num(bb, "pctAmount", 100);
    const buyL = emitBuyLines(mode, fixed, pct, "            ");
    lines.push(`        if i == 0 and cash > 0:`);
    if (maxPosF != null) {
      lines.push(`            _port = cash + shares * pr`);
      lines.push(`            _cap = _port * _max_pos`);
      if (mode === "all_cash") {
        lines.push(`            _spend = min(cash, _cap)`);
        lines.push(`            shares = _spend / pr`);
        lines.push(`            cash -= _spend`);
      } else if (mode === "pct") {
        lines.push(`            _want = cash * (${pct} / 100.0)`);
        lines.push(`            _spend = min(_want, _cap, cash)`);
        lines.push(`            shares = _spend / pr`);
        lines.push(`            cash -= _spend`);
      } else {
        lines.push(`            _want = min(${fixed}, cash)`);
        lines.push(`            _spend = min(_want, _cap)`);
        lines.push(`            q = _spend / pr`);
        lines.push(`            shares = q`);
        lines.push(`            cash -= _spend`);
      }
    } else {
      lines.push(buyL);
    }
    lines.push(`            trades.append({"date": str(df.index[i])[:10], "side": "buy", "price": pr})`);
    lines.push(`            entry_px = pr`);
  }

  for (const r of rules) {
    lines.push(`        if i > 0 and (${r.when}):`);
    if (r.side === "buy") {
      const mode = r.buyMode || "all_cash";
      const fixed = r.buyFixed ?? 0.5;
      const pct = r.buyPct ?? 100;
      const buyL = emitBuyLines(mode, fixed, pct, "                ");
      lines.push(`            if shares == 0 and cash > 0:`);
      if (maxPosF != null) {
        lines.push(`                _port = cash + shares * pr`);
        lines.push(`                _cap = _port * _max_pos`);
        if (mode === "all_cash") {
          lines.push(`                _spend = min(cash, _cap)`);
          lines.push(`                shares = _spend / pr`);
          lines.push(`                cash -= _spend`);
        } else if (mode === "pct") {
          lines.push(`                _want = cash * (${pct} / 100.0)`);
          lines.push(`                _spend = min(_want, _cap, cash)`);
          lines.push(`                shares = _spend / pr`);
          lines.push(`                cash -= _spend`);
        } else {
          lines.push(`                _want = min(${fixed}, cash)`);
          lines.push(`                _spend = min(_want, _cap)`);
          lines.push(`                q = _spend / pr`);
          lines.push(`                shares = q`);
          lines.push(`                cash -= _spend`);
        }
      } else {
        lines.push(buyL);
      }
      lines.push(`                trades.append({"date": str(df.index[i])[:10], "side": "buy", "price": pr})`);
      lines.push(`                entry_px = pr`);
    } else {
      const sm = r.sellMode || "all";
      const sfx = r.sellFixed ?? 0.5;
      const spct = r.sellPct ?? 100;
      lines.push(`            if shares > 0:`);
      if (sm === "all") {
        lines.push(`                cash += shares * pr`);
        lines.push(`                trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})`);
        lines.push(`                shares = 0.0`);
        lines.push(`                entry_px = None`);
      } else if (sm === "fixed") {
        lines.push(`                _pv = shares * pr`);
        lines.push(`                _sv = min(${sfx}, _pv)`);
        lines.push(`                _q = _sv / pr`);
        lines.push(`                cash += _sv`);
        lines.push(`                shares -= _q`);
        lines.push(`                trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})`);
        lines.push(`                if shares <= 1e-12:`);
        lines.push(`                    shares = 0.0`);
        lines.push(`                    entry_px = None`);
      } else {
        lines.push(`                _pv = shares * pr`);
        lines.push(`                _sv = _pv * (${spct} / 100.0)`);
        lines.push(`                _q = _sv / pr`);
        lines.push(`                cash += _sv`);
        lines.push(`                shares -= _q`);
        lines.push(`                trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})`);
        lines.push(`                if shares <= 1e-12:`);
        lines.push(`                    shares = 0.0`);
        lines.push(`                    entry_px = None`);
      }
    }
  }

  if (stopF != null) {
    lines.push(`        if shares > 0 and entry_px is not None and pr <= entry_px * (1.0 - _stop_thr):`);
    lines.push(`            cash += shares * pr`);
    lines.push(`            trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})`);
    lines.push(`            shares = 0.0`);
    lines.push(`            entry_px = None`);
  }
  if (tpF != null) {
    lines.push(`        if shares > 0 and entry_px is not None and pr >= entry_px * (1.0 + _tp_thr):`);
    lines.push(`            cash += shares * pr`);
    lines.push(`            trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})`);
    lines.push(`            shares = 0.0`);
    lines.push(`            entry_px = None`);
  }

  lines.push(`    dates = [str(x)[:10] for x in df.index]`);
  lines.push(`    e0 = equity[0] if abs(equity[0]) > 1e-12 else 1.0`);
  lines.push(`    return {`);
  lines.push(`        "dates": dates,`);
  lines.push(`        "equity": [x / e0 for x in equity],`);
  lines.push(`        "trades": trades,`);
  lines.push(`        "close_prices": c.tolist(),`);
  lines.push(`    }`);

  return lines.join("\n");
}

function emitCompileErrorRaising(ticker, start, end, errorLines) {
  const pyList = `[${errorLines.map((e) => JSON.stringify(e)).join(", ")}]`;
  return `def run(data):
    raise ValueError("Strategy could not be compiled from visual blocks: " + str(${pyList}))
    # Form: ${ticker}, ${start} → ${end}
`;
}

function emitEmptyStrategy(ticker, start, end) {
  return `def run(data):
    # Visual builder — empty strategy (${ticker}, ${start} → ${end} from form)
    df = data["price"].copy()
    c = df["Close"].astype(float)
    cash = 1.0
    shares = 0.0
    equity = []
    trades = []
    for i in range(len(c)):
        pr = float(c.iloc[i])
        equity.append(cash + shares * pr)
    dates = [str(x)[:10] for x in df.index]
    e0 = equity[0] if abs(equity[0]) > 1e-12 else 1.0
    return {
        "dates": dates,
        "equity": [x / e0 for x in equity],
        "trades": trades,
        "close_prices": c.tolist(),
    }
`;
}

/**
 * @param {VisualBlock[]} blocks
 * @param {{ ticker: string; start: string; end: string }} ctx
 * @returns {{ code: string; errors: string[] }}
 */
/** @param {VisualBlock[]} blocks @param {{ ticker: string; start: string; end: string }} ctx */
function effectiveBacktestRange(blocks, ctx) {
  let effTicker = (ctx.ticker || "CBA.AX").trim();
  let effStart = ctx.start || "";
  let effEnd = ctx.end || "";

  const leading = [];
  for (const b of blocks) {
    if (!DATA_TYPES.has(b.type)) break;
    leading.push(b);
  }
  const combo = leading.find((b) => b.type === "select_data");
  if (combo?.params && typeof combo.params === "object") {
    const p = /** @type {Record<string, unknown>} */ (combo.params);
    const tk = p.ticker != null ? String(p.ticker).trim() : "";
    const st = p.start != null ? String(p.start).trim() : "";
    const en = p.end != null ? String(p.end).trim() : "";
    if (tk) effTicker = tk.toUpperCase();
    if (st) effStart = st.slice(0, 10);
    if (en) effEnd = en.slice(0, 10);
  }

  return { ticker: effTicker, start: effStart, end: effEnd };
}

export function translateVisualBlocksToPythonWithDiagnostics(blocks, { ticker, start, end }) {
  const { ticker: t, start: s, end: e } = effectiveBacktestRange(blocks, { ticker, start, end });

  /** @type {string[]} */
  const errors = [];

  const program = stripLeadingData(blocks);

  if (program.length === 0) {
    return { code: emitEmptyStrategy(t, s, e), errors: [] };
  }

  const needsTwoIndicators = new Set(["if_cross_above", "if_cross_below", "if_two_indicators_cross"]);
  for (const b of program) {
    if (!CONDITION_TYPES.has(b.type)) continue;
    const needsTwo = needsTwoIndicators.has(b.type);
    const pa = b.params && typeof b.params === "object" ? b.params : {};
    if (needsTwo) {
      const a = pa.indicator_a != null ? String(pa.indicator_a).trim() : "";
      const bee = pa.indicator_b != null ? String(pa.indicator_b).trim() : "";
      if (!a || !bee) {
        errors.push(`"${b.type.replace(/_/g, " ")}" needs both indicator A and B selected.`);
      }
    } else {
      const ind = pa.indicator != null ? String(pa.indicator).trim() : "";
      if (!ind) {
        errors.push(`"${b.type.replace(/_/g, " ")}" needs an indicator selected.`);
      }
    }
  }

  if (errors.length) {
    return { code: emitCompileErrorRaising(t, s, e, errors), errors };
  }

  const parsed = parseLinearProgram(program, errors);

  if (errors.length) {
    return { code: emitCompileErrorRaising(t, s, e, errors), errors };
  }

  const hasLogic =
    parsed.setup.length > 0 || parsed.rules.length > 0 || parsed.bar0Buys.length > 0 || parsed.risks.length > 0;
  if (!hasLogic) {
    errors.push(
      "Only data blocks are present. Add at least one indicator, one IF, and a Buy or Sell so the strategy can generate signals."
    );
    return { code: emitCompileErrorRaising(t, s, e, errors), errors };
  }

  return { code: emitRunBody(t, s, e, parsed), errors: [] };
}

/** @param {VisualBlock[]} blocks */
export function translateVisualBlocksToPython(blocks, ctx) {
  return translateVisualBlocksToPythonWithDiagnostics(blocks, ctx).code;
}

function normalizeRuleIndicator(ind) {
  const raw = String(ind || "").trim();
  if (!raw) return "RSI";
  if (raw.startsWith("RSI")) return "RSI";
  if (raw.startsWith("Stochastic")) return "Stochastic";
  if (raw.startsWith("SMA")) return "SMA";
  if (raw.startsWith("EMA")) return "EMA";
  if (raw.startsWith("MACD")) return "MACD";
  if (raw.startsWith("Bollinger")) return "Bollinger Bands";
  if (raw.startsWith("Keltner")) return "Keltner Channel";
  if (raw.startsWith("Price")) return "Price";
  if (raw.startsWith("Volume")) return "Volume";
  return raw;
}

function paramNum(cond, key, fallback, min = 1) {
  const raw = cond?.indParams?.[key];
  const v = Number(raw);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, v);
}

export function translateRulesToPython(simpleRules, advancedRules, builderMode, { ticker, start, end }) {
  const rules = builderMode === "simple" ? simpleRules : advancedRules;
  if (!Array.isArray(rules) || rules.length === 0) return "";

  const entryRules = rules.filter((r) => r?.type === "entry");
  const exitRules = rules.filter((r) => r?.type === "exit");
  const riskRules = rules.filter((r) => r?.type === "risk");

  const setupLines = [];
  const cache = new Map();
  let uid = 0;

  function registerIndicator(cond) {
    const ind = normalizeRuleIndicator(cond?.ind);
    if (ind === "Price") return { cur: "prices", prev: "prices_prev" };
    if (ind === "Volume") {
      const p = Math.round(paramNum(cond, "volumePeriod", 1, 1));
      if (p <= 1) return { cur: "volume", prev: "volume_prev" };
      const key = `vol:${p}`;
      if (!cache.has(key)) {
        const name = `vol_${p}_${uid++}`;
        setupLines.push(`    ${name} = v.rolling(${p}).mean()`);
        cache.set(key, name);
      }
      const name = cache.get(key);
      return { cur: `float(${name}.iloc[i])`, prev: `float(${name}.iloc[i - 1])` };
    }
    if (ind === "SMA") {
      const p = Math.round(paramNum(cond, "smaPeriod", 20, 1));
      const key = `sma:${p}`;
      if (!cache.has(key)) {
        const name = `sma_${p}_${uid++}`;
        setupLines.push(`    ${name} = c.rolling(${p}).mean()`);
        cache.set(key, name);
      }
      const name = cache.get(key);
      return { cur: `float(${name}.iloc[i])`, prev: `float(${name}.iloc[i - 1])` };
    }
    if (ind === "EMA") {
      const p = Math.round(paramNum(cond, "emaPeriod", 12, 1));
      const key = `ema:${p}`;
      if (!cache.has(key)) {
        const name = `ema_${p}_${uid++}`;
        setupLines.push(`    ${name} = c.ewm(span=${p}, adjust=False).mean()`);
        cache.set(key, name);
      }
      const name = cache.get(key);
      return { cur: `float(${name}.iloc[i])`, prev: `float(${name}.iloc[i - 1])` };
    }
    if (ind === "RSI") {
      const p = Math.round(paramNum(cond, "rsiPeriod", 14, 2));
      const key = `rsi:${p}`;
      if (!cache.has(key)) {
        const base = `rsi_${p}_${uid++}`;
        setupLines.push(`    ${base}_d = c.diff()`);
        setupLines.push(`    ${base}_g = ${base}_d.clip(lower=0.0)`);
        setupLines.push(`    ${base}_l = (-${base}_d).clip(lower=0.0)`);
        setupLines.push(`    ${base}_ag = ${base}_g.ewm(alpha=1.0 / ${p}.0, adjust=False).mean()`);
        setupLines.push(`    ${base}_al = ${base}_l.ewm(alpha=1.0 / ${p}.0, adjust=False).mean().replace(0.0, np.nan)`);
        setupLines.push(`    ${base} = (100.0 - (100.0 / (1.0 + (${base}_ag / ${base}_al)))).fillna(50.0)`);
        cache.set(key, base);
      }
      const name = cache.get(key);
      return { cur: `float(${name}.iloc[i])`, prev: `float(${name}.iloc[i - 1])` };
    }
    if (ind === "Stochastic") {
      const p = Math.round(paramNum(cond, "rsiPeriod", 14, 2));
      const key = `stoch:${p}`;
      if (!cache.has(key)) {
        const base = `stoch_${p}_${uid++}`;
        setupLines.push(`    ${base}_low = df["Low"].astype(float).rolling(${p}).min() if "Low" in df.columns else c.rolling(${p}).min()`);
        setupLines.push(`    ${base}_high = df["High"].astype(float).rolling(${p}).max() if "High" in df.columns else c.rolling(${p}).max()`);
        setupLines.push(`    ${base} = (100.0 * (c - ${base}_low) / (${base}_high - ${base}_low).replace(0.0, np.nan)).fillna(50.0)`);
        cache.set(key, base);
      }
      const name = cache.get(key);
      return { cur: `float(${name}.iloc[i])`, prev: `float(${name}.iloc[i - 1])` };
    }
    if (ind === "MACD") {
      const f = Math.round(paramNum(cond, "macdFast", 12, 1));
      const s = Math.round(paramNum(cond, "macdSlow", 26, 1));
      const g = Math.round(paramNum(cond, "macdSignal", 9, 1));
      const key = `macd:${f}:${s}:${g}`;
      if (!cache.has(key)) {
        const base = `macd_${f}_${s}_${g}_${uid++}`;
        setupLines.push(`    ${base}_f = c.ewm(span=${f}, adjust=False).mean()`);
        setupLines.push(`    ${base}_s = c.ewm(span=${s}, adjust=False).mean()`);
        setupLines.push(`    ${base} = ${base}_f - ${base}_s`);
        setupLines.push(`    ${base}_sig = ${base}.ewm(span=${g}, adjust=False).mean()`);
        cache.set(key, base);
      }
      const name = cache.get(key);
      return { cur: `float(${name}.iloc[i])`, prev: `float(${name}.iloc[i - 1])` };
    }
    if (ind === "Bollinger Bands") {
      const p = Math.round(paramNum(cond, "bbPeriod", 20, 2));
      const std = paramNum(cond, "bbStd", 2, 0.1);
      const key = `bb:${p}:${std}`;
      if (!cache.has(key)) {
        const base = `bb_${p}_${String(std).replace(".", "_")}_${uid++}`;
        setupLines.push(`    ${base}_mid = c.rolling(${p}).mean()`);
        setupLines.push(`    ${base}_std = c.rolling(${p}).std(ddof=0)`);
        setupLines.push(`    ${base}_upper = ${base}_mid + ${std} * ${base}_std`);
        setupLines.push(`    ${base}_lower = ${base}_mid - ${std} * ${base}_std`);
        cache.set(key, base);
      }
      const base = cache.get(key);
      const band = String(cond?.bandSelection || "upper").toLowerCase();
      const side = band === "lower" ? "lower" : band === "middle" ? "mid" : "upper";
      return { cur: `float(${base}_${side}.iloc[i])`, prev: `float(${base}_${side}.iloc[i - 1])` };
    }
    if (ind === "Keltner Channel") {
      const p = Math.round(paramNum(cond, "kcPeriod", 20, 2));
      const mult = paramNum(cond, "kcMultiplier", 1.5, 0.1);
      const key = `kc:${p}:${mult}`;
      if (!cache.has(key)) {
        const base = `kc_${p}_${String(mult).replace(".", "_")}_${uid++}`;
        setupLines.push(`    ${base}_ema = c.ewm(span=${p}, adjust=False).mean()`);
        setupLines.push(`    ${base}_tr_hl = (df["High"].astype(float) - df["Low"].astype(float)) if ("High" in df.columns and "Low" in df.columns) else c.diff().abs()`);
        setupLines.push(`    ${base}_atr = ${base}_tr_hl.rolling(${p}).mean()`);
        setupLines.push(`    ${base}_upper = ${base}_ema + ${mult} * ${base}_atr`);
        setupLines.push(`    ${base}_lower = ${base}_ema - ${mult} * ${base}_atr`);
        setupLines.push(`    ${base}_mid = ${base}_ema`);
        cache.set(key, base);
      }
      const base = cache.get(key);
      const band = String(cond?.bandSelection || "upper").toLowerCase();
      const side = band === "lower" ? "lower" : band === "middle" ? "mid" : "upper";
      return { cur: `float(${base}_${side}.iloc[i])`, prev: `float(${base}_${side}.iloc[i - 1])` };
    }
    return { cur: "prices", prev: "prices_prev" };
  }

  function condToPython(cond) {
    const ref = registerIndicator(cond);
    const cur = ref.cur;
    const prev = ref.prev;
    const threshold = Number(cond?.val || 0);
    const th = Number.isFinite(threshold) ? threshold : 0;
    const op = String(cond?.op || "").toLowerCase();
    if (op === "price inside band") {
      const ind = normalizeRuleIndicator(cond?.ind);
      if (ind === "Bollinger Bands") {
        const p = Math.round(paramNum(cond, "bbPeriod", 20, 2));
        const std = paramNum(cond, "bbStd", 2, 0.1);
        const key = `bb:${p}:${std}`;
        if (!cache.has(key)) registerIndicator({ ...cond, bandSelection: "upper" });
        const base = cache.get(key);
        return `_okv(${base}_lower.iloc[i]) and _okv(${base}_upper.iloc[i]) and prices >= float(${base}_lower.iloc[i]) and prices <= float(${base}_upper.iloc[i])`;
      }
      if (ind === "Keltner Channel") {
        const p = Math.round(paramNum(cond, "kcPeriod", 20, 2));
        const mult = paramNum(cond, "kcMultiplier", 1.5, 0.1);
        const key = `kc:${p}:${mult}`;
        if (!cache.has(key)) registerIndicator({ ...cond, bandSelection: "upper" });
        const base = cache.get(key);
        return `_okv(${base}_lower.iloc[i]) and _okv(${base}_upper.iloc[i]) and prices >= float(${base}_lower.iloc[i]) and prices <= float(${base}_upper.iloc[i])`;
      }
      return "False";
    }
    if (op === "two indicators cross") {
      const a = registerIndicator(cond);
      const b = registerIndicator({ ...cond, ind: cond?.secondIndicator || "SMA" });
      return `_okv(${a.prev}) and _okv(${a.cur}) and _okv(${b.prev}) and _okv(${b.cur}) and ((float(${a.prev}) <= float(${b.prev}) and float(${a.cur}) > float(${b.cur})) or (float(${a.prev}) >= float(${b.prev}) and float(${a.cur}) < float(${b.cur})))`;
    }
    switch (op) {
      case "crosses above":
        return `_okv(${prev}) and _okv(${cur}) and float(${cur}) > float(${prev})`;
      case "crosses below":
        return `_okv(${prev}) and _okv(${cur}) and float(${cur}) < float(${prev})`;
      case "is above":
      case "greater than":
        return `_okv(${cur}) and float(${cur}) > ${th}`;
      case "is below":
      case "less than":
        return `_okv(${cur}) and float(${cur}) < ${th}`;
      default:
        return `_okv(${cur}) and float(${cur}) > 0`;
    }
  }

  function stepToPython(step) {
    const conds = Array.isArray(step?.conds) ? step.conds : [];
    return conds
      .map((c, i) => {
        const expr = condToPython(c);
        if (i === 0) return expr;
        return `${c.joiner === "OR" ? " or " : " and "}${expr}`;
      })
      .join("");
  }

  function ruleToPython(rule) {
    if (builderMode === "simple") {
      const conds = Array.isArray(rule?.conds) ? rule.conds : [];
      return conds
        .map((c, i) => {
          const expr = condToPython(c);
          if (i === 0) return expr;
          return `${c.joiner === "OR" ? " or " : " and "}${expr}`;
        })
        .join("");
    }
    const steps = Array.isArray(rule?.steps) ? rule.steps : [];
    return steps.map((s) => `(${stepToPython(s)})`).join(" and ");
  }

  const entryCondition = entryRules.map((r) => `(${ruleToPython(r)})`).join(" or ");
  const exitCondition = exitRules.map((r) => `(${ruleToPython(r)})`).join(" or ");

  const entryAction = entryRules[0]?.action || "Buy — all cash";
  const entryActionValRaw = Number(entryRules[0]?.actionVal);
  const entryPct = Number.isFinite(entryActionValRaw) ? entryActionValRaw : 50;
  const entryFixed = Number.isFinite(entryActionValRaw) ? entryActionValRaw : 1000;
  const sizeMode = entryAction.includes("Hold")
    ? "hold"
    : entryAction.includes("%")
      ? "pct"
      : entryAction.includes("fixed")
        ? "fixed"
        : "all";
  const exitAction = exitRules[0]?.action || "Sell — entire position";
  const exitActionValRaw = Number(exitRules[0]?.actionVal);
  const exitPct = Number.isFinite(exitActionValRaw) ? exitActionValRaw : 50;
  const exitFixed = Number.isFinite(exitActionValRaw) ? exitActionValRaw : 1000;
  const sellMode = exitAction.includes("Hold")
    ? "hold"
    : exitAction.includes("%")
      ? "pct"
      : exitAction.includes("fixed")
        ? "fixed"
        : "all";

  const stopLoss = riskRules.find((r) => String(r?.action || "").includes("Stop loss"));
  const takeProfit = riskRules.find((r) => String(r?.action || "").includes("Take profit"));

  return `
def run(data):
    # Rule builder compiler (${ticker}, ${start} -> ${end} from form)
    df = data["price"].copy()
    c = df["Close"].astype(float)
    v = df["Volume"].astype(float) if "Volume" in df.columns else c * 0.0
    def _okv(x):
        try:
            xf = float(x)
            return xf == xf
        except Exception:
            return False
${setupLines.length ? `\n${setupLines.join("\n")}` : ""}

    cash = 1.0
    shares = 0.0
    entry_px = None
    equity = []
    trades = []

    for i in range(len(c)):
        pr = float(c.iloc[i])
        equity.append(cash + shares * pr)

        if i == 0:
            continue

        prices = pr
        prices_prev = float(c.iloc[i - 1])
        volume = float(v.iloc[i])
        volume_prev = float(v.iloc[i - 1])

        entry_signal = bool(${entryCondition || "False"})
        exit_signal = bool(${exitCondition || "False"})

        if exit_signal and shares > 0 and "${sellMode}" != "hold":
            if "${sellMode}" == "pct":
                _qty = shares * (${exitPct} / 100.0)
            elif "${sellMode}" == "fixed":
                _qty = min(shares, ${exitFixed} / pr if pr > 0 else shares)
            else:
                _qty = shares
            _qty = max(0.0, min(shares, _qty))
            if _qty > 0:
                cash += _qty * pr
                shares -= _qty
                if shares <= 1e-12:
                    shares = 0.0
                    entry_px = None
                trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})
        elif entry_signal and cash > 0:
            if "${sizeMode}" == "hold":
                spend = 0.0
            elif "${sizeMode}" == "pct":
                spend = cash * (${entryPct} / 100.0)
            elif "${sizeMode}" == "fixed":
                spend = min(${entryFixed}, cash)
            else:
                spend = cash
            if spend > 0:
                shares += spend / pr
                cash -= spend
                entry_px = pr if entry_px is None else entry_px
                trades.append({"date": str(df.index[i])[:10], "side": "buy", "price": pr})
${stopLoss ? `        if shares > 0 and entry_px is not None and pr <= entry_px * (1.0 - ${Number(stopLoss.actionVal || 0) / 100}):\n            cash += shares * pr\n            shares = 0.0\n            entry_px = None\n            trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})` : ""}
${takeProfit ? `        if shares > 0 and entry_px is not None and pr >= entry_px * (1.0 + ${Number(takeProfit.actionVal || 0) / 100}):\n            cash += shares * pr\n            shares = 0.0\n            entry_px = None\n            trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})` : ""}

    dates = [str(x)[:10] for x in df.index]
    e0 = equity[0] if abs(equity[0]) > 1e-12 else 1.0
    return {
        "dates": dates,
        "equity": [float(x / e0) for x in equity],
        "trades": trades,
        "close_prices": c.tolist(),
    }
`.trim();
}
