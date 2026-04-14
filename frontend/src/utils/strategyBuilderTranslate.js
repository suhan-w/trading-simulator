/**
 * Linear visual strategy → sandboxed run(data) Python (Plan 1 compiler).
 * data["price"] is injected; ticker/range are from the backtest form (comments only).
 */

/** @typedef {{ id: string, type: string, params?: Record<string, unknown>}} VisualBlock */

const DATA_TYPES = new Set(["select_stock", "select_date_range"]);
const INDICATOR_TYPES = new Set(["sma", "ema", "rsi", "bollinger", "macd", "volume"]);
const CONDITION_TYPES = new Set(["if_gt", "if_lt", "if_cross_above", "if_cross_below", "if_two_indicators_cross"]);
const RISK_TYPES = new Set(["stop_loss", "take_profit", "max_position"]);

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
 * Linear semantics: indicators stack in order; each IF uses the last 1 (threshold) or 2 (cross) series;
 * IF must be immediately followed by Buy/Sell; Buy without a preceding IF buys once at bar 0; risk blocks apply every bar after signals.
 *
 * @param {VisualBlock[]} program
 * @param {string[]} errors
 * @returns {{ setup: string[]; rules: { when: string; side: "buy" | "sell"; buyMode?: string; buyFixed?: number; buyPct?: number }[]; bar0Buys: VisualBlock[]; risks: VisualBlock[] }}
 */
function parseLinearProgram(program, errors) {
  /** @type {string[]} */
  const setup = [];
  /** @type {string[]} */
  const stack = [];
  /** @type {{ when: string; side: "buy" | "sell"; buyMode?: string; buyFixed?: number; buyPct?: number }[]} */
  const rules = [];
  /** @type {VisualBlock[]} */
  const bar0Buys = [];
  /** @type {VisualBlock[]} */
  const risks = [];

  let ix = 0;
  const nextName = (prefix) => `${prefix}_${ix++}`;

  /** @type {null | { ok: true; expr: string } | { ok: false }} */
  let pendingWhen = null;

  const needStack = (n, ctx) => {
    if (stack.length < n) {
      errors.push(`${ctx}: need at least ${n} indicator(s) before this block — add indicators above.`);
      return false;
    }
    return true;
  };

  const pushIndicator = (b) => {
    const t = b.type;
    if (t === "sma") {
      const p = Math.max(1, Math.round(num(b, "period", 20)));
      const v = nextName("sma");
      setup.push(`    ${v} = c.rolling(${p}).mean()`);
      stack.push(v);
      return;
    }
    if (t === "ema") {
      const p = Math.max(1, Math.round(num(b, "period", 12)));
      const v = nextName("ema");
      setup.push(`    ${v} = c.ewm(span=${p}, adjust=False).mean()`);
      stack.push(v);
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
      stack.push(v);
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
      stack.push(mid);
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
      stack.push(line, sig);
      return;
    }
    if (t === "volume") {
      const v = nextName("vol");
      setup.push(`    ${v} = df["Volume"].astype(float)`);
      stack.push(v);
      return;
    }
    errors.push(`Unsupported indicator type: ${t}`);
  };

  const buildCondition = (b) => {
    const t = b.type;
    const th = num(b, "threshold", 50);
    if (t === "if_gt" || t === "if_lt") {
      if (!needStack(1, t)) return null;
      const a = stack[stack.length - 1];
      if (t === "if_lt") {
        return `_ok2(${a}, i - 1) and _ok2(${a}, i) and float(${a}.iloc[i - 1]) < ${th} <= float(${a}.iloc[i])`;
      }
      return `_ok2(${a}, i - 1) and _ok2(${a}, i) and float(${a}.iloc[i - 1]) > ${th} >= float(${a}.iloc[i])`;
    }
    if (t === "if_cross_above" || t === "if_cross_below" || t === "if_two_indicators_cross") {
      if (!needStack(2, t)) return null;
      const A = stack[stack.length - 2];
      const B = stack[stack.length - 1];
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

    if (DATA_TYPES.has(t)) {
      errors.push(`"${t}" must appear at the top of the canvas (before strategy blocks).`);
      continue;
    }

    if (INDICATOR_TYPES.has(t)) {
      if (pendingWhen?.ok) {
        errors.push("Add a Buy or Sell after each condition block before adding another indicator.");
      }
      pendingWhen = null;
      pushIndicator(b);
      continue;
    }

    if (CONDITION_TYPES.has(t)) {
      if (pendingWhen?.ok) {
        errors.push("Each condition must be followed by Buy, Sell, or Hold before the next condition.");
      }
      const w = buildCondition(b);
      pendingWhen = w ? { ok: true, expr: w } : { ok: false };
      continue;
    }

    if (t === "buy" || t === "sell") {
      if (pendingWhen?.ok) {
        const rawMode = (b.params?.mode || "all_cash").toString();
        const mode = rawMode === "fixed" ? "fixed" : rawMode === "pct" ? "pct" : "all_cash";
        rules.push({
          when: pendingWhen.expr,
          side: t,
          buyMode: t === "buy" ? mode : undefined,
          buyFixed: t === "buy" ? num(b, "fixedAmount", 0.5) : undefined,
          buyPct: t === "buy" ? num(b, "pctAmount", 100) : undefined,
        });
        pendingWhen = null;
      } else if (pendingWhen && !pendingWhen.ok) {
        errors.push("Fix the IF block above (add indicators before it) before Buy/Sell.");
        pendingWhen = null;
      } else if (t === "buy") {
        bar0Buys.push(b);
      } else {
        errors.push("Sell blocks need a condition block immediately above (e.g. IF crosses below → Sell).");
      }
      continue;
    }

    if (t === "hold") {
      if (pendingWhen?.ok) {
        errors.push("Hold cannot follow a condition — use Buy or Sell.");
      }
      pendingWhen = null;
      continue;
    }

    if (RISK_TYPES.has(t)) {
      if (pendingWhen?.ok) {
        errors.push("Add Buy or Sell after a condition before risk blocks.");
      }
      pendingWhen = null;
      risks.push(b);
      continue;
    }

    errors.push(`Unknown or unsupported block: ${t}`);
  }

  if (pendingWhen?.ok) {
    errors.push("Last condition has no Buy/Sell — add an action block below it.");
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
      lines.push(`            if shares > 0:`);
      lines.push(`                cash = shares * pr`);
      lines.push(`                trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})`);
      lines.push(`                shares = 0.0`);
      lines.push(`                entry_px = None`);
    }
  }

  if (stopF != null) {
    lines.push(`        if shares > 0 and entry_px is not None and pr <= entry_px * (1.0 - _stop_thr):`);
    lines.push(`            cash = shares * pr`);
    lines.push(`            trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})`);
    lines.push(`            shares = 0.0`);
    lines.push(`            entry_px = None`);
  }
  if (tpF != null) {
    lines.push(`        if shares > 0 and entry_px is not None and pr >= entry_px * (1.0 + _tp_thr):`);
    lines.push(`            cash = shares * pr`);
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
export function translateVisualBlocksToPythonWithDiagnostics(blocks, { ticker, start, end }) {
  const t = (ticker || "CBA.AX").trim();
  const s = start || "";
  const e = end || "";

  /** @type {string[]} */
  const errors = [];

  const program = stripLeadingData(blocks);

  if (program.length === 0) {
    return { code: emitEmptyStrategy(t, s, e), errors: [] };
  }

  const parsed = parseLinearProgram(program, errors);

  if (errors.length) {
    return { code: emitCompileErrorRaising(t, s, e, errors), errors };
  }

  const hasLogic =
    parsed.setup.length > 0 || parsed.rules.length > 0 || parsed.bar0Buys.length > 0 || parsed.risks.length > 0;
  if (!hasLogic) {
    errors.push("Add indicators, conditions, and trades — only data blocks are not enough.");
    return { code: emitCompileErrorRaising(t, s, e, errors), errors };
  }

  return { code: emitRunBody(t, s, e, parsed), errors: [] };
}

/** @param {VisualBlock[]} blocks */
export function translateVisualBlocksToPython(blocks, ctx) {
  return translateVisualBlocksToPythonWithDiagnostics(blocks, ctx).code;
}
