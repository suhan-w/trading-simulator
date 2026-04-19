import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CodeMirror from "@uiw/react-codemirror";
import { translateRulesToPython } from "../utils/strategyBuilderTranslate";
import GlossaryDrawer, { GlossaryExampleSvg } from "./GlossaryDrawer";
// Saved visual strategies are handled by pages; builder no longer stores block layouts.
import {
  GLOSSARY_BLOCK_ORDER,
  GLOSSARY_ENTRIES,
  glossaryCategoryDot,
} from "../constants/strategyPaletteGlossary";
import SimpleRuleCard from "./strategyBuilder/SimpleRuleCard";
import AdvancedRuleCard from "./strategyBuilder/AdvancedRuleCard";
import PlainEnglishBar, { toPlainEnglishAdvanced, toPlainEnglishSimple } from "./strategyBuilder/PlainEnglishBar";
import { makeAdvancedRule, makeSimpleRule } from "../types/strategyRules";

/** @typedef {'visual' | 'generated'} BuilderMode */

function ModeTab({ id, active, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: active ? 500 : 400,
        color: active ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
        background: "none",
        border: "none",
        borderBottom: `2px solid ${active ? "var(--color-text-primary)" : "transparent"}`,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 4,
        transition: "all 0.1s",
      }}
    >
      {children}
    </button>
  );
}

const COL = {
  indicator: "#4a90d9",
  condition: "#7b68ee",
  action: "#2d8a55",
  risk: "#c0392b",
};

const PALETTE = [
  {
    key: "indicator",
    label: "Indicators",
    dot: COL.indicator,
    blocks: [
      { type: "sma", label: "SMA" },
      { type: "ema", label: "EMA" },
      { type: "rsi", label: "RSI" },
      { type: "bollinger", label: "Bollinger Bands" },
      { type: "macd", label: "MACD" },
      { type: "volume", label: "Volume" },
    ],
  },
  {
    key: "condition",
    label: "Conditions",
    dot: COL.condition,
    blocks: [
      { type: "if_gt", label: "IF greater than" },
      { type: "if_lt", label: "IF less than" },
      { type: "if_cross_above", label: "IF crosses above" },
      { type: "if_cross_below", label: "IF crosses below" },
      { type: "if_two_indicators_cross", label: "IF two indicators cross" },
    ],
  },
  {
    key: "action",
    label: "Actions",
    dot: COL.action,
    blocks: [
      { type: "buy", label: "BUY" },
      { type: "sell", label: "SELL" },
      { type: "hold", label: "HOLD" },
    ],
  },
  {
    key: "risk",
    label: "Risk",
    dot: COL.risk,
    blocks: [
      { type: "stop_loss", label: "Stop Loss" },
      { type: "take_profit", label: "Take Profit" },
      { type: "max_position", label: "Max Position Size" },
    ],
  },
];

const PALETTE_LABELS = Object.fromEntries(
  PALETTE.flatMap((c) => c.blocks.map((b) => [b.type, b.label]))
);

/**
 * @param {{
 *   code: string;
 *   setCode: (s: string) => void;
 *   importVersion: number;
 *   ticker: string;
 *   start: string;
 *   end: string;
 *   extensions: import("@codemirror/state").Extension[];
 *   importsBlock: import("react").ReactNode;
 *   onRun: (overrideCode?: string, meta?: { source: "visual" | "generated"; visualJson?: string }) => void | Promise<void>;
 *   loading: boolean;
 *   onTickerChange?: (next: string) => void;
 *   onStartChange?: (next: string) => void;
 *   onEndChange?: (next: string) => void;
 *   onExpandEditor?: () => void;
 *   onRunAvailabilityChange?: (state: { disabled: boolean }) => void;
 * }} props
 */
const StrategyBuilder = forwardRef(function StrategyBuilder(
  {
    code,
    setCode,
    importVersion,
    ticker,
    start,
    end,
    extensions,
    importsBlock,
    onRun,
    loading,
    onTickerChange,
    onStartChange,
    onEndChange,
    onExpandEditor,
    onRunAvailabilityChange,
    hideDataConfigFields = false,
    hideSavedStrategiesToolbar = false,
    autoSyncCodeFromVisual = false,
    renderLayout,
  },
  ref
) {
  /** @type {BuilderMode} */
  const [mode, setMode] = useState("visual");
  const [builderMode, setBuilderMode] = useState("simple"); // 'simple' | 'advanced'
  const [simpleRules, setSimpleRules] = useState(() => []);
  const [advancedRules, setAdvancedRules] = useState(() => []);
  /** @type {string | null} */
  const [glossaryType, setGlossaryType] = useState(null);
  /** @type {string | null} */
  const [paletteDetailType, setPaletteDetailType] = useState(null);
  const [openCats, setOpenCats] = useState(() => ({
    indicator: false,
    condition: false,
    action: false,
    risk: false,
  }));
  const [generatedDirty, setGeneratedDirty] = useState(false);
  const lastImportVersion = useRef(importVersion);

  const closeGlossary = useCallback(() => setGlossaryType(null), []);
  const appendBlockFromGlossary = useCallback(() => {
    // Visual builder no longer uses palette blocks; glossary remains read-only help.
  }, []);

  const previewFromVisual = useMemo(() => {
    return translateRulesToPython(simpleRules, advancedRules, builderMode, { ticker, start, end });
  }, [simpleRules, advancedRules, builderMode, ticker, start, end]);

  useEffect(() => {
    if (!autoSyncCodeFromVisual) return;
    if (mode !== "visual") return;
    const activeRules = builderMode === "simple" ? simpleRules : advancedRules;
    if (!activeRules.length) return;
    setCode(previewFromVisual);
  }, [autoSyncCodeFromVisual, mode, builderMode, simpleRules, advancedRules, previewFromVisual, setCode]);

  useEffect(() => {
    if (mode !== "generated" || generatedDirty) return;
    const activeRules = builderMode === "simple" ? simpleRules : advancedRules;
    if (!activeRules.length) return;
    setCode(previewFromVisual);
  }, [mode, generatedDirty, previewFromVisual, setCode, builderMode, simpleRules, advancedRules]);

  useEffect(() => {
    if (importVersion !== lastImportVersion.current) {
      lastImportVersion.current = importVersion;
      setMode("generated");
      setGeneratedDirty(true);
    }
  }, [importVersion]);

  useEffect(() => {
    if (mode !== "visual") setGlossaryType(null);
  }, [mode]);

  useEffect(() => {
    if (!paletteDetailType) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setPaletteDetailType(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteDetailType]);

  const onPaletteDragStart = (e, type) => {
    e.dataTransfer.setData("application/x-cowrie-block", JSON.stringify({ source: "palette", type }));
    e.dataTransfer.effectAllowed = "copy";
  };

  const applyTemplate = (key) => {
    // Placeholder until templates are rewritten for rule mode.
    // StrategyPage uses this for example buttons; we keep it stable.
    if (key === "ma") {
      setSimpleRules([makeSimpleRule("entry"), makeSimpleRule("exit")]);
      setBuilderMode("simple");
    } else if (key === "rsi") {
      setSimpleRules([makeSimpleRule("entry"), makeSimpleRule("exit")]);
      setBuilderMode("simple");
    } else {
      setSimpleRules([makeSimpleRule("entry")]);
      setBuilderMode("simple");
    }
    setGeneratedDirty(false);
    setMode("visual");
  };

  const goToBuildRules = () => {
    if (mode === "generated" && generatedDirty) {
      const ok = window.confirm(
        "You have manually edited the code. Switch to Build rules? Your edits will be replaced by code generated from the current rules."
      );
      if (!ok) return;
      setGeneratedDirty(false);
      setCode(previewFromVisual);
    }
    setMode("visual");
  };

  const goToCode = () => {
    setMode("generated");
  };

  const handleRun = useCallback(() => {
    if (mode === "visual") {
      const py = previewFromVisual;
      setCode(py);
      void onRun(py, { source: "visual" });
      return;
    }
    void onRun(code, { source: "generated" });
  }, [mode, previewFromVisual, setCode, onRun, code]);

  const runDisabled =
    loading ||
    (mode === "visual" && (builderMode === "simple" ? simpleRules.length === 0 : advancedRules.length === 0)) ||
    (mode === "generated" && !code.trim());

  useEffect(() => {
    onRunAvailabilityChange?.({ disabled: runDisabled });
  }, [runDisabled, onRunAvailabilityChange]);

  useImperativeHandle(
    ref,
    () => ({
      runBacktest: () => {
        void handleRun();
      },
      getSimpleRules: () => JSON.parse(JSON.stringify(simpleRules)),
      getAdvancedRules: () => JSON.parse(JSON.stringify(advancedRules)),
      getBuilderMode: () => builderMode,
      importSimpleRules: (rules) => {
        setSimpleRules(Array.isArray(rules) ? rules : []);
        setBuilderMode("simple");
        setMode("visual");
      },
      importAdvancedRules: (rules) => {
        setAdvancedRules(Array.isArray(rules) ? rules : []);
        setBuilderMode("advanced");
        setMode("visual");
      },
      applyTemplate: (key) => {
        applyTemplate(key);
        setMode("visual");
      },
      markCodeDirty: () => {
        setGeneratedDirty(true);
      },
    }),
    [handleRun, simpleRules, advancedRules, builderMode]
  );

  const modeTabsEl = (
    <div
      role="tablist"
      aria-label="Strategy builder steps"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        padding: "0 20px",
        background: "var(--color-background-secondary)",
      }}
    >
      <ModeTab id="tab-build-rules" active={mode === "visual"} onClick={goToBuildRules}>
        Build rules
      </ModeTab>
      <div
        style={{
          width: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-tertiary)",
          fontSize: 12,
        }}
        aria-hidden
      >
        →
      </div>
      <ModeTab id="tab-code" active={mode === "generated"} onClick={goToCode}>
        Code
        {generatedDirty ? (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#c8963e",
              display: "inline-block",
              marginLeft: 5,
              flexShrink: 0,
            }}
            title="Code differs from auto-generated rules output"
            aria-hidden
          />
        ) : null}
      </ModeTab>
    </div>
  );

  const paletteDetailEntry =
    paletteDetailType && GLOSSARY_ENTRIES[paletteDetailType] ? GLOSSARY_ENTRIES[paletteDetailType] : null;
  const paletteDetailIdx =
    paletteDetailType != null ? GLOSSARY_BLOCK_ORDER.indexOf(paletteDetailType) : -1;
  const paletteDetailDot = paletteDetailType ? glossaryCategoryDot(paletteDetailType) : "#888";
  const canPalettePrev = paletteDetailIdx > 0;
  const canPaletteNext = paletteDetailIdx >= 0 && paletteDetailIdx < GLOSSARY_BLOCK_ORDER.length - 1;

  const paletteFlyoutEl =
    paletteDetailType && paletteDetailEntry && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              type="button"
              className="palette-block-flyout-backdrop"
              aria-label="Close block details"
              onClick={() => setPaletteDetailType(null)}
            />
            <div
              className="palette-block-flyout palette-block-flyout--fixed"
              role="region"
              aria-label={`${paletteDetailEntry.title} — glossary`}
            >
              <div className="palette-block-flyout-close">
                <button type="button" aria-label="Close block details" onClick={() => setPaletteDetailType(null)}>
                  ×
                </button>
              </div>
              <div className="glossary-drawer-header-meta">
                <span className="glossary-drawer-cat-dot" style={{ background: paletteDetailDot }} aria-hidden />
                <span className="glossary-drawer-cat-label">{paletteDetailEntry.categoryLabel}</span>
              </div>
              <h2 className="glossary-drawer-title">{paletteDetailEntry.title}</h2>
              <div className="glossary-drawer-title-line" aria-hidden />

              <section className="glossary-drawer-section">
                <h3 className="glossary-drawer-h3">What it is</h3>
                <p className="glossary-drawer-p">{paletteDetailEntry.whatItIs}</p>
              </section>
              <section className="glossary-drawer-section">
                <h3 className="glossary-drawer-h3">How it works</h3>
                <pre className="glossary-drawer-code">{paletteDetailEntry.howItWorks}</pre>
              </section>
              <section className="glossary-drawer-section">
                <h3 className="glossary-drawer-h3">When to use it</h3>
                <p className="glossary-drawer-p">{paletteDetailEntry.whenToUse}</p>
              </section>
              <section className="glossary-drawer-section">
                <h3 className="glossary-drawer-h3">Signal interpretation</h3>
                <ul className="glossary-drawer-ul">
                  {paletteDetailEntry.signals.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>
              <section className="glossary-drawer-section">
                <h3 className="glossary-drawer-h3">Example chart</h3>
                <div className="glossary-drawer-chart-wrap">
                  <GlossaryExampleSvg type={paletteDetailType} />
                </div>
              </section>
              <section className="glossary-drawer-section">
                <h3 className="glossary-drawer-h3">Used in strategy</h3>
                {paletteDetailEntry.usedInTemplates.length ? (
                  <div className="glossary-drawer-pills">
                    {paletteDetailEntry.usedInTemplates.map((t) => (
                      <span key={t} className="glossary-drawer-pill">
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="glossary-drawer-muted">
                    Not used in the three example templates — combine freely in the builder.
                  </p>
                )}
              </section>

              <div className="glossary-drawer-nav">
                <button
                  type="button"
                  className="glossary-drawer-nav-btn"
                  disabled={!canPalettePrev}
                  onClick={() => canPalettePrev && setPaletteDetailType(GLOSSARY_BLOCK_ORDER[paletteDetailIdx - 1])}
                  aria-label="Previous block"
                >
                  ←
                </button>
                <span className="glossary-drawer-nav-pos">
                  {paletteDetailIdx + 1} of {GLOSSARY_BLOCK_ORDER.length}
                </span>
                <button
                  type="button"
                  className="glossary-drawer-nav-btn"
                  disabled={!canPaletteNext}
                  onClick={() => canPaletteNext && setPaletteDetailType(GLOSSARY_BLOCK_ORDER[paletteDetailIdx + 1])}
                  aria-label="Next block"
                >
                  →
                </button>
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  const paletteEl = (
    <div className="strategy-palette-shell">
      <aside
        className="block-palette block-palette--backtest"
        aria-label="Block palette"
        style={{
          background: "var(--color-background-primary)",
          borderRight: "0.5px solid var(--color-border-tertiary)",
          padding: "8px 0",
        }}
      >
        {PALETTE.map((cat) => {
          const isOpen = openCats[cat.key];
          return (
            <div key={cat.key}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => setOpenCats((prev) => ({ ...prev, [cat.key]: !prev[cat.key] }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpenCats((prev) => ({ ...prev, [cat.key]: !prev[cat.key] }));
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: cat.dot,
                    flexShrink: 0,
                    display: "block",
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                    flex: 1,
                  }}
                >
                  {cat.label}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.15s ease",
                  }}
                >
                  <path
                    d="M2 4l4 4 4-4"
                    stroke="var(--color-text-tertiary)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {isOpen ? (
                <div style={{ paddingBottom: 6 }}>
                  {cat.blocks.map((block) => {
                    const dot = glossaryCategoryDot(block.type);
                    const selected = paletteDetailType === block.type;
                    return (
                      <div
                        key={block.type}
                        role="button"
                        tabIndex={0}
                        draggable
                        className={`palette-block-tile${selected ? " palette-block-tile--selected" : ""}`}
                        style={{ "--palette-tile-accent": dot }}
                        aria-pressed={selected}
                        aria-label={`${block.label}. Click for details. Drag to use elsewhere.`}
                        onDragStart={(e) => onPaletteDragStart(e, block.type)}
                        onClick={() =>
                          setPaletteDetailType((t) => (t === block.type ? null : block.type))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setPaletteDetailType((t) => (t === block.type ? null : block.type));
                          }
                        }}
                      >
                        <span className="palette-block-tile-grip" aria-hidden />
                        <span style={{ flex: 1, minWidth: 0 }}>{block.label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div
                style={{
                  height: "0.5px",
                  background: "var(--color-border-tertiary)",
                  margin: "2px 0",
                }}
              />
            </div>
          );
        })}
      </aside>
    </div>
  );

  const visualPanelEl =
    mode === "visual" ? (
      <div
        style={{
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--color-background-primary)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            padding: "8px 16px",
            borderBottom: "0.5px solid var(--color-border-tertiary)",
          }}
        >
          {["simple", "advanced"].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setBuilderMode(m)}
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "4px 14px",
                borderRadius: 5,
                cursor: "pointer",
                border: "0.5px solid",
                borderColor: builderMode === m ? "var(--color-border-secondary)" : "transparent",
                background: builderMode === m ? "var(--color-background-secondary)" : "none",
                color: builderMode === m ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
              }}
            >
              {m === "simple" ? "Simple" : "Advanced"}
            </button>
          ))}
        </div>

        <div style={{ padding: 16 }}>
          {builderMode === "simple" ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {simpleRules.map((rule, i) => (
                  <div key={rule.id}>
                    {i > 0 ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 8px" }}>
                        <div style={{ flex: 1, height: "0.5px", background: "var(--color-border-tertiary)" }} />
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--color-text-tertiary)",
                            background: "var(--color-background-secondary)",
                            border: "0.5px solid var(--color-border-tertiary)",
                            borderRadius: 8,
                            padding: "2px 10px",
                          }}
                        >
                          independent rule
                        </span>
                        <div style={{ flex: 1, height: "0.5px", background: "var(--color-border-tertiary)" }} />
                      </div>
                    ) : null}
                    <SimpleRuleCard
                      rule={rule}
                      index={i}
                      onChange={(updated) => setSimpleRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)))}
                      onDelete={() => setSimpleRules((prev) => prev.filter((r) => r.id !== rule.id))}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {[
                  ["entry", "#2d8a55", "Entry rule"],
                  ["exit", "#c0392b", "Exit rule"],
                  ["risk", "#888", "Risk rule"],
                ].map(([type, color, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSimpleRules((prev) => [...prev, makeSimpleRule(type)])}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      border: "0.5px dashed var(--color-border-secondary)",
                      borderRadius: 8,
                      background: "none",
                      fontSize: 12,
                      color: "var(--color-text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: color, display: "block" }} />
                    + {label}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", textAlign: "center", padding: "10px 0 2px" }}>
                Need sequential logic or nested AND/OR?{" "}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setBuilderMode("advanced")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setBuilderMode("advanced");
                    }
                  }}
                  style={{
                    color: "var(--color-text-secondary)",
                    cursor: "pointer",
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                  }}
                >
                  Switch to Advanced →
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {advancedRules.map((rule, i) => (
                  <div key={rule.id}>
                    {i > 0 ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 8px" }}>
                        <div style={{ flex: 1, height: "0.5px", background: "var(--color-border-tertiary)" }} />
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--color-text-tertiary)",
                            background: "var(--color-background-secondary)",
                            border: "0.5px solid var(--color-border-tertiary)",
                            borderRadius: 8,
                            padding: "2px 10px",
                          }}
                        >
                          independent rule
                        </span>
                        <div style={{ flex: 1, height: "0.5px", background: "var(--color-border-tertiary)" }} />
                      </div>
                    ) : null}
                    <AdvancedRuleCard
                      rule={rule}
                      index={i}
                      onChange={(updated) =>
                        setAdvancedRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)))
                      }
                      onDelete={() => setAdvancedRules((prev) => prev.filter((r) => r.id !== rule.id))}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {[
                  ["entry", "#2d8a55", "Entry rule"],
                  ["exit", "#c0392b", "Exit rule"],
                  ["risk", "#888", "Risk rule"],
                ].map(([type, color, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAdvancedRules((prev) => [...prev, makeAdvancedRule(type)])}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      border: "0.5px dashed var(--color-border-secondary)",
                      borderRadius: 8,
                      background: "none",
                      fontSize: 12,
                      color: "var(--color-text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: color, display: "block" }} />
                    + {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <PlainEnglishBar
          sentences={builderMode === "simple" ? toPlainEnglishSimple(simpleRules) : toPlainEnglishAdvanced(advancedRules)}
        />
      </div>
    ) : null;

  const codePanelEl =
    mode === "generated" ? (
      <div
        className="backtest-builder-editor-shell"
        style={{
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--color-background-primary)",
        }}
      >
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderBottom: "0.5px solid var(--color-border-tertiary)",
              background: "var(--color-background-secondary)",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                padding: "2px 8px",
                borderRadius: 4,
                background: generatedDirty ? "#faeeda" : "var(--color-background-secondary)",
                color: generatedDirty ? "#633806" : "var(--color-text-tertiary)",
                border: `0.5px solid ${generatedDirty ? "#ef9f27" : "var(--color-border-secondary)"}`,
              }}
            >
              {generatedDirty ? "Edited manually" : "Auto-generated from rules"}
            </span>

            <div style={{ flex: 1 }} />

            {generatedDirty ? (
              <button
                type="button"
                onClick={() => {
                  const fresh = translateRulesToPython(simpleRules, advancedRules, builderMode, { ticker, start, end });
                  setCode(fresh);
                  setGeneratedDirty(false);
                }}
                style={{
                  fontSize: 11,
                  padding: "3px 10px",
                  border: "0.5px solid var(--color-border-secondary)",
                  borderRadius: 5,
                  background: "none",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                Reset to rules
              </button>
            ) : null}

            {onExpandEditor ? (
              <button
                type="button"
                onClick={onExpandEditor}
                style={{
                  fontSize: 11,
                  padding: "3px 10px",
                  border: "0.5px solid var(--color-border-secondary)",
                  borderRadius: 5,
                  background: "none",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                Expand editor
              </button>
            ) : null}
          </div>

          <div className="p-3 space-y-3">
            {importsBlock}
            <CodeMirror
              value={code}
              height="min(44vh, 440px)"
              theme="none"
              extensions={extensions}
              onChange={(val) => {
                setCode(val);
                setGeneratedDirty(true);
              }}
              basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: false }}
              className="overflow-hidden rounded-lg border border-ink/[0.08] text-left shadow-card-sm"
            />
          </div>
        </div>
      </div>
    ) : null;

  const panelEl = mode === "visual" ? visualPanelEl : codePanelEl;

  if (typeof renderLayout === "function") {
    return (
      <>
        {paletteFlyoutEl}
        {renderLayout({ mode, modeTabs: modeTabsEl, palette: paletteEl, panel: panelEl })}
        <GlossaryDrawer
          type={glossaryType}
          onClose={closeGlossary}
          onNavigate={setGlossaryType}
          onAddToCanvas={appendBlockFromGlossary}
        />
      </>
    );
  }

  return (
    <div className="strategy-builder-section">
      {paletteFlyoutEl}
      {modeTabsEl}
      {mode === "visual" ? <div className="backtest-builder-top-shell">{paletteEl}{visualPanelEl}</div> : null}
      {mode !== "visual" ? panelEl : null}

      <GlossaryDrawer
        type={glossaryType}
        onClose={closeGlossary}
        onNavigate={setGlossaryType}
        onAddToCanvas={appendBlockFromGlossary}
      />
    </div>
  );
});

export default StrategyBuilder;
