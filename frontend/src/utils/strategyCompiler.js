function indicatorExpr(indicator) {
  if (!indicator) return "price";
  const p = indicator.params || {};
  switch (indicator.kind) {
    case "SMA":
      return `SMA(data, period=${Number(p.period || 20)})`;
    case "EMA":
      return `EMA(data, period=${Number(p.period || 20)})`;
    case "MACD":
      return `MACD(data, fast=${Number(p.fast || 12)}, slow=${Number(p.slow || 26)}, signal=${Number(p.signal || 9)})`;
    case "Volume":
      return "Volume(data)";
    case "RSI":
      return `RSI(data, period=${Number(p.period || 14)})`;
    case "Stochastic":
      return `Stochastic(data, period=${Number(p.period || 14)})`;
    case "Bollinger Bands":
      return `BollingerBands(data, period=${Number(p.period || 20)}, stddev=${Number(p.stddev || 2.0)})`;
    case "Keltner Channel":
      return `KeltnerChannel(data, period=${Number(p.period || 20)})`;
    default:
      return "price";
  }
}

function conditionExpr(row) {
  const cond = row.condition;
  if (!row.indicator || !cond) return "False";
  const left = row.indicator.varName || `ind_${row.indicator.id.replace(/-/g, "_")}`;
  if (cond === "inside_band") {
    const z = row.bandZone || "full";
    if (z === "full") return `price.inside_band(${left})`;
    return `price.inside_band(${left}, zone="${z}")`;
  }
  if (cond === "two_indicators_cross") {
    if (!row.secondIndicator) return "False";
    const right = row.secondIndicator.varName || `ind_${row.secondIndicator.id.replace(/-/g, "_")}`;
    return `${left}.crosses(${right})`;
  }
  const v = Number(row.value ?? 0);
  if (cond === "crosses_above") return `${left}.crosses_above(${v})`;
  if (cond === "crosses_below") return `${left}.crosses_below(${v})`;
  if (cond === "greater_than") return `${left}.greater_than(${v})`;
  if (cond === "less_than") return `${left}.less_than(${v})`;
  return "False";
}

function actionExpr(action) {
  if (!action) return "pass";
  const p = action.params || {};
  switch (action.kind) {
    case "buy_all_cash":
      return `buy(amount="all_cash")`;
    case "buy_percent_portfolio":
      return `buy(amount="pct_portfolio", value=${Number(p.value || 50)})`;
    case "sell_entire_position":
      return `sell(amount="all")`;
    case "sell_percent_position":
      return `sell(amount="pct_position", value=${Number(p.value || 50)})`;
    default:
      return "pass";
  }
}

export function compileStrategyToPython(rules) {
  const lines = ["def strategy(data):", "    # Indicators"];
  const indicatorById = new Map();
  let counter = 1;
  rules.forEach((rule) => {
    rule.conditions.forEach((row) => {
      if (!row.indicator) return;
      if (!indicatorById.has(row.indicator.id)) {
        const varName = `ind_${counter++}`;
        indicatorById.set(row.indicator.id, varName);
        row.indicator.varName = varName;
        lines.push(`    ${varName} = ${indicatorExpr(row.indicator)}`);
      } else {
        row.indicator.varName = indicatorById.get(row.indicator.id);
      }
      if (row.secondIndicator) {
        if (!indicatorById.has(row.secondIndicator.id)) {
          const varName = `ind_${counter++}`;
          indicatorById.set(row.secondIndicator.id, varName);
          row.secondIndicator.varName = varName;
          lines.push(`    ${varName} = ${indicatorExpr(row.secondIndicator)}`);
        } else {
          row.secondIndicator.varName = indicatorById.get(row.secondIndicator.id);
        }
      }
    });
  });
  lines.push("");
  rules.forEach((rule, idx) => {
    lines.push(`    # Rule ${idx + 1} - ${rule.kind === "entry" ? "Entry" : rule.kind === "exit" ? "Exit" : "Risk"}`);
    const exprs = rule.conditions.map((r) => conditionExpr(r));
    const joined = exprs.reduce((acc, expr, i) => {
      if (i === 0) return expr;
      return `${acc} ${rule.combinators[i - 1] === "OR" ? "or" : "and"} ${expr}`;
    }, "False");
    lines.push(`    if ${joined}:`);
    lines.push(`        ${actionExpr(rule.action)}`);
    lines.push("");
  });
  return lines.join("\n");
}
