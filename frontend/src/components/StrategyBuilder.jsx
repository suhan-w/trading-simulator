import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { translateVisualBlocksToPython, translateVisualBlocksToPythonWithDiagnostics } from "../utils/strategyBuilderTranslate";
import GlossaryDrawer from "./GlossaryDrawer";
import NodeGraphCanvas from "./NodeGraphCanvas";
import {
  VISUAL_SAVED_STRATEGIES_MAX,
  loadVisualStrategies,
  saveVisualStrategies,
} from "../constants/visualStrategyStorage";

/** @typedef {'visual' | 'generated' | 'raw'} BuilderMode */
/** @typedef {{ id: string, type: string, params?: Record<string, unknown>, x: number, y: number }} CanvasBlock */

const CANVAS_BLOCK_MIN_W = 160;
const CANVAS_BLOCK_MIN_H = 56;

function sortBlocksForCompile(blocks) {
  return [...blocks].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
}

function topoSortBlocks(blocks, edges) {
  if (!edges || edges.length === 0) {
    // No edges — fall back to visual top-to-bottom order
    return [...blocks].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
  }

  // Build adjacency: fromNodeId -> [toNodeId, ...]
  const adj = {};
  const inDegree = {};
  blocks.forEach((b) => {
    adj[b.id] = [];
    inDegree[b.id] = 0;
  });

  edges.forEach((e) => {
    // Only count block-to-block edges (skip connector nodes)
    if (adj[e.fromNodeId] !== undefined && inDegree[e.toNodeId] !== undefined) {
      adj[e.fromNodeId].push(e.toNodeId);
      inDegree[e.toNodeId] = (inDegree[e.toNodeId] || 0) + 1;
    }
  });

  // Kahn's algorithm
  const queue = blocks
    .filter((b) => (inDegree[b.id] || 0) === 0)
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0)); // tie-break by Y
  const result = [];
  const visited = new Set();

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || visited.has(node.id)) continue;
    visited.add(node.id);
    result.push(node);
    (adj[node.id] || []).forEach((nextId) => {
      inDegree[nextId]--;
      if (inDegree[nextId] === 0) {
        const nextBlock = blocks.find((b) => b.id === nextId);
        if (nextBlock) queue.push(nextBlock);
      }
    });
  }

  // Append any unvisited blocks (disconnected islands) sorted by Y
  blocks.forEach((b) => {
    if (!visited.has(b.id)) result.push(b);
  });

  return result;
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
  select_data: "data",
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
    label: "DATA",
    dot: COL.data,
    blocks: [{ type: "select_data", label: "Stock & date range" }],
  },
  {
    key: "indicator",
    label: "INDICATOR",
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
    label: "CONDITION",
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
    label: "ACTION",
    dot: COL.action,
    blocks: [
      { type: "buy", label: "BUY" },
      { type: "sell", label: "SELL" },
      { type: "hold", label: "HOLD" },
    ],
  },
  {
    key: "risk",
    label: "RISK",
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
      return { mode: "all", fixedAmount: 0.5, pctAmount: 50 };
    case "stop_loss":
      return { pct: 5 };
    case "take_profit":
      return { pct: 10 };
    case "max_position":
      return { pct: 25 };
    case "select_data": {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(new Date().setFullYear(new Date().getFullYear() - 2)).toISOString().slice(0, 10);
      return { ticker: "CBA.AX", start, end };
    }
    default:
      return {};
  }
}

function newConnectorId(connectorIdRef) {
  return `conn-${Date.now()}-${connectorIdRef.current++}`;
}
function newEdgeId(edgeIdRef) {
  return `edge-${Date.now()}-${edgeIdRef.current++}`;
}
function createConnector(type, x, y, connectorIdRef) {
  return { id: newConnectorId(connectorIdRef), type, x, y };
}
// Returns center point of a port relative to the canvas (pre-pan)
function getPortPos(nodeOrConn, port, portIndex = 0) {
  const W = CANVAS_BLOCK_MIN_W;
  const H = CANVAS_BLOCK_MIN_H;
  if (port === "out") return { x: nodeOrConn.x + W, y: nodeOrConn.y + H / 2 };
  // 'in' — connectors have two input ports stacked
  const offsetY = portIndex === 1 ? 30 : 0;
  return { x: nodeOrConn.x, y: nodeOrConn.y + H / 2 + offsetY };
}
function cubicBezierPath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1) * 0.5;
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
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
      createBlock("select_data"),
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
      createBlock("select_data"),
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
      createBlock("select_data"),
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

/** @param {{
 * block: CanvasBlock;
 * ticker: string;
 * start: string;
 * end: string;
 * onChange: (p: Record<string, unknown>) => void;
 * onTickerChange?: (next: string) => void;
 * onStartChange?: (next: string) => void;
 * onEndChange?: (next: string) => void;
 * }} props */
function BlockFields({
  block,
  ticker,
  start,
  end,
  onChange,
  onTickerChange,
  onStartChange,
  onEndChange,
  hideDataConfigFields = false,
}) {
  const p = block.params || {};
  const set = (k, v) => onChange({ ...p, [k]: v });

  switch (block.type) {
    case "select_data": {
      const tk = typeof p.ticker === "string" ? p.ticker : "";
      const ds = typeof p.start === "string" ? p.start : "";
      const de = typeof p.end === "string" ? p.end : "";
      return (
        <div className="flex flex-col gap-1.5 text-[11px] leading-tight text-ink">
          <label className="flex flex-col gap-0.5">
            <span className="text-[#aaa]">Ticker</span>
            <input
              type="text"
              className="max-w-full"
              value={tk}
              placeholder="CBA.AX"
              onChange={(e) => set("ticker", e.target.value.toUpperCase())}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[#aaa]">From</span>
            <input type="date" className="max-w-full" value={ds} onChange={(e) => set("start", e.target.value)} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[#aaa]">To</span>
            <input type="date" className="max-w-full" value={de} onChange={(e) => set("end", e.target.value)} />
          </label>
        </div>
      );
    }
    case "select_stock":
      if (hideDataConfigFields) {
        return <span className="text-[12px] text-[#aaa]">Configured in Backtesting</span>;
      }
      return (
        <label className="flex items-center gap-1 text-[12px] text-ink">
          <span className="text-[#aaa]">Ticker</span>
          <input
            type="text"
            value={ticker || ""}
            onChange={(e) => onTickerChange?.(e.target.value.toUpperCase())}
            placeholder="CBA.AX"
          />
        </label>
      );
    case "select_date_range":
      if (hideDataConfigFields) {
        return <span className="text-[12px] text-[#aaa]">Configured in Backtesting</span>;
      }
      return (
        <span className="flex flex-wrap items-center gap-1 text-[12px] text-ink">
          <span className="text-[#aaa]">From</span>
          <input type="date" value={start || ""} onChange={(e) => onStartChange?.(e.target.value)} />
          <span className="text-[#aaa]">to</span>
          <input type="date" value={end || ""} onChange={(e) => onEndChange?.(e.target.value)} />
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
      return (
        <label className="flex items-center gap-1 text-[12px] text-ink">
          <span className="text-[#aaa]">SMA</span>
          <input
            type="number"
            min={1}
            max={500}
            value={Number(p.period) || 1}
            onChange={(e) => set("period", Math.max(1, Number(e.target.value) || 1))}
          />
          <span className="text-[#aaa]">days</span>
        </label>
      );
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
      return null;
    case "buy": {
      const mode = (p.mode || "all_cash") === "fixed" ? "fixed" : (p.mode || "all_cash") === "pct" ? "pct" : "all_cash";
      return (
        <div className="flex flex-col gap-1.5 text-[12px] text-ink">
          <label className="flex items-center gap-1 text-[12px] text-ink">
            <span className="text-[#aaa]">Mode</span>
            <select
              className="max-w-[min(100%,11rem)] bg-transparent py-0 text-[12px] leading-tight text-ink"
              value={mode}
              onChange={(e) => set("mode", e.target.value)}
            >
              <option value="all_cash">All cash</option>
              <option value="fixed">Fixed amount</option>
              <option value="pct">% of portfolio</option>
            </select>
          </label>
          {mode === "fixed" ? (
            <label className="flex items-center gap-1 text-[12px] text-ink" title="AUD (paper)">
              <span className="text-[#aaa]">AUD</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={Number(p.fixedAmount) || 0.5}
                onChange={(e) => set("fixedAmount", Number(e.target.value))}
              />
            </label>
          ) : null}
          {mode === "pct" ? (
            <label className="flex items-center gap-1 text-[12px] text-ink">
              <input
                type="number"
                min={1}
                max={100}
                value={Number(p.pctAmount) || 100}
                onChange={(e) => set("pctAmount", Number(e.target.value))}
              />
              <span className="text-[#aaa]">% of portfolio</span>
            </label>
          ) : null}
        </div>
      );
    }
    case "sell": {
      const smode = (p.mode || "all") === "fixed" ? "fixed" : (p.mode || "all") === "pct" ? "pct" : "all";
      return (
        <div className="flex flex-col gap-1.5 text-[12px] text-ink">
          <label className="flex items-center gap-1 text-[12px] text-ink">
            <span className="text-[#aaa]">Mode</span>
            <select
              className="max-w-[min(100%,11rem)] bg-transparent py-0 text-[12px] leading-tight text-ink"
              value={smode}
              onChange={(e) => set("mode", e.target.value)}
            >
              <option value="all">Sell all</option>
              <option value="fixed">Fixed amount</option>
              <option value="pct">% of portfolio</option>
            </select>
          </label>
          {smode === "fixed" ? (
            <label className="flex items-center gap-1 text-[12px] text-ink" title="AUD sale proceeds (capped at position value)">
              <span className="text-[#aaa]">AUD</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={Number(p.fixedAmount) || 0.5}
                onChange={(e) => set("fixedAmount", Number(e.target.value))}
              />
            </label>
          ) : null}
          {smode === "pct" ? (
            <label className="flex items-center gap-1 text-[12px] text-ink">
              <input
                type="number"
                min={1}
                max={100}
                value={Number(p.pctAmount) || 50}
                onChange={(e) => set("pctAmount", Number(e.target.value))}
              />
              <span className="text-[#aaa]">% of portfolio</span>
            </label>
          ) : null}
        </div>
      );
    }
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
 *   onTickerChange?: (next: string) => void;
 *   onStartChange?: (next: string) => void;
 *   onEndChange?: (next: string) => void;
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
    onTickerChange,
    onStartChange,
    onEndChange,
    onExpandEditor,
    onExpandCanvas,
    visualSaveEligible = false,
    onRunAvailabilityChange,
    visualImport = null,
    hideDataConfigFields = false,
    hideSavedStrategiesToolbar = false,
    autoSyncCodeFromVisual = false,
    renderLayout,
  },
  ref
) {
  /** @type {BuilderMode} */
  const [mode, setMode] = useState("visual");
  /** @type {CanvasBlock[]} */
  const [canvasBlocks, setCanvasBlocks] = useState(() => []);
  const [edges, setEdges] = useState([]); // { id, fromNodeId, fromPort, toNodeId, toPort }
  const [connectors, setConnectors] = useState([]); // { id, type, x, y } — AND/OR/THEN nodes
  const [wiringFrom, setWiringFrom] = useState(null); // { nodeId, port: 'out'|'in', portIndex }
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const connectorIdRef = useRef(0);
  const edgeIdRef = useRef(0);
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

  const sortedCanvasBlocks = useMemo(
    () => topoSortBlocks(canvasBlocks, edges),
    [canvasBlocks, edges]
  );

  /** In-flow min height so absolute blocks below the fold extend scrollable area (templates stack vertically). */
  const canvasInnerMinHeight = useMemo(() => {
    if (canvasBlocks.length === 0) return 280;
    const estBlockPx = 96;
    const pad = 64;
    const lowest = Math.max(...canvasBlocks.map((b) => (Number(b.y) || 0) + estBlockPx));
    return Math.max(280, lowest + pad);
  }, [canvasBlocks]);

  const { code: previewFromVisual, errors: strategyCompileErrors } = useMemo(
    () => translateVisualBlocksToPythonWithDiagnostics(sortedCanvasBlocks, { ticker, start, end }),
    [sortedCanvasBlocks, ticker, start, end]
  );

  useEffect(() => {
    if (!autoSyncCodeFromVisual) return;
    if (mode !== "visual") return;
    if (strategyCompileErrors.length > 0) return;
    setCode(previewFromVisual);
  }, [autoSyncCodeFromVisual, mode, previewFromVisual, strategyCompileErrors.length, setCode]);

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

  useEffect(() => {
    if (!wiringFrom) return undefined;
    const onMove = (e) => {
      const board = canvasBoardRef.current;
      if (!board) return;
      const rect = board.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [wiringFrom]);

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

  const onPortPointerDown = useCallback((e, nodeId, port, portIndex = 0) => {
    e.stopPropagation();
    e.preventDefault();
    setWiringFrom({ nodeId, port, portIndex });
  }, []);

  const onPortPointerUp = useCallback((e, nodeId, port, portIndex = 0) => {
    e.stopPropagation();
    if (!wiringFrom) return;
    // Prevent same-node connections
    if (wiringFrom.nodeId === nodeId) { setWiringFrom(null); return; }
    // Enforce out → in direction
    const fromIsOut = wiringFrom.port === 'out';
    const toIsIn = port === 'in';
    if (!fromIsOut || !toIsIn) { setWiringFrom(null); return; }
    const newEdge = {
      id: newEdgeId(edgeIdRef),
      fromNodeId: wiringFrom.nodeId, fromPort: wiringFrom.port, fromPortIndex: wiringFrom.portIndex,
      toNodeId: nodeId, toPort: port, toPortIndex: portIndex,
    };
    setEdges(prev => {
      // Deduplicate
      if (prev.find(e2 => e2.fromNodeId === newEdge.fromNodeId && e2.toNodeId === newEdge.toNodeId)) return prev;
      return [...prev, newEdge];
    });
    setWiringFrom(null);
  }, [wiringFrom]);

  const deleteEdge = useCallback((edgeId) => {
    setEdges(prev => prev.filter(e => e.id !== edgeId));
  }, []);

  const deleteConnector = useCallback((connId) => {
    setConnectors(prev => prev.filter(c => c.id !== connId));
    setEdges(prev => prev.filter(e => e.fromNodeId !== connId && e.toNodeId !== connId));
  }, []);

  const connDragRef = useRef(null);

  const onConnectorDragStart = useCallback((e, connId) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const conn = connectors.find(c => c.id === connId);
    if (!conn) return;
    connDragRef.current = {
      id: connId,
      startClientX: e.clientX, startClientY: e.clientY,
      startX: conn.x, startY: conn.y,
    };
    const move = (ev) => {
      const d = connDragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startClientX;
      const dy = ev.clientY - d.startClientY;
      setConnectors(prev => prev.map(c => c.id === d.id
        ? { ...c, x: d.startX + dx, y: d.startY + dy }
        : c
      ));
    };
    const up = () => {
      connDragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [connectors]);

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
      getCanvasBlocks: () => JSON.parse(JSON.stringify(canvasBlocks)),
      getGraphState: () => JSON.parse(JSON.stringify({ blocks: canvasBlocks, edges, connectors })),
      importGraphState: ({ blocks, edges: e, connectors: c }) => {
        setCanvasBlocks(cloneBlocksFromSaved(blocks || []));
        setEdges(e || []);
        setConnectors(c || []);
      },
      importCanvasBlocks: (blocks) => {
        const next = cloneBlocksFromSaved(blocks || []); // order comes from edges now
        setCanvasBlocks(next);
        setGeneratedDirty(false);
        setCode(translateVisualBlocksToPython(next, { ticker, start, end }));
        setMode("visual");
      },
      applyTemplate: (key) => {
        applyTemplate(key);
        setMode("visual");
      },
    }),
    [handleRun, canvasBlocks, ticker, start, end, setCode, edges, connectors]
  );

  const copyGenerated = () => {
    void navigator.clipboard.writeText(mode === "generated" ? generatedEditorText : previewFromVisual);
  };

  const modeTabsEl = (
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
              {!generatedDirty ? <span className="strategy-mode-sync-dot" title="Generated code matches your blocks" aria-hidden /> : null}
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
  );

  const paletteEl = (
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
  );

  const visualPanelEl =
    mode === "visual" ? (
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
          {mode === "visual" && (
            <div style={{ display:"flex", gap:6, marginLeft:"auto" }}>
              {["AND","OR","THEN"].map(type => (
                <button key={type}
                  style={{
                    fontSize:11, padding:"3px 10px",
                    border:"0.5px solid var(--color-border-secondary,rgba(0,0,0,0.2))",
                    borderRadius:5, background:"var(--color-background-secondary,#f5f3ef)",
                    color:"var(--color-text-secondary,#666)", cursor:"pointer",
                  }}
                  onClick={() => {
                    const x = 200 + Math.random() * 160;
                    const y = 160 + Math.random() * 100;
                    setConnectors(prev => [...prev, createConnector(type, x, y, connectorIdRef)]);
                  }}>
                  + {type}
                </button>
              ))}
              <button style={{ fontSize:11, padding:"3px 10px",
                border:"0.5px solid var(--color-border-secondary,rgba(0,0,0,0.2))",
                borderRadius:5, background:"transparent", color:"var(--color-text-tertiary,#999)", cursor:"pointer" }}
                onClick={() => { setConnectors([]); setEdges([]); }}>
                Clear wires
              </button>
            </div>
          )}
          <div className="backtest-canvas-toolbar-templates">
            {!hideSavedStrategiesToolbar ? (
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
            ) : null}
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
          <div className="strategy-compile-errors mb-2 shrink-0 rounded-lg border px-3 py-2 text-[12px] leading-snug" role="alert">
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
            ref={canvasBoardRef}
            className={`canvas-board-2d ${canvasDragOver ? "canvas-board-2d--drag-active" : ""}`}
            style={{
              position: "relative",
              overflow: "hidden",
              minHeight: canvasInnerMinHeight,
            }}
            onDragOver={onCanvasDragOver}
            onDrop={onCanvasBoardDrop}
            onDragLeave={() => setCanvasDragOver(false)}
            onDragEnd={clearDrag}
          >
            <div
              className="canvas-bg"
              onClick={() => {
                if (typeof onExpandCanvas === "function") onExpandCanvas();
              }}
            />
            <NodeGraphCanvas
              blocks={canvasBlocks}
              edges={edges}
              connectors={connectors}
              wiringFrom={wiringFrom}
              mousePos={mousePos}
              onBlockPointerDown={onBlockPointerDown}
              onPortPointerDown={onPortPointerDown}
              onPortPointerUp={onPortPointerUp}
              onEdgeDelete={deleteEdge}
              onConnectorDelete={deleteConnector}
              onConnectorDragStart={onConnectorDragStart}
              BlockFieldsComponent={(props) => (
                <BlockFields
                  {...props}
                  ticker={ticker}
                  start={start}
                  end={end}
                  onTickerChange={onTickerChange}
                  onStartChange={onStartChange}
                  onEndChange={onEndChange}
                  hideDataConfigFields={hideDataConfigFields}
                />
              )}
              onBlockDelete={(id) => {
                setCanvasBlocks((prev) => prev.filter((b) => b.id !== id));
                setEdges((prev) => prev.filter((e) => e.fromNodeId !== id && e.toNodeId !== id));
              }}
              onBlockParamChange={(id, key, val) =>
                setCanvasBlocks((prev) =>
                  prev.map((b) => {
                    if (b.id !== id) return b;
                    if (key === "params" && val && typeof val === "object") return { ...b, params: val };
                    return { ...b, params: { ...(b.params || {}), [key]: val } };
                  })
                )
              }
            />
            {canvasBlocks.length === 0 && connectors.length === 0 && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-tertiary,#999)",
                    background: "var(--color-background-secondary,#f5f3ef)",
                    padding: "4px 12px",
                    borderRadius: 10,
                    border: "0.5px solid var(--color-border-tertiary,rgba(0,0,0,0.1))",
                  }}
                >
                  Drag blocks from the palette · Connect ports to wire logic · Right-click edges to delete
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null;

  const generatedPanelEl =
    mode === "generated" ? (
      <div className="backtest-builder-editor-shell">
        <div className="strategy-generated-panel rounded-[14px] border border-[#ede9e3] bg-white p-4">
          {generatedDirty ? (
            <div className="mb-3 rounded-lg border px-3 py-2 text-[12px]" style={{ background: "#fdf8f0", borderColor: "#e8d5b0", color: "#111" }}>
              You have manually edited the generated code. Switching to Visual Builder will reset these changes.
            </div>
          ) : null}
          {!generatedDirty && strategyCompileErrors.length > 0 ? (
            <div className="strategy-compile-errors mb-3 rounded-lg border px-3 py-2 text-[12px] leading-snug" role="alert">
              <p className="m-0 mb-1 font-semibold text-ink">Fix the visual canvas to regenerate runnable code</p>
              <ul className="m-0 list-disc pl-5 text-[#5c5348]">
                {strategyCompileErrors.map((err, i) => (
                  <li key={`${i}-${err}`}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mb-2 flex justify-end gap-2">
            <button type="button" className="strategy-copy-code-btn rounded-lg px-3 py-1.5 text-[11px] font-semibold" onClick={copyGenerated}>
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
    ) : null;

  const rawPanelEl =
    mode === "raw" ? (
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
    ) : null;

  const panelEl = mode === "visual" ? visualPanelEl : mode === "generated" ? generatedPanelEl : rawPanelEl;

  if (typeof renderLayout === "function") {
    return (
      <>
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
