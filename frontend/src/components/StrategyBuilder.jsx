import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { translateVisualBlocksToPython, translateVisualBlocksToPythonWithDiagnostics } from "../utils/strategyBuilderTranslate";
import GlossaryDrawer from "./GlossaryDrawer";
import {
  VISUAL_SAVED_STRATEGIES_MAX,
  loadVisualStrategies,
  saveVisualStrategies,
} from "../constants/visualStrategyStorage";

/** @typedef {'visual' | 'generated' | 'raw'} BuilderMode */
/** @typedef {{ id: string, type: string, params?: Record<string, unknown>, x: number, y: number }} CanvasBlock */

const CANVAS_BLOCK_MIN_W = 200;
const CANVAS_BLOCK_MIN_H = 64;

function sortBlocksForCompile(blocks) {
  return [...blocks].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
}

function layoutColumn(blocks, x, y0, dy) {
  return blocks.map((b, i) => ({ ...b, x, y: y0 + i * dy }));
}

const COL = {
  data: "#c8963e",
  indicator: "#4a90d9",
  condition: "#7b68ee",
  action: "#2d8a55",
  risk: "#c0392b",
};

const TYPE_CAT = {
  select_stock: "data",
  select_date_range: "data",
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

const PALETTE = [
  {
    key: "data",
    label: "Data",
    dot: COL.data,
    blocks: [
      { type: "select_stock", label: "Select Stock" },
      { type: "select_date_range", label: "Select Date Range" },
    ],
  },
  {
    key: "indicator",
    label: "Indicator",
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
    label: "Condition",
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
    label: "Action",
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

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `b-${Date.now()}-${Math.random()}`;
}

function defaultParams(type) {
  switch (type) {
    case "sma":
      return { period: 20 };
    case "ema":
      return { period: 12 };
    case "rsi":
      return { period: 14 };
    case "bollinger":
      return { period: 20 };
    case "macd":
      return { fast: 12, slow: 26, signal: 9 };
    case "volume":
      return {};
    case "if_gt":
    case "if_lt":
      return { threshold: 50 };
    case "if_cross_above":
    case "if_cross_below":
    case "if_two_indicators_cross":
      return {};
    case "buy":
      return { mode: "all_cash", fixedAmount: 0.5, pctAmount: 100 };
    case "sell":
      return { mode: "all" };
    case "stop_loss":
      return { pct: 5 };
    case "take_profit":
      return { pct: 10 };
    case "max_position":
      return { pct: 25 };
    default:
      return {};
  }
}

function createBlock(type) {
  return { id: newId(), type, params: defaultParams(type), x: 48, y: 48 };
}

/** @param {{ type: string; params?: Record<string, unknown>; x?: number; y?: number }[]} blocks */
function cloneBlocksFromSaved(blocks) {
  return blocks.map((b, i) => ({
    id: newId(),
    type: b.type,
    params:
      b.params !== undefined && b.params !== null && typeof b.params === "object" && !Array.isArray(b.params)
        ? { ...b.params }
        : defaultParams(b.type),
    x: typeof b.x === "number" && !Number.isNaN(b.x) ? b.x : 32 + (i % 5) * 36,
    y: typeof b.y === "number" && !Number.isNaN(b.y) ? b.y : 32 + Math.floor(i / 5) * 80,
  }));
}

function templateMa() {
  return layoutColumn(
    [
      createBlock("select_stock"),
      createBlock("select_date_range"),
      { ...createBlock("sma"), params: { period: 20 } },
      { ...createBlock("sma"), params: { period: 50 } },
      createBlock("if_cross_above"),
      { ...createBlock("buy"), params: { mode: "all_cash" } },
      createBlock("if_cross_below"),
      { ...createBlock("sell"), params: { mode: "all" } },
    ],
    44,
    40,
    76
  );
}

function templateRsi() {
  return layoutColumn(
    [
      createBlock("select_stock"),
      createBlock("select_date_range"),
      { ...createBlock("rsi"), params: { period: 14 } },
      { ...createBlock("if_lt"), params: { threshold: 30 } },
      { ...createBlock("buy"), params: { mode: "all_cash" } },
      { ...createBlock("if_gt"), params: { threshold: 70 } },
      { ...createBlock("sell"), params: { mode: "all" } },
    ],
    44,
    40,
    76
  );
}

function templateBh() {
  return layoutColumn(
    [
      createBlock("select_stock"),
      createBlock("select_date_range"),
      { ...createBlock("buy"), params: { mode: "all_cash" } },
      createBlock("hold"),
    ],
    44,
    40,
    76
  );
}

function borderForType(type) {
  const c = TYPE_CAT[type] || "data";
  return COL[c];
}

/** @param {{ block: CanvasBlock; ticker: string; start: string; end: string; onChange: (p: Record<string, unknown>) => void }} props */
function BlockFields({ block, ticker, start, end, onChange }) {
  const p = block.params || {};
  const set = (k, v) => onChange({ ...p, [k]: v });

  switch (block.type) {
    case "select_stock":
      return (
        <span className="text-[12px] text-[#aaa]">
          Uses ticker <span className="font-mono text-ink">{ticker || "—"}</span>
        </span>
      );
    case "select_date_range":
      return (
        <span className="text-[12px] text-[#aaa]">
          Range <span className="font-mono text-ink">{start}</span> → <span className="font-mono text-ink">{end}</span>
        </span>
      );
    case "sma":
    case "ema":
      return (
        <label className="flex items-center gap-1 text-[12px] text-ink">
          <input
            type="number"
            min={1}
            max={500}
            value={Number(p.period) || 20}
            onChange={(e) => set("period", Number(e.target.value) || 1)}
          />
          <span>days</span>
        </label>
      );
    case "rsi":
      return (
        <label className="flex items-center gap-1 text-[12px] text-ink">
          <input
            type="number"
            min={2}
            max={100}
            value={Number(p.period) || 14}
            onChange={(e) => set("period", Number(e.target.value) || 14)}
          />
          <span>period</span>
        </label>
      );
    case "bollinger":
      return (
        <label className="flex items-center gap-1 text-[12px] text-ink">
          <input
            type="number"
            min={2}
            max={200}
            value={Number(p.period) || 20}
            onChange={(e) => set("period", Number(e.target.value) || 20)}
          />
          <span>period</span>
        </label>
      );
    case "macd":
      return (
        <span className="flex flex-wrap items-center gap-1 text-[11px] text-ink">
          <input type="number" min={1} max={50} value={Number(p.fast) || 12} onChange={(e) => set("fast", Number(e.target.value))} />
          <span>/</span>
          <input type="number" min={1} max={100} value={Number(p.slow) || 26} onChange={(e) => set("slow", Number(e.target.value))} />
          <span>/</span>
          <input type="number" min={1} max={50} value={Number(p.signal) || 9} onChange={(e) => set("signal", Number(e.target.value))} />
        </span>
      );
    case "volume":
      return <span className="text-[12px] text-[#aaa]">Volume series</span>;
    case "if_gt":
    case "if_lt":
      return (
        <label className="flex items-center gap-1 text-[12px] text-ink">
          <input
            type="number"
            value={Number(p.threshold) || 0}
            onChange={(e) => set("threshold", Number(e.target.value))}
          />
          <span>threshold</span>
        </label>
      );
    case "if_cross_above":
    case "if_cross_below":
    case "if_two_indicators_cross":
      return <span className="text-[12px] text-[#aaa]">Uses preceding indicators on canvas</span>;
    case "buy":
      return (
        <span className="flex flex-wrap items-center gap-2">
          <select
            value={(p.mode || "all_cash") === "fixed" ? "fixed" : (p.mode || "all_cash") === "pct" ? "pct" : "all_cash"}
            onChange={(e) => set("mode", e.target.value)}
          >
            <option value="all_cash">All cash</option>
            <option value="fixed">Fixed amount</option>
            <option value="pct">% of portfolio</option>
          </select>
          {(p.mode || "all_cash") === "fixed" ? (
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={Number(p.fixedAmount) || 0.5}
              onChange={(e) => set("fixedAmount", Number(e.target.value))}
              title="AUD (paper)"
            />
          ) : null}
          {(p.mode || "all_cash") === "pct" ? (
            <label className="flex items-center gap-1 text-[11px] text-[#aaa]">
              <input
                type="number"
                min={1}
                max={100}
                value={Number(p.pctAmount) || 100}
                onChange={(e) => set("pctAmount", Number(e.target.value))}
              />
              %
            </label>
          ) : null}
        </span>
      );
    case "sell":
      return (
        <select value={p.mode || "all"} onChange={(e) => set("mode", e.target.value)}>
          <option value="all">Sell all</option>
        </select>
      );
    case "hold":
      return <span className="text-[12px] text-[#aaa]">No trade</span>;
    case "stop_loss":
    case "take_profit":
    case "max_position":
      return (
        <label className="flex items-center gap-1 text-[12px] text-ink">
          <input type="number" min={0.1} max={100} step={0.1} value={Number(p.pct) || 5} onChange={(e) => set("pct", Number(e.target.value))} />
          <span>%</span>
        </label>
      );
    default:
      return null;
  }
}

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
 *   onRun: (overrideCode?: string, meta?: { source: "visual" | "generated" | "raw"; visualJson?: string }) => void | Promise<void>;
 *   loading: boolean;
 *   onExpandEditor?: () => void;
 *   visualSaveEligible?: boolean;
 *   onRunAvailabilityChange?: (state: { disabled: boolean }) => void;
 *   visualImport?: { version: number; blocks: CanvasBlock[] } | null;
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
    onExpandEditor,
    visualSaveEligible = false,
    onRunAvailabilityChange,
    visualImport = null,
  },
  ref
) {
  /** @type {BuilderMode} */
  const [mode, setMode] = useState("visual");
  /** @type {CanvasBlock[]} */
  const [canvasBlocks, setCanvasBlocks] = useState(() => []);
  /** @type {{ id: string; title: string; blocks: CanvasBlock[]; savedAt: string }[]} */
  const [savedVisualStrategies, setSavedVisualStrategies] = useState(() => loadVisualStrategies());
  /** @type {string | null} */
  const [glossaryType, setGlossaryType] = useState(null);
  const [openCats, setOpenCats] = useState(() => ({
    data: true,
    indicator: true,
    condition: true,
    action: true,
    risk: true,
  }));
  const [canvasDragOver, setCanvasDragOver] = useState(false);
  const [generatedDirty, setGeneratedDirty] = useState(false);
  const [generatedEditorText, setGeneratedEditorText] = useState("");
  const lastImportVersion = useRef(importVersion);

  const closeGlossary = useCallback(() => setGlossaryType(null), []);

  const appendBlockFromGlossary = useCallback((blockType) => {
    setCanvasBlocks((prev) => {
      const i = prev.length;
      const nb = createBlock(blockType);
      nb.x = 48 + (i % 6) * 16;
      nb.y = 48 + (i % 4) * 16;
      return [...prev, nb];
    });
    setGeneratedDirty(false);
  }, []);

  const sortedCanvasBlocks = useMemo(() => sortBlocksForCompile(canvasBlocks), [canvasBlocks]);

  /** In-flow min height so absolute blocks below the fold extend scrollable area (templates stack vertically). */
  const canvasInnerMinHeight = useMemo(() => {
    if (canvasBlocks.length === 0) return 280;
    const estBlockPx = 120;
    const pad = 64;
    const lowest = Math.max(...canvasBlocks.map((b) => (Number(b.y) || 0) + estBlockPx));
    return Math.max(280, lowest + pad);
  }, [canvasBlocks]);

  const { code: previewFromVisual, errors: strategyCompileErrors } = useMemo(
    () => translateVisualBlocksToPythonWithDiagnostics(sortedCanvasBlocks, { ticker, start, end }),
    [sortedCanvasBlocks, ticker, start, end]
  );

  useEffect(() => {
    if (mode === "generated" && !generatedDirty) {
      setGeneratedEditorText(previewFromVisual);
    }
  }, [previewFromVisual, mode, generatedDirty]);

  useEffect(() => {
    if (importVersion !== lastImportVersion.current) {
      lastImportVersion.current = importVersion;
      setMode("raw");
      setGeneratedDirty(false);
    }
  }, [importVersion]);

  const lastVisualImportVersion = useRef(0);
  useEffect(() => {
    const v = visualImport?.version ?? 0;
    if (!visualImport?.blocks?.length || v === lastVisualImportVersion.current) return;
    lastVisualImportVersion.current = v;
    const sorted = sortBlocksForCompile(cloneBlocksFromSaved(visualImport.blocks));
    setCanvasBlocks(sorted);
    setGeneratedDirty(false);
    const py = translateVisualBlocksToPython(sorted, { ticker, start, end });
    setCode(py);
    setMode("visual");
  }, [visualImport, ticker, start, end, setCode]);

  useEffect(() => {
    if (mode !== "visual") setGlossaryType(null);
  }, [mode]);

  const updateBlockParams = useCallback((id, params) => {
    setCanvasBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, params } : b)));
  }, []);

  const removeBlock = useCallback((id) => {
    setCanvasBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const canvasBoardRef = useRef(null);
  const blockDragRef = useRef(
    /** @type {null | { id: string; startClientX: number; startClientY: number; startBlockX: number; startBlockY: number }} */ (
      null
    )
  );

  const clampBlockToBoard = useCallback((x, y, boardW, boardH) => {
    const w = CANVAS_BLOCK_MIN_W;
    const h = CANVAS_BLOCK_MIN_H;
    const maxX = Math.max(0, boardW - w);
    const maxY = Math.max(0, boardH - h);
    return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
  }, []);

  const addPaletteBlockAt = useCallback(
    (type, clientX, clientY) => {
      const board = canvasBoardRef.current;
      if (!board) return;
      const rect = board.getBoundingClientRect();
      const rawX = clientX - rect.left - 24;
      const rawY = clientY - rect.top - 20;
      const { x, y } = clampBlockToBoard(rawX, rawY, rect.width, rect.height);
      const nb = createBlock(type);
      nb.x = x;
      nb.y = y;
      setCanvasBlocks((prev) => [...prev, nb]);
    },
    [clampBlockToBoard]
  );

  const clearDrag = () => setCanvasDragOver(false);

  const onPaletteDragStart = (e, type) => {
    e.dataTransfer.setData("application/x-cowrie-block", JSON.stringify({ source: "palette", type }));
    e.dataTransfer.effectAllowed = "copy";
  };

  const onCanvasDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes("application/x-cowrie-block") ? "copy" : "none";
    setCanvasDragOver(true);
  };

  const onCanvasDragLeave = () => setCanvasDragOver(false);

  const onCanvasBoardDrop = (e) => {
    e.preventDefault();
    setCanvasDragOver(false);
    const raw = e.dataTransfer.getData("application/x-cowrie-block");
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.source === "palette" && d.type) {
        addPaletteBlockAt(d.type, e.clientX, e.clientY);
      }
    } catch {
      /* ignore */
    }
  };

  const blockPointerHandlersRef = useRef({
    move: /** @param {PointerEvent} */ (e) => {
      const d = blockDragRef.current;
      if (!d) return;
      const board = canvasBoardRef.current;
      if (!board) return;
      const rect = board.getBoundingClientRect();
      const nx = d.startBlockX + (e.clientX - d.startClientX);
      const ny = d.startBlockY + (e.clientY - d.startClientY);
      const w = CANVAS_BLOCK_MIN_W;
      const h = CANVAS_BLOCK_MIN_H;
      const maxX = Math.max(0, rect.width - w);
      const maxY = Math.max(0, rect.height - h);
      const x = Math.min(Math.max(0, nx), maxX);
      const y = Math.min(Math.max(0, ny), maxY);
      setCanvasBlocks((prev) => prev.map((b) => (b.id === d.id ? { ...b, x, y } : b)));
    },
    up: () => {
      blockDragRef.current = null;
      const { move, up } = blockPointerHandlersRef.current;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    },
  });

  const onBlockPointerDown = useCallback((e, block) => {
    if (e.button !== 0) return;
    if (e.target instanceof Element) {
      if (e.target.closest(".delete-btn") || e.target.closest("input") || e.target.closest("select") || e.target.closest("option")) return;
    }
    e.preventDefault();
    e.stopPropagation();
    blockDragRef.current = {
      id: block.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBlockX: block.x,
      startBlockY: block.y,
    };
    const { move, up } = blockPointerHandlersRef.current;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, []);

  const applyTemplate = (key) => {
    if (key === "ma") setCanvasBlocks(templateMa());
    else if (key === "rsi") setCanvasBlocks(templateRsi());
    else setCanvasBlocks(templateBh());
    setGeneratedDirty(false);
  };

  const clearCanvas = useCallback(() => {
    setCanvasBlocks([]);
    setGeneratedDirty(false);
  }, []);

  const saveVisualLayout = useCallback(() => {
    if (!visualSaveEligible || canvasBlocks.length === 0) return;
    const defaultName = `Layout ${savedVisualStrategies.length + 1}`;
    const t = window.prompt("Name this block layout:", defaultName);
    if (t == null) return;
    const trimmed = t.trim();
    if (!trimmed) return;
    if (savedVisualStrategies.length >= VISUAL_SAVED_STRATEGIES_MAX) {
      window.alert(`You can save at most ${VISUAL_SAVED_STRATEGIES_MAX} layouts. Remove one first.`);
      return;
    }
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `vs-${Date.now()}`;
    const blocks = JSON.parse(JSON.stringify(canvasBlocks));
    const next = [...savedVisualStrategies, { id, title: trimmed, blocks, savedAt: new Date().toISOString() }];
    setSavedVisualStrategies(next);
    saveVisualStrategies(next);
  }, [visualSaveEligible, canvasBlocks, savedVisualStrategies]);

  const loadVisualLayout = useCallback(
    (item) => {
      const next = cloneBlocksFromSaved(item.blocks);
      setCanvasBlocks(next);
      setGeneratedDirty(false);
      setCode(translateVisualBlocksToPython(sortBlocksForCompile(next), { ticker, start, end }));
      setMode("visual");
    },
    [setCode, ticker, start, end]
  );

  const removeVisualLayout = useCallback((id) => {
    const victim = savedVisualStrategies.find((x) => x.id === id);
    if (!victim) return;
    if (!window.confirm(`Remove saved layout "${victim.title}"?`)) return;
    setSavedVisualStrategies((prev) => {
      const next = prev.filter((x) => x.id !== id);
      saveVisualStrategies(next);
      return next;
    });
  }, [savedVisualStrategies]);

  const handleMode = (m) => {
    if (m === "visual" && mode === "generated" && generatedDirty) {
      const ok = window.confirm(
        "You have manually edited the generated code. Switching to Visual Builder will reset these changes."
      );
      if (!ok) return;
      setGeneratedDirty(false);
    }
    if (m === "generated") {
      setGeneratedEditorText(previewFromVisual);
      setGeneratedDirty(false);
    }
    setMode(m);
  };

  const handleRun = useCallback(() => {
    if (mode === "visual") {
      const py = translateVisualBlocksToPython(sortedCanvasBlocks, { ticker, start, end });
      setCode(py);
      let visualJson;
      try {
        visualJson = JSON.stringify(sortedCanvasBlocks);
      } catch {
        visualJson = undefined;
      }
      void onRun(py, { source: "visual", visualJson });
      return;
    }
    if (mode === "generated") {
      setCode(generatedEditorText);
      void onRun(generatedEditorText, { source: "generated" });
      return;
    }
    void onRun(code, { source: "raw" });
  }, [mode, sortedCanvasBlocks, ticker, start, end, setCode, onRun, generatedEditorText, code]);

  const compileBlocksRunInvalid =
    strategyCompileErrors.length > 0 && (mode === "visual" || (mode === "generated" && !generatedDirty));

  const runDisabled =
    loading ||
    (mode === "visual" && canvasBlocks.length === 0) ||
    compileBlocksRunInvalid ||
    (mode === "generated" && !generatedEditorText.trim()) ||
    (mode === "raw" && !code.trim());

  useEffect(() => {
    onRunAvailabilityChange?.({ disabled: runDisabled });
  }, [runDisabled, onRunAvailabilityChange]);

  useImperativeHandle(
    ref,
    () => ({
      runBacktest: () => {
        void handleRun();
      },
    }),
    [handleRun]
  );

  const copyGenerated = () => {
    void navigator.clipboard.writeText(mode === "generated" ? generatedEditorText : previewFromVisual);
  };

  return (
    <div className="strategy-builder-section">
      <div className="strategy-builder-mode-row">
        <div className="strategy-mode-flow min-w-0 flex-1" role="tablist" aria-label="Strategy editor mode">
          <span className="strategy-mode-flow-label strategy-mode-flow-label--builder">Strategy Builder</span>
          <span className="strategy-mode-flow-label strategy-mode-flow-label--editor">Editor</span>
          <div className="strategy-mode-flow-builder">
            <div className="strategy-mode-builder-pair">
              <button
                type="button"
                role="tab"
                className={`strategy-mode-tab strategy-mode-tab-visual${mode === "visual" ? " strategy-mode-tab-visual--active" : ""}`}
                aria-selected={mode === "visual"}
                title="Build your strategy using blocks — no coding needed"
                onClick={() => handleMode("visual")}
              >
                Visual Builder
              </button>
              <button
                type="button"
                role="tab"
                className={`strategy-mode-tab strategy-mode-tab-generated${mode === "generated" ? " strategy-mode-tab-generated--active" : ""}`}
                aria-selected={mode === "generated"}
                title="See the Python code generated from your blocks"
                onClick={() => handleMode("generated")}
              >
                <span className="strategy-mode-tab-generated-label">Generated Code</span>
                {!generatedDirty ? (
                  <span className="strategy-mode-sync-dot" title="Generated code matches your blocks" aria-hidden />
                ) : null}
              </button>
            </div>
          </div>
          <span className="strategy-mode-flow-arrow" aria-hidden>
            →
          </span>
          <div className="strategy-mode-flow-editor">
            <button
              type="button"
              role="tab"
              className={`strategy-mode-tab strategy-mode-tab-raw${mode === "raw" ? " strategy-mode-tab-raw--active" : ""}`}
              aria-selected={mode === "raw"}
              title="Write or edit Python directly for full control"
              onClick={() => handleMode("raw")}
            >
              <span>Raw Python</span>
              <span className="strategy-mode-advanced-pill">Advanced</span>
            </button>
          </div>
        </div>
      </div>

      {mode === "visual" && (
        <div className="backtest-builder-top-shell">
          <aside className="block-palette block-palette--backtest" aria-label="Block palette">
            {PALETTE.map((cat) => (
              <div key={cat.key}>
                <button
                  type="button"
                  className="category-header w-full border-0 bg-transparent p-0 text-left"
                  onClick={() => setOpenCats((o) => ({ ...o, [cat.key]: !o[cat.key] }))}
                  aria-expanded={openCats[cat.key]}
                >
                  <span className="category-dot" style={{ background: cat.dot }} />
                  {cat.label}
                </button>
                {openCats[cat.key] ? (
                  <div>
                    {cat.blocks.map((b) => (
                      <div
                        key={b.type}
                        className="palette-block palette-block--row"
                        style={{ borderLeftColor: cat.dot }}
                        draggable
                        onDragStart={(e) => {
                          const t = e.target;
                          if (t instanceof Element && t.closest(".glossary-palette-info")) {
                            e.preventDefault();
                            return;
                          }
                          onPaletteDragStart(e, b.type);
                        }}
                        onDragEnd={clearDrag}
                      >
                        <span className="palette-block-label">{b.label}</span>
                        <button
                          type="button"
                          className="glossary-palette-info"
                          aria-label={`Open glossary: ${b.label}`}
                          draggable={false}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setGlossaryType(b.type);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          i
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </aside>

          <div className="backtest-builder-right-column">
            <div className="backtest-canvas-toolbar">
              <button
                type="button"
                className="strategy-clear-canvas-btn strategy-clear-canvas-btn--toolbar"
                onClick={clearCanvas}
                disabled={canvasBlocks.length === 0}
                aria-label="Clear all blocks from the canvas"
              >
                Clear canvas
              </button>
              <div className="backtest-canvas-toolbar-templates">
                <div className="strategy-canvas-templates__block strategy-canvas-templates__block--inline">
                  <p className="strategy-canvas-templates__label">My strategies</p>
                  <div className="strategy-canvas-templates__row flex flex-wrap items-center gap-2">
                    {savedVisualStrategies.length === 0 ? (
                      <span className="text-[11px] leading-snug text-[#999]">None yet — save after a successful run.</span>
                    ) : null}
                    {savedVisualStrategies.map((s) => (
                      <div key={s.id} className="visual-saved-chip">
                        <button
                          type="button"
                          className="template-btn template-btn--saved"
                          onClick={() => loadVisualLayout(s)}
                          title={`Load saved layout “${s.title}”`}
                        >
                          {s.title}
                        </button>
                        <button
                          type="button"
                          className="visual-saved-remove"
                          aria-label={`Remove saved layout ${s.title}`}
                          onClick={() => removeVisualLayout(s.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {visualSaveEligible && canvasBlocks.length > 0 ? (
                      <button type="button" className="template-btn template-btn--save" onClick={saveVisualLayout}>
                        Save layout…
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="strategy-canvas-templates__block strategy-canvas-templates__block--inline">
                  <p className="strategy-canvas-templates__label">Examples</p>
                  <div className="strategy-canvas-templates__row flex flex-wrap gap-2">
                    <button type="button" className="template-btn" onClick={() => applyTemplate("ma")}>
                      Moving Average Crossover
                    </button>
                    <button type="button" className="template-btn" onClick={() => applyTemplate("rsi")}>
                      RSI Overbought/Oversold
                    </button>
                    <button type="button" className="template-btn" onClick={() => applyTemplate("bh")}>
                      Buy and Hold
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {strategyCompileErrors.length > 0 ? (
              <div
                className="strategy-compile-errors mb-2 shrink-0 rounded-lg border px-3 py-2 text-[12px] leading-snug"
                role="alert"
              >
                <p className="m-0 mb-1 font-semibold text-ink">This layout cannot run yet</p>
                <ul className="m-0 list-disc pl-5 text-[#5c5348]">
                  {strategyCompileErrors.map((err, i) => (
                    <li key={`${i}-${err}`}>{err}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="strategy-canvas strategy-canvas--2d">
              <div
                className={`canvas-board-2d ${canvasDragOver ? "canvas-board-2d--drag-active" : ""}`}
                onDragOver={onCanvasDragOver}
                onDragLeave={onCanvasDragLeave}
                onDrop={onCanvasBoardDrop}
                onDragEnd={clearDrag}
              >
                <div
                  ref={canvasBoardRef}
                  className="canvas-board-2d-inner"
                  style={{ minHeight: canvasInnerMinHeight }}
                >
                  <span className="canvas-zone-label canvas-zone-label--entry" aria-hidden>
                    ENTRY CONDITIONS
                  </span>
                  <span className="canvas-zone-label canvas-zone-label--exit" aria-hidden>
                    EXIT CONDITIONS
                  </span>
                  <span className="canvas-zone-label canvas-zone-label--risk" aria-hidden>
                    RISK RULES
                  </span>
                  {canvasBlocks.length === 0 ? (
                    <div className="strategy-canvas-empty strategy-canvas-empty--2d">
                      <span className="strategy-canvas-empty-icon" aria-hidden />
                      <p className="m-0 text-[13px] text-[#aaa]">Drag blocks from the palette to place them on the canvas</p>
                    </div>
                  ) : null}
                  {canvasBlocks.map((b) => (
                    <div
                      key={b.id}
                      className="canvas-block canvas-block--free"
                      style={{
                        left: b.x,
                        top: b.y,
                        borderLeftColor: borderForType(b.type),
                      }}
                      onPointerDown={(e) => onBlockPointerDown(e, b)}
                    >
                      <span className="canvas-block-free-title">{PALETTE_LABELS[b.type] || b.type}</span>
                      <div className="canvas-block-free-fields">
                        <BlockFields
                          block={b}
                          ticker={ticker}
                          start={start}
                          end={end}
                          onChange={(params) => updateBlockParams(b.id, params)}
                        />
                      </div>
                      <button
                        type="button"
                        className="delete-btn"
                        aria-label="Remove block"
                        onClick={() => removeBlock(b.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === "generated" && (
        <div className="backtest-builder-editor-shell">
        <div className="strategy-generated-panel rounded-[14px] border border-[#ede9e3] bg-white p-4">
          {generatedDirty ? (
            <div
              className="mb-3 rounded-lg border px-3 py-2 text-[12px]"
              style={{ background: "#fdf8f0", borderColor: "#e8d5b0", color: "#111" }}
            >
              You have manually edited the generated code. Switching to Visual Builder will reset these changes.
            </div>
          ) : null}
          {!generatedDirty && strategyCompileErrors.length > 0 ? (
            <div
              className="strategy-compile-errors mb-3 rounded-lg border px-3 py-2 text-[12px] leading-snug"
              role="alert"
            >
              <p className="m-0 mb-1 font-semibold text-ink">Fix the visual canvas to regenerate runnable code</p>
              <ul className="m-0 list-disc pl-5 text-[#5c5348]">
                {strategyCompileErrors.map((err, i) => (
                  <li key={`${i}-${err}`}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mb-2 flex justify-end gap-2">
            <button
              type="button"
              className="strategy-copy-code-btn rounded-lg px-3 py-1.5 text-[11px] font-semibold"
              onClick={copyGenerated}
            >
              Copy Code
            </button>
            <button
              type="button"
              className="rounded-lg border border-ink/[0.12] bg-[#f5f3ef] px-3 py-1.5 text-[11px] font-semibold text-ink"
              onClick={() => {
                setGeneratedEditorText(previewFromVisual);
                setGeneratedDirty(false);
              }}
            >
              Reset to Visual
            </button>
          </div>
          <CodeMirror
            value={generatedEditorText}
            height="min(44vh, 420px)"
            theme="none"
            extensions={extensions}
            onChange={(v) => {
              setGeneratedEditorText(v);
              setGeneratedDirty(true);
            }}
            basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: false }}
            className="overflow-hidden rounded-lg border border-ink/[0.08] text-left shadow-card-sm"
          />
        </div>
        </div>
      )}

      {mode === "raw" && (
        <div className="backtest-builder-editor-shell">
        <div className="strategy-raw-panel rounded-[14px] border border-[#ede9e3] bg-white p-4">
          <div className="mb-2 flex justify-end gap-2">
            {onExpandEditor ? (
              <button
                type="button"
                className="rounded-lg border border-ink/[0.12] bg-white px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted shadow-card-sm transition-colors hover:border-gold/40 hover:text-ink"
                onClick={onExpandEditor}
              >
                Expand editor
              </button>
            ) : null}
          </div>
          <div className="space-y-3">
            {importsBlock}
            <CodeMirror
              value={code}
              height="min(44vh, 440px)"
              theme="none"
              extensions={extensions}
              onChange={setCode}
              basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: false }}
              className="overflow-hidden rounded-lg border border-ink/[0.08] text-left shadow-card-sm"
            />
          </div>
        </div>
        </div>
      )}

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
