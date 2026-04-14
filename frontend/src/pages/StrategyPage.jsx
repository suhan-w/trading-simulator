import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";
import SectionHeading from "../components/SectionHeading";
import CardHeaderTitle from "../components/CardHeaderTitle";
import { EXAMPLES, EXAMPLE_MA_CROSSOVER } from "../data/exampleStrategies";
import StrategyBuilder from "../components/StrategyBuilder";
import { loadStrategyBasket, saveStrategyBasket } from "../constants/strategyBasketStorage";
import { STRATEGY_LOAD_PAYLOAD_KEY } from "../constants/strategyLoadPayload";

const STRATEGY_BASKET_MAX = 50;

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

function AvailableLibrariesBlock() {
  return (
    <div className="backtest-imports-card" aria-label="Available imports (read only)">
      <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#c8963e" }}>
        Read only · Available imports
      </p>
      <div className="mt-2.5 max-h-40 space-y-0.5 overflow-auto font-mono text-[12px] leading-relaxed text-white">
        <p className="m-0">import numpy as np</p>
        <p className="m-0">import pandas as pd</p>
        <p className="m-0">import yfinance as yf</p>
      </div>
    </div>
  );
}

export default function StrategyPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState(EXAMPLE_MA_CROSSOVER);
  const [ticker] = useState("CBA.AX");
  const [start] = useState(new Date(new Date().setFullYear(new Date().getFullYear() - 2)).toISOString().slice(0, 10));
  const [end] = useState(new Date().toISOString().slice(0, 10));
  const [basketOpen, setBasketOpen] = useState(false);
  const [basketItems, setBasketItems] = useState([]);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [codeExpandEditorPx, setCodeExpandEditorPx] = useState(560);
  const [codeImportVersion, setCodeImportVersion] = useState(0);
  const [visualSaveEligible, setVisualSaveEligible] = useState(false);
  const strategyBuilderRef = useRef(null);
  const [visualImport, setVisualImport] = useState(null);
  const extensions = useMemo(() => [python(), cowrieEditorTheme], []);

  useEffect(() => {
    setBasketItems(loadStrategyBasket());
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
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!editorExpanded) return undefined;
    const update = () => {
      const reserve = 132;
      const cap = Math.min(window.innerHeight * 0.94 - reserve, window.innerHeight - reserve);
      setCodeExpandEditorPx(Math.max(360, Math.floor(cap)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [editorExpanded]);

  useEffect(() => {
    if (!editorExpanded) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setEditorExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [editorExpanded]);

  const openBacktesting = useCallback(() => {
    try {
      sessionStorage.setItem(STRATEGY_LOAD_PAYLOAD_KEY, JSON.stringify({ code, visualBlocks: null }));
    } catch {
      // ignore
    }
    navigate("/backtesting");
  }, [code, navigate]);

  const saveCurrentToBasket = useCallback(() => {
    const defaultName = `Strategy ${basketItems.length + 1}`;
    const title = window.prompt("Name this strategy:", defaultName);
    if (title == null) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    if (basketItems.length >= STRATEGY_BASKET_MAX) {
      window.alert(
        `You can save at most ${STRATEGY_BASKET_MAX} strategies. Remove one from the basket first.`
      );
      return;
    }
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `st-${Date.now()}`;
    const next = [
      ...basketItems,
      { id, title: trimmed, code, savedAt: new Date().toISOString() },
    ];
    setBasketItems(next);
    saveStrategyBasket(next);
  }, [basketItems, code]);

  const removeBasketItem = useCallback((id) => {
    setBasketItems((prev) => {
      const next = prev.filter((x) => x.id !== id);
      saveStrategyBasket(next);
      return next;
    });
  }, []);

  const loadFromBasket = useCallback((item) => {
    setCode(item.code);
    setBasketOpen(false);
    setCodeImportVersion((v) => v + 1);
    setVisualSaveEligible(false);
  }, []);

  const openCodeEditorExpand = useCallback(() => {
    setEditorExpanded(true);
  }, []);

  return (
    <>
    <div className="space-y-6 md:space-y-8">
      <SectionHeading title="Strategy" subtitle="Build and organize your strategy logic here, then run it on Backtesting." />

      <div className="backtest-page-v2">
        <div className="cs-card backtest-strategy-card">
          <div className="cs-card-header pb-2">
            <CardHeaderTitle
              title="Strategy"
              tooltipText="Visual builder composes blocks into Python run(data). Generated and Raw tabs expose code; only yfinance, pandas, numpy, matplotlib are allowed in the sandbox."
              subtitle="Visual blocks, auto-generated Python, or raw run(data)."
            />
          </div>
          <div className="border-t border-ink/[0.06] px-2 pb-2 pt-3">
            <StrategyBuilder
              ref={strategyBuilderRef}
              code={code}
              setCode={setCode}
              importVersion={codeImportVersion}
              ticker={ticker}
              start={start}
              end={end}
              extensions={extensions}
              importsBlock={<AvailableLibrariesBlock />}
              onRun={() => {}}
              loading={false}
              onExpandEditor={openCodeEditorExpand}
              visualSaveEligible={visualSaveEligible}
              onRunAvailabilityChange={() => {}}
              visualImport={visualImport}
            />
          </div>
        </div>
        <div className="cs-card border border-[#ede9e3]">
          <div className="cs-card-header pb-2">
            <CardHeaderTitle title="Backtesting handoff" subtitle="Run and analyze this strategy on the Backtesting page." />
          </div>
          <div className="px-4 pb-4">
            <button type="button" className="cs-btn-buy w-full" onClick={openBacktesting}>
              Open in Backtesting
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[#ede9e3] bg-white shadow-card-sm">
          <button
            type="button"
            className="grid w-full grid-cols-[1fr_auto] items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-black/[0.02]"
            onClick={() => setBasketOpen((v) => !v)}
            aria-expanded={basketOpen}
            aria-controls="backtest-strategy-basket-panel"
            id="backtest-strategy-basket-toggle"
          >
            <span className="grid grid-cols-[auto_1fr] items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-[1px] bg-gold shadow-card-sm" aria-hidden />
              <span className="text-sm font-semibold text-ink">Strategy Basket</span>
            </span>
            <span className="font-mono text-sm font-medium text-muted" aria-hidden>
              {basketOpen ? "−" : "+"}
            </span>
          </button>
          {basketOpen && (
            <div
              id="backtest-strategy-basket-panel"
              role="region"
              aria-labelledby="backtest-strategy-basket-toggle"
              className="space-y-4 border-t border-ink/[0.06] bg-[#faf9f7] px-4 py-3"
            >
                <div className="space-y-2">
                  <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Save strategy
                  </p>
                  <button
                    type="button"
                    className="rounded-lg border border-gold/40 bg-white px-3 py-2 text-left text-sm font-semibold text-ink shadow-sm transition-colors hover:border-gold/60 hover:bg-[#fffefb]"
                    onClick={saveCurrentToBasket}
                  >
                    Save current code to basket…
                  </button>
                </div>
                <div className="space-y-2">
                  <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Built-in templates
                  </p>
                  <div className="backtest-example-pills">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        className="rounded-full border border-[#ede9e3] bg-white px-4 py-2 text-left text-sm font-medium text-black shadow-sm transition-colors hover:border-gold/45 hover:bg-white"
                        onClick={() => {
                          setCode(ex.code);
                          setBasketOpen(false);
                          setCodeImportVersion((v) => v + 1);
                          setVisualSaveEligible(false);
                        }}
                      >
                        {ex.title}
                      </button>
                    ))}
                  </div>
                </div>
                {basketItems.length > 0 ? (
                  <div className="space-y-2">
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Your basket
                    </p>
                    <div className="backtest-example-pills">
                      {basketItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex min-w-0 items-stretch overflow-hidden rounded-full border border-[#ede9e3] bg-white shadow-sm transition-colors hover:border-gold/45"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm font-medium text-black transition-colors hover:bg-white"
                            onClick={() => loadFromBasket(item)}
                          >
                            {item.title}
                          </button>
                          <button
                            type="button"
                            className="shrink-0 border-l border-[#ede9e3] px-2.5 text-base font-medium leading-none text-muted transition-colors hover:bg-black/[0.03] hover:text-ink"
                            aria-label={`Remove ${item.title} from basket`}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeBasketItem(item.id);
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
            )}
          </div>

      </div>
    </div>

    {editorExpanded &&
      createPortal(
        <div
          className="backtest-chart-expand-overlay"
          role="presentation"
          onClick={() => setEditorExpanded(false)}
        >
          <div
            className="backtest-chart-expand-dialog backtest-code-expand-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="backtest-code-expand-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="backtest-chart-expand-header">
              <h3 id="backtest-code-expand-title" className="backtest-chart-expand-title">
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
            <div className="backtest-code-expand-body">
              <CodeMirror
                value={code}
                height={`${codeExpandEditorPx}px`}
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
      )}
    </>
  );
}
