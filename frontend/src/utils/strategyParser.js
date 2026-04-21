function parseIndicatorCall(line, idSeed) {
  const m = line.match(/^\s*(\w+)\s*=\s*(\w+)\(data,\s*(.*)\)\s*$/);
  if (!m) return null;
  const varName = m[1];
  const fn = m[2];
  const args = m[3] || "";
  const params = {};
  args.split(",").forEach((kv) => {
    const [k, v] = kv.split("=").map((s) => s && s.trim());
    if (!k || v == null) return;
    params[k] = Number(v);
  });
  const map = {
    SMA: { kind: "SMA", type: "line", params: { period: params.period || 20 } },
    EMA: { kind: "EMA", type: "line", params: { period: params.period || 20 } },
    MACD: { kind: "MACD", type: "line", params: { fast: params.fast || 12, slow: params.slow || 26, signal: params.signal || 9 } },
    Volume: { kind: "Volume", type: "line", params: {} },
    RSI: { kind: "RSI", type: "oscillator", params: { period: params.period || 14 } },
    Stochastic: { kind: "Stochastic", type: "oscillator", params: { period: params.period || 14 } },
    BollingerBands: { kind: "Bollinger Bands", type: "band", params: { period: params.period || 20, stddev: params.stddev || 2 } },
    KeltnerChannel: { kind: "Keltner Channel", type: "band", params: { period: params.period || 20 } },
  };
  if (!map[fn]) return null;
  return { varName, indicator: { id: `${idSeed}-${varName}`, ...map[fn] } };
}

function parseIfExpression(expr, indicatorByVar, idSeed) {
  const parts = expr.split(/\s+(and|or)\s+/i);
  const conditions = [];
  const combinators = [];
  for (let i = 0; i < parts.length; i += 2) {
    const chunk = parts[i].trim();
    if (i > 0) combinators.push(parts[i - 1].toUpperCase() === "OR" ? "OR" : "AND");
    const c = chunk.match(/^(\w+)\.(crosses_above|crosses_below|greater_than|less_than)\(([-\d.]+)\)$/);
    const two = chunk.match(/^(\w+)\.crosses\((\w+)\)$/);
    if (c) {
      const ind = indicatorByVar.get(c[1]);
      if (!ind) return null;
      conditions.push({
        id: `${idSeed}-row-${conditions.length + 1}`,
        indicator: structuredClone(ind),
        condition: c[2],
        value: Number(c[3]),
        secondIndicator: null,
      });
      continue;
    }
    if (two) {
      const ind = indicatorByVar.get(two[1]);
      const second = indicatorByVar.get(two[2]);
      if (!ind || !second) return null;
      conditions.push({
        id: `${idSeed}-row-${conditions.length + 1}`,
        indicator: structuredClone(ind),
        condition: "two_indicators_cross",
        value: null,
        secondIndicator: structuredClone(second),
      });
      continue;
    }
    return null;
  }
  return { conditions, combinators };
}

export function parsePythonToStrategy(code) {
  const lines = code.split("\n");
  const indicatorByVar = new Map();
  const rules = [];
  let currentRuleKind = "entry";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const parsedInd = parseIndicatorCall(line, `i${i}`);
    if (parsedInd) {
      indicatorByVar.set(parsedInd.varName, parsedInd.indicator);
      continue;
    }
    const ruleComment = line.match(/#\s*Rule\s*\d+\s*-\s*(Entry|Exit|Risk)/i);
    if (ruleComment) {
      currentRuleKind = ruleComment[1].toLowerCase();
      continue;
    }
    const ifMatch = line.match(/^\s*if\s+(.+):\s*$/);
    if (!ifMatch) continue;
    const actionLine = lines[i + 1] || "";
    const parsed = parseIfExpression(ifMatch[1], indicatorByVar, `r${rules.length + 1}`);
    if (!parsed) return null;
    let action = null;
    if (/buy\(amount="all_cash"\)/.test(actionLine)) action = { kind: "buy_all_cash", params: {} };
    else if (/buy\(amount="pct_portfolio",\s*value=([-\d.]+)\)/.test(actionLine)) action = { kind: "buy_percent_portfolio", params: { value: Number(actionLine.match(/value=([-\d.]+)/)?.[1] || 50) } };
    else if (/sell\(amount="all"\)/.test(actionLine)) action = { kind: "sell_entire_position", params: {} };
    else if (/sell\(amount="pct_position",\s*value=([-\d.]+)\)/.test(actionLine)) action = { kind: "sell_percent_position", params: { value: Number(actionLine.match(/value=([-\d.]+)/)?.[1] || 50) } };
    else return null;
    rules.push({
      id: `rule-${rules.length + 1}`,
      kind: currentRuleKind,
      title: currentRuleKind === "entry" ? "Entry rule" : currentRuleKind === "exit" ? "Exit rule" : "Risk rule",
      conditions: parsed.conditions,
      combinators: parsed.combinators,
      action,
    });
  }
  return rules.length ? rules : null;
}
