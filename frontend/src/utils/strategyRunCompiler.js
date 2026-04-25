/**
 * Compiles unified Strategy Builder rules (StrategyBuilder.jsx) into sandbox-valid Python:
 * defines run(data) returning dates, equity, trades, close_prices for code_backtest_sandbox.py.
 */

function num(x, fallback) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function bandSeriesNames(ind, uid, setupLines, cache) {
  const p = Math.max(2, Math.round(num(ind?.params?.period, 20)));
  const std = Math.max(0.1, num(ind?.params?.stddev, 2));
  const key = `bb:${p}:${std}`;
  if (cache.has(key)) return cache.get(key);
  const base = `bb_${uid}`;
  setupLines.push(`    ${base}_mid = c.rolling(${p}).mean()`);
  setupLines.push(`    ${base}_std = c.rolling(${p}).std(ddof=0)`);
  setupLines.push(`    ${base}_upper = ${base}_mid + ${std} * ${base}_std`);
  setupLines.push(`    ${base}_lower = ${base}_mid - ${std} * ${base}_std`);
  const names = { mid: `${base}_mid`, upper: `${base}_upper`, lower: `${base}_lower` };
  cache.set(key, names);
  return names;
}

function keltnerSeriesNames(ind, uid, setupLines, cache) {
  const p = Math.max(2, Math.round(num(ind?.params?.period, 20)));
  const mult = Math.max(0.1, num(ind?.params?.atrMultiplier, 2));
  const key = `kc:${p}:${mult}`;
  if (cache.has(key)) return cache.get(key);
  const base = `kc_${uid}`;
  setupLines.push(`    ${base}_ema = c.ewm(span=${p}, adjust=False).mean()`);
  setupLines.push(
    `    ${base}_tr_hl = (df["High"].astype(float) - df["Low"].astype(float)) if ("High" in df.columns and "Low" in df.columns) else c.diff().abs()`
  );
  setupLines.push(`    ${base}_atr = ${base}_tr_hl.rolling(${p}).mean()`);
  setupLines.push(`    ${base}_upper = ${base}_ema + ${mult} * ${base}_atr`);
  setupLines.push(`    ${base}_lower = ${base}_ema - ${mult} * ${base}_atr`);
  setupLines.push(`    ${base}_mid = ${base}_ema`);
  const names = { mid: `${base}_mid`, upper: `${base}_upper`, lower: `${base}_lower` };
  cache.set(key, names);
  return names;
}

function ensureIndicator(ind, setupLines, cache, metaById, uidRef) {
  if (!ind?.id) return null;
  if (metaById.has(ind.id)) return metaById.get(ind.id);

  const kind = ind.kind;
  let meta;

  if (kind === "SMA") {
    const p = Math.max(1, Math.round(num(ind.params?.period, 20)));
    const key = `sma:${p}`;
    let name = cache.get(key);
    if (!name) {
      uidRef.count += 1;
      name = `sma_${uidRef.count}`;
      setupLines.push(`    ${name} = c.rolling(${p}).mean()`);
      cache.set(key, name);
    }
    meta = { kind: "line", series: name };
  } else if (kind === "EMA") {
    const p = Math.max(1, Math.round(num(ind.params?.period, 20)));
    const key = `ema:${p}`;
    let name = cache.get(key);
    if (!name) {
      uidRef.count += 1;
      name = `ema_${uidRef.count}`;
      setupLines.push(`    ${name} = c.ewm(span=${p}, adjust=False).mean()`);
      cache.set(key, name);
    }
    meta = { kind: "line", series: name };
  } else if (kind === "MACD") {
    const fast = Math.max(1, Math.round(num(ind.params?.fast, 12)));
    const slow = Math.max(1, Math.round(num(ind.params?.slow, 26)));
    const signal = Math.max(1, Math.round(num(ind.params?.signal, 9)));
    const key = `macd:${fast}:${slow}:${signal}`;
    let lineName = cache.get(key);
    if (!lineName) {
      uidRef.count += 1;
      const ef = `macd_ef_${uidRef.count}`;
      const es = `macd_es_${uidRef.count}`;
      lineName = `macd_line_${uidRef.count}`;
      const sigName = `macd_sig_${uidRef.count}`;
      setupLines.push(`    ${ef} = c.ewm(span=${fast}, adjust=False).mean()`);
      setupLines.push(`    ${es} = c.ewm(span=${slow}, adjust=False).mean()`);
      setupLines.push(`    ${lineName} = ${ef} - ${es}`);
      setupLines.push(`    ${sigName} = ${lineName}.ewm(span=${signal}, adjust=False).mean()`);
      cache.set(key, lineName);
    }
    meta = { kind: "line", series: lineName };
  } else if (kind === "Volume") {
    const p = Math.max(1, Math.round(num(ind.params?.period, 20)));
    const key = `vol:${p}`;
    let name = cache.get(key);
    if (!name) {
      uidRef.count += 1;
      name = `vol_${uidRef.count}`;
      setupLines.push(`    ${name} = v.rolling(${p}).mean()`);
      cache.set(key, name);
    }
    meta = { kind: "line", series: name };
  } else if (kind === "RSI") {
    const p = Math.max(2, Math.round(num(ind.params?.period, 14)));
    const key = `rsi:${p}`;
    let name = cache.get(key);
    if (!name) {
      uidRef.count += 1;
      name = `rsi_${uidRef.count}`;
      setupLines.push(`    ${name}_d = c.diff()`);
      setupLines.push(`    ${name}_g = ${name}_d.clip(lower=0.0)`);
      setupLines.push(`    ${name}_l = (-${name}_d).clip(lower=0.0)`);
      setupLines.push(`    ${name}_ag = ${name}_g.ewm(alpha=1.0 / ${p}.0, adjust=False).mean()`);
      setupLines.push(`    ${name}_al = ${name}_l.ewm(alpha=1.0 / ${p}.0, adjust=False).mean().replace(0.0, np.nan)`);
      setupLines.push(`    ${name} = (100.0 - (100.0 / (1.0 + (${name}_ag / ${name}_al)))).fillna(50.0)`);
      cache.set(key, name);
    }
    meta = { kind: "line", series: name };
  } else if (kind === "Stochastic") {
    const p = Math.max(2, Math.round(num(ind.params?.period, 14)));
    const key = `stoch:${p}`;
    let name = cache.get(key);
    if (!name) {
      uidRef.count += 1;
      name = `stoch_${uidRef.count}`;
      setupLines.push(
        `    ${name}_low = df["Low"].astype(float).rolling(${p}).min() if "Low" in df.columns else c.rolling(${p}).min()`
      );
      setupLines.push(
        `    ${name}_high = df["High"].astype(float).rolling(${p}).max() if "High" in df.columns else c.rolling(${p}).max()`
      );
      setupLines.push(
        `    ${name} = (100.0 * (c - ${name}_low) / (${name}_high - ${name}_low).replace(0.0, np.nan)).fillna(50.0)`
      );
      cache.set(key, name);
    }
    meta = { kind: "line", series: name };
  } else if (kind === "Bollinger Bands") {
    uidRef.count += 1;
    const names = bandSeriesNames(ind, uidRef.count, setupLines, cache);
    meta = { kind: "band", ...names };
  } else if (kind === "Keltner Channel") {
    uidRef.count += 1;
    const names = keltnerSeriesNames(ind, uidRef.count, setupLines, cache);
    meta = { kind: "band", ...names };
  } else {
    meta = { kind: "unknown", series: null };
  }

  metaById.set(ind.id, meta);
  return meta;
}

function seriesAt(meta, iOrPrev) {
  if (!meta?.series) return "None";
  return `${meta.series}.iloc[${iOrPrev}]`;
}

function rowToExpr(row, metaById, setupLines, cache, uidRef) {
  const ind = row?.indicator;
  const cond = row?.condition;
  if (!ind || !cond) return "False";

  const a = ensureIndicator(ind, setupLines, cache, metaById, uidRef);
  const th = num(row.value, 0);

  const _ok = (s) => `_okv(${s})`;

  if (cond === "two_indicators_cross") {
    const bInd = row.secondIndicator;
    if (!bInd?.id) return "False";
    const mb = ensureIndicator(bInd, setupLines, cache, metaById, uidRef);
    const ma = ensureIndicator(ind, setupLines, cache, metaById, uidRef);
    if (ma?.kind !== "line" || mb?.kind !== "line") return "False";
    const ap = seriesAt(ma, "i - 1");
    const ac = seriesAt(ma, "i");
    const bp = seriesAt(mb, "i - 1");
    const bc = seriesAt(mb, "i");
    return `${_ok(ap)} and ${_ok(ac)} and ${_ok(bp)} and ${_ok(bc)} and ((float(${ap}) <= float(${bp}) and float(${ac}) > float(${bc})) or (float(${ap}) >= float(${bp}) and float(${ac}) < float(${bc})))`;
  }

  if (cond === "inside_band") {
    if (a?.kind !== "band") return "False";
    const zone = row.bandZone || "full";
    const lo = `${a.lower}.iloc[i]`;
    const hi = `${a.upper}.iloc[i]`;
    const mid = `${a.mid}.iloc[i]`;
    if (zone === "upper_half") {
      return `${_ok(mid)} and ${_ok(hi)} and ${_ok(lo)} and float(${mid}) <= pr <= float(${hi})`;
    }
    if (zone === "lower_half") {
      return `${_ok(mid)} and ${_ok(hi)} and ${_ok(lo)} and float(${lo}) <= pr <= float(${mid})`;
    }
    return `${_ok(lo)} and ${_ok(hi)} and float(${lo}) <= pr <= float(${hi})`;
  }

  if (a?.kind !== "line") return "False";
  const prev = `${a.series}.iloc[i - 1]`;
  const cur = `${a.series}.iloc[i]`;

  if (cond === "crosses_above") {
    return `${_ok(prev)} and ${_ok(cur)} and float(${prev}) <= ${th} and float(${cur}) > ${th}`;
  }
  if (cond === "crosses_below") {
    return `${_ok(prev)} and ${_ok(cur)} and float(${prev}) >= ${th} and float(${cur}) < ${th}`;
  }
  if (cond === "greater_than") {
    return `${_ok(cur)} and float(${cur}) > ${th}`;
  }
  if (cond === "less_than") {
    return `${_ok(cur)} and float(${cur}) < ${th}`;
  }
  return "False";
}

/** @param {unknown[]} rules — unified rules from StrategyBuilder */
export function compileUnifiedRulesToRunPython(rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return minimalHoldRun();
  }

  const setupLines = [];
  const cache = new Map();
  const metaById = new Map();
  const uidRef = { count: 0 };

  function rowToExprBound(row) {
    return rowToExpr(row, metaById, setupLines, cache, uidRef);
  }
  function combineRowsBound(rows, combinators) {
    const parts = (rows || []).map((r, i) => {
      const expr = rowToExprBound(r);
      if (i === 0) return expr;
      const join = combinators?.[i - 1] === "OR" ? " or " : " and ";
      return `${join}${expr}`;
    });
    return parts.length ? parts.join("") : "False";
  }

  const entryRules = rules.filter((r) => r.kind === "entry");
  const exitRules = rules.filter((r) => r.kind === "exit");
  const risk = rules.find((r) => r.kind === "risk");
  const slPct = risk && Number(risk.stopLoss) > 0 ? Number(risk.stopLoss) / 100 : null;
  const tpPct = risk && Number(risk.takeProfit) > 0 ? Number(risk.takeProfit) / 100 : null;

  const entryExpr = entryRules.map((r) => `(${combineRowsBound(r.conditions, r.combinators)})`).join(" or ") || "False";
  const exitExpr = exitRules.map((r) => `(${combineRowsBound(r.conditions, r.combinators)})`).join(" or ") || "False";

  const entryRule = entryRules[0];
  const exitRule = exitRules[0];
  const entryAct = entryRule?.action?.kind || "buy_all_cash";
  const entryPct = num(entryRule?.action?.params?.value, 50);
  const exitAct = exitRule?.action?.kind || "sell_entire_position";
  const exitPct = num(exitRule?.action?.params?.value, 50);

  const lines = [];
  lines.push("# cowrie-backtest-strategy — generated from Strategy Builder (executable on backtests)");
  lines.push("def run(data):");
  lines.push("    def _okv(x):");
  lines.push("        try:");
  lines.push("            xf = float(x)");
  lines.push("            return xf == xf");
  lines.push("        except Exception:");
  lines.push("            return False");
  lines.push("    df = data[\"price\"].copy()");
  lines.push("    c = df[\"Close\"].astype(float)");
  lines.push('    v = df["Volume"].astype(float) if "Volume" in df.columns else c * 0.0');
  if (setupLines.length) {
    lines.push(...setupLines);
  }

  lines.push("    cash = 1.0");
  lines.push("    shares = 0.0");
  lines.push("    equity = []");
  lines.push("    trades = []");
  lines.push("    entry_px = None");

  lines.push("    for i in range(len(c)):");
  lines.push("        pr = float(c.iloc[i])");
  lines.push("        equity.append(cash + shares * pr)");
  lines.push("        if i == 0:");
  lines.push("            continue");

  lines.push(`        exit_signal = bool(${exitExpr})`);
  lines.push(`        entry_signal = bool(${entryExpr})`);

  lines.push("        if exit_signal and shares > 0:");
  if (exitAct === "sell_percent_position") {
    lines.push(`            _svp = ${exitPct}`);
    lines.push("            _pv = shares * pr");
    lines.push("            _qty = shares * (_svp / 100.0)");
    lines.push("            _qty = max(0.0, min(shares, _qty))");
    lines.push("            if _qty > 0:");
    lines.push("                cash += _qty * pr");
    lines.push("                shares -= _qty");
    lines.push('                trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})');
    lines.push("                if shares <= 1e-12:");
    lines.push("                    shares = 0.0");
    lines.push("                    entry_px = None");
  } else {
    lines.push("            cash += shares * pr");
    lines.push('            trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})');
    lines.push("            shares = 0.0");
    lines.push("            entry_px = None");
  }

  lines.push("        elif entry_signal and cash > 0:");
  if (entryAct === "buy_percent_portfolio") {
    lines.push(`            _pct = ${entryPct}`);
    lines.push("            spend = cash * (_pct / 100.0)");
  } else {
    lines.push("            spend = cash");
  }
  lines.push("            if spend > 0:");
  lines.push("                shares += spend / pr");
  lines.push("                cash -= spend");
  lines.push("                entry_px = pr if entry_px is None else entry_px");
  lines.push('                trades.append({"date": str(df.index[i])[:10], "side": "buy", "price": pr})');

  if (slPct != null) {
    const t = Number(slPct);
    lines.push(`        if shares > 0 and entry_px is not None and pr <= entry_px * (1.0 - ${t}):`);
    lines.push("            cash += shares * pr");
    lines.push('            trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})');
    lines.push("            shares = 0.0");
    lines.push("            entry_px = None");
  }
  if (tpPct != null) {
    const t = Number(tpPct);
    lines.push(`        if shares > 0 and entry_px is not None and pr >= entry_px * (1.0 + ${t}):`);
    lines.push("            cash += shares * pr");
    lines.push('            trades.append({"date": str(df.index[i])[:10], "side": "sell", "price": pr})');
    lines.push("            shares = 0.0");
    lines.push("            entry_px = None");
  }

  lines.push("    dates = [str(x)[:10] for x in df.index]");
  lines.push("    e0 = equity[0] if abs(equity[0]) > 1e-12 else 1.0");
  lines.push("    return {");
  lines.push('        "dates": dates,');
  lines.push('        "equity": [float(x / e0) for x in equity],');
  lines.push('        "trades": trades,');
  lines.push('        "close_prices": c.tolist(),');
  lines.push("    }");

  return lines.join("\n");
}

function minimalHoldRun() {
  return `# cowrie-backtest-strategy
def run(data):
    df = data["price"].copy()
    c = df["Close"].astype(float)
    equity = []
    trades = []
    cash = 1.0
    shares = 0.0
    for i in range(len(c)):
        pr = float(c.iloc[i])
        equity.append(cash + shares * pr)
    dates = [str(x)[:10] for x in df.index]
    e0 = equity[0] if abs(equity[0]) > 1e-12 else 1.0
    return {
        "dates": dates,
        "equity": [float(x / e0) for x in equity],
        "trades": trades,
        "close_prices": c.tolist(),
    }
`;
}
