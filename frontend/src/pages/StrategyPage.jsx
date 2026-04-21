import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { EditorView } from "@codemirror/view";
import { python } from "@codemirror/lang-python";
import CodeMirror from "@uiw/react-codemirror";
import SectionHeading from "../components/SectionHeading";
import { EXAMPLE_MA_CROSSOVER } from "../data/exampleStrategies";
import StrategyBuilder from "../components/StrategyBuilder";
import PlainEnglishBar, { toPlainEnglishAdvanced, toPlainEnglishSimple } from "../components/strategyBuilder/PlainEnglishBar";
import { STRATEGY_LOAD_PAYLOAD_KEY } from "../constants/strategyLoadPayload";
import { loadVisualStrategies, saveVisualStrategies, VISUAL_SAVED_STRATEGIES_MAX } from "../constants/visualStrategyStorage";

const DEFAULT_TICKER = "CBA.AX";
const DEFAULT_START = new Date(new Date().setFullYear(new Date().getFullYear() - 2)).toISOString().slice(0, 10);
const DEFAULT_END = new Date().toISOString().slice(0, 10);

const cowrieEditorTheme = EditorView.theme(
  {
    "&": { minHeight: "min(52vh, 520px)", backgroundColor: "#ffffff", color: "#111111" },
    ".cm-scroller": { fontFamily: "JetBrains Mono, ui-monospace, monospace", overflow: "auto" },
    ".cm-content, .cm-gutter": { fontSize: "13px", lineHeight: "1.5" },
    ".cm-gutters": {
      backgroundColor: "#f5f3ef",
      color: "#aaaaaa",
      borderRight: "1px solid rgba(17,17,17,0.06)",
    },
  },
  { dark: false }
);

export default function StrategyPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState(EXAMPLE_MA_CROSSOVER);
  const [codeImportVersion, setCodeImportVersion] = useState(0);
  const strategyBuilderRef = useRef(null);
  const [savedStrategies, setSavedStrategies] = useState(() => loadVisualStrategies());
  const [activeStrategyName, setActiveStrategyName] = useState("Untitled strategy");
  const extensions = useMemo(() => [python(), cowrieEditorTheme], []);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  const [expandedGraph, setExpandedGraph] = useState(null);

  useEffect(() => {
    setSavedStrategies(loadVisualStrategies());
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STRATEGY_LOAD_PAYLOAD_KEY);
      if (!raw) return;
      sessionStorage.removeItem(STRATEGY_LOAD_PAYLOAD_KEY);
      const p = JSON.parse(raw);
      if (typeof p?.code === "string" && p.code.trim()) {
        setCode(p.code);
        setCodeImportVersion((v) => v + 1);
      }
      if (typeof p?.strategyName === "string" && p.strategyName.trim()) setActiveStrategyName(p.strategyName.trim());
    } catch {
      /* ignore */
    }
  }, []);

  const openBacktesting = useCallback(() => {
    try {
      sessionStorage.setItem(
        STRATEGY_LOAD_PAYLOAD_KEY,
        JSON.stringify({ code, visualBlocks: null, source: "strategy", strategyName: activeStrategyName })
      );
    } catch {
      // ignore
    }
    navigate("/backtesting");
  }, [code, activeStrategyName, navigate]);

  const saveCurrentStrategy = useCallback(() => {
    const builder = strategyBuilderRef.current;
    if (!builder) {
      return { ok: false, reason: "Strategy builder not ready." };
    }
    const mode = builder.getBuilderMode?.() || "unified";
    const rules = builder.getRules?.() || (mode === "advanced" ? builder.getAdvancedRules?.() : builder.getSimpleRules?.());
    if (!Array.isArray(rules) || rules.length === 0) {
      return { ok: false, reason: "Add at least one rule before saving." };
    }
    if (savedStrategies.length >= VISUAL_SAVED_STRATEGIES_MAX) {
      return { ok: false, reason: `You can save at most ${VISUAL_SAVED_STRATEGIES_MAX} strategies. Remove one first.` };
    }
    const baseName = activeStrategyName && activeStrategyName !== "Untitled strategy"
      ? activeStrategyName
      : `Strategy ${savedStrategies.length + 1}`;
    const existing = new Set(savedStrategies.map((s) => (s.title || "").trim().toLowerCase()));
    let trimmed = baseName.trim();
    if (existing.has(trimmed.toLowerCase())) {
      let n = 2;
      while (existing.has(`${trimmed} (${n})`.toLowerCase())) n += 1;
      trimmed = `${trimmed} (${n})`;
    }
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `vs-${Date.now()}`;
    const next = [
      ...savedStrategies,
      { id, title: trimmed, blocks: [], savedAt: new Date().toISOString(), builderMode: mode, rules },
    ];
    setSavedStrategies(next);
    saveVisualStrategies(next);
    setActiveStrategyName(trimmed);
    return { ok: true, title: trimmed };
  }, [savedStrategies, activeStrategyName]);

  useEffect(() => {
    if (!editorExpanded && !canvasExpanded) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setEditorExpanded(false);
        setCanvasExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [editorExpanded, canvasExpanded]);

  return (
    <div className="space-y-6 md:space-y-8">
      <SectionHeading
        title="Strategy"
        subtitle="Build and save strategies. When you’re ready, hand off to Backtesting."
        tooltipText="This page is for building and saving strategies only. When you’re ready, use “Open in Backtesting” to run it against historical data."
      />

      <StrategyBuilder
        ref={strategyBuilderRef}
        code={code}
        setCode={setCode}
        importVersion={codeImportVersion}
        ticker={DEFAULT_TICKER}
        start={DEFAULT_START}
        end={DEFAULT_END}
        extensions={extensions}
        importsBlock={null}
        onRun={() => {}}
        loading={false}
        onRunAvailabilityChange={() => {}}
        // visualImport no longer used by the rule builder
        onExpandEditor={() => setEditorExpanded(true)}
        onExpandCanvas={() => {
          const b = strategyBuilderRef.current;
          const mode = b?.getBuilderMode ? b.getBuilderMode() : "simple";
          const rules = mode === "advanced" ? b?.getAdvancedRules?.() : b?.getSimpleRules?.();
          setExpandedGraph({ mode, rules });
          setCanvasExpanded(true);
        }}
        hideDataConfigFields
        hideSavedStrategiesToolbar
        autoSyncCodeFromVisual
        onOpenBacktesting={openBacktesting}
        onSaveStrategy={saveCurrentStrategy}
        renderLayout={({ panel }) => (
          <div className="strategy-page">
            <div className="strategy-page-right">{panel}</div>
          </div>
        )}
      />

      {editorExpanded
        ? createPortal(
            <div className="backtest-chart-expand-overlay" role="presentation" onClick={() => setEditorExpanded(false)}>
              <div
                className="backtest-chart-expand-dialog backtest-code-expand-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="strategy-code-expand-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="backtest-chart-expand-header">
                  <h3 id="strategy-code-expand-title" className="backtest-chart-expand-title">
                    Strategy code
                  </h3>
                  <button
                    type="button"
                    className="backtest-chart-expand-close"
                    onClick={() => setEditorExpanded(false)}
                    aria-label="Close expanded editor"
                  >
                    ×
                  </button>
                </div>
                <div className="backtest-chart-expand-body">
                  <CodeMirror
                    value={code}
                    height="min(82vh, 820px)"
                    theme="none"
                    extensions={extensions}
                    onChange={(v) => {
                      setCode(v);
                      strategyBuilderRef.current?.markCodeDirty?.();
                    }}
                    basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: false }}
                    className="overflow-hidden rounded-lg border border-ink/[0.08] text-left shadow-card-sm"
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {canvasExpanded
        ? createPortal(
            <div className="backtest-chart-expand-overlay" role="presentation" onClick={() => setCanvasExpanded(false)}>
              <div
                className="backtest-chart-expand-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="strategy-canvas-expand-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="backtest-chart-expand-header">
                  <h3 id="strategy-canvas-expand-title" className="backtest-chart-expand-title">
                    Strategy canvas
                  </h3>
                  <button
                    type="button"
                    className="backtest-chart-expand-close"
                    onClick={() => setCanvasExpanded(false)}
                    aria-label="Close expanded canvas"
                  >
                    ×
                  </button>
                </div>
                <div className="backtest-chart-expand-body" style={{ overflow: "auto" }}>
                  <div
                    style={{
                      position: "relative",
                      width: "1400px",
                      height: "1100px",
                      minWidth: "100%",
                      minHeight: "80vh",
                      borderRadius: 14,
                      border: "1px solid #ede9e3",
                      background: "#fff",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ padding: 14 }}>
                      <PlainEnglishBar
                        sentences={
                          expandedGraph?.mode === "advanced"
                            ? toPlainEnglishAdvanced(expandedGraph?.rules || [])
                            : toPlainEnglishSimple(expandedGraph?.rules || [])
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
