import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { EditorView } from "@codemirror/view";
import { python } from "@codemirror/lang-python";
import CodeMirror from "@uiw/react-codemirror";
import SectionHeading from "../components/SectionHeading";
import { EXAMPLE_MA_CROSSOVER } from "../data/exampleStrategies";
import StrategyBuilder from "../components/StrategyBuilder";
import NodeGraphCanvas from "../components/NodeGraphCanvas";
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
  const [visualImport, setVisualImport] = useState(null);
  const [basketOpen, setBasketOpen] = useState(true);
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
      if (p?.visualBlocks && Array.isArray(p.visualBlocks) && p.visualBlocks.length > 0) {
        setVisualImport({ version: Date.now(), blocks: p.visualBlocks });
      } else if (typeof p?.code === "string" && p.code.trim()) {
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
    if (!builder?.getCanvasBlocks) {
      window.alert("Strategy builder not ready.");
      return;
    }
    const blocks = builder.getCanvasBlocks();
    if (!Array.isArray(blocks) || blocks.length === 0) {
      window.alert("Add blocks to the canvas before saving.");
      return;
    }
    if (savedStrategies.length >= VISUAL_SAVED_STRATEGIES_MAX) {
      window.alert(`You can save at most ${VISUAL_SAVED_STRATEGIES_MAX} strategies. Remove one first.`);
      return;
    }
    const defaultName = `Strategy ${savedStrategies.length + 1}`;
    const title = window.prompt("Name this strategy:", defaultName);
    if (title == null) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `vs-${Date.now()}`;
    const next = [...savedStrategies, { id, title: trimmed, blocks, savedAt: new Date().toISOString() }];
    setSavedStrategies(next);
    saveVisualStrategies(next);
    setActiveStrategyName(trimmed);
  }, [savedStrategies]);

  const removeSavedStrategy = useCallback(
    (id) => {
      const victim = savedStrategies.find((x) => x.id === id);
      if (!victim) return;
      if (!window.confirm(`Remove saved strategy "${victim.title}"?`)) return;
      const next = savedStrategies.filter((x) => x.id !== id);
      setSavedStrategies(next);
      saveVisualStrategies(next);
    },
    [savedStrategies]
  );

  const loadSavedStrategy = useCallback((item) => {
    const builder = strategyBuilderRef.current;
    if (!builder?.importCanvasBlocks) return;
    builder.importCanvasBlocks(item.blocks);
    setActiveStrategyName(item.title);
    setBasketOpen(false);
  }, []);

  const applyTemplate = useCallback((key, name) => {
    const builder = strategyBuilderRef.current;
    if (!builder?.applyTemplate) return;
    builder.applyTemplate(key);
    setActiveStrategyName(name);
  }, []);

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
        visualImport={visualImport}
        onExpandEditor={() => setEditorExpanded(true)}
        onExpandCanvas={() => {
          const b = strategyBuilderRef.current;
          const gs = b?.getGraphState ? b.getGraphState() : null;
          setExpandedGraph(gs);
          setCanvasExpanded(true);
        }}
        hideDataConfigFields
        hideSavedStrategiesToolbar
        autoSyncCodeFromVisual
        renderLayout={({ modeTabs, palette, panel }) => (
          <div className="strategy-page">
            <div className="strategy-page-left">{palette}</div>
            <div className="strategy-page-right">
              {modeTabs}
              {panel}

              <div className="strategy-basket-card">
                <button
                  type="button"
                  className="strategy-basket-toggle"
                  onClick={() => setBasketOpen((v) => !v)}
                  aria-expanded={basketOpen}
                  aria-controls="strategy-basket-panel"
                  id="strategy-basket-toggle"
                >
                  <span className="grid grid-cols-[auto_1fr] items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-[1px] bg-gold shadow-card-sm" aria-hidden />
                    <span className="text-sm font-semibold text-ink">Strategy Basket</span>
                  </span>
                  <span className="font-mono text-sm font-medium text-muted" aria-hidden>
                    {basketOpen ? "−" : "+"}
                  </span>
                </button>
                {basketOpen ? (
                  <div
                    id="strategy-basket-panel"
                    role="region"
                    aria-labelledby="strategy-basket-toggle"
                    className="strategy-basket-panel"
                  >
                    <div className="space-y-2">
                      <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">Save strategy</p>
                      <button type="button" className="strategy-basket-save" onClick={saveCurrentStrategy}>
                        Save current strategy…
                      </button>
                    </div>

                    <div className="space-y-2">
                      <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">Built-in templates</p>
                      <div className="backtest-example-pills">
                        <button type="button" className="strategy-pill" onClick={() => applyTemplate("ma", "Moving Average Crossover")}>
                          Moving Average Crossover
                        </button>
                        <button type="button" className="strategy-pill" onClick={() => applyTemplate("rsi", "RSI Overbought/Oversold")}>
                          RSI Overbought/Oversold
                        </button>
                        <button type="button" className="strategy-pill" onClick={() => applyTemplate("bh", "Buy and Hold")}>
                          Buy and Hold
                        </button>
                      </div>
                    </div>

                    {savedStrategies.length > 0 ? (
                      <div className="space-y-2">
                        <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">Saved strategies</p>
                        <div className="backtest-example-pills">
                          {savedStrategies.map((item) => (
                            <div key={item.id} className="strategy-pill-row">
                              <button type="button" className="strategy-pill strategy-pill--saved" onClick={() => loadSavedStrategy(item)}>
                                {item.title}
                              </button>
                              <button
                                type="button"
                                className="strategy-pill-remove"
                                aria-label={`Remove ${item.title}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSavedStrategy(item.id);
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="strategy-handoff-card">
                <div>
                  <p className="m-0 text-[15px] font-medium text-ink">Ready to test?</p>
                  <p className="m-0 mt-1 text-[12px] text-muted">
                    Send this strategy to Backtesting to run against historical data.
                  </p>
                </div>
                <button type="button" className="strategy-handoff-btn" onClick={openBacktesting}>
                  Open in Backtesting →
                </button>
              </div>
            </div>
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
                    onChange={setCode}
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
                    <NodeGraphCanvas
                      blocks={expandedGraph?.blocks || []}
                      edges={expandedGraph?.edges || []}
                      connectors={expandedGraph?.connectors || []}
                      wiringFrom={null}
                      mousePos={{ x: 0, y: 0 }}
                      onBlockPointerDown={() => {}}
                      onPortPointerDown={() => {}}
                      onPortPointerUp={() => {}}
                      onEdgeDelete={() => {}}
                      onConnectorDelete={() => {}}
                      onConnectorDragStart={() => {}}
                      BlockFieldsComponent={null}
                      onBlockDelete={() => {}}
                      onBlockParamChange={() => {}}
                    />
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
