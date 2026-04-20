import { useState } from "react";
import { GLOSSARY_ENTRIES } from "../constants/strategyPaletteGlossary";

export const LANE_ORDER = ["data", "indicator", "condition", "action", "risk"];

export const TYPE_CAT = {
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

const LANE_META = {
  data: { label: "Data", hint: "Stock & date range", color: "#c8963e", textColor: "#854f0b" },
  indicator: { label: "Indicators", hint: "SMA, RSI, MACD…", color: "#4a90d9", textColor: "#185fa5" },
  condition: { label: "Conditions", hint: "IF / when…", color: "#7b68ee", textColor: "#534ab7" },
  action: { label: "Actions", hint: "Buy, Sell, Hold", color: "#2d8a55", textColor: "#3b6d11" },
  risk: { label: "Risk", hint: "Stop loss, targets", color: "#c0392b", textColor: "#a32d2d" },
};

function blockTitle(type) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function BlockCard({
  block,
  laneColor,
  readOnly,
  onDelete,
  onParamsChange,
  BlockFieldsComponent,
  onOpenGlossary,
  indicatorOptions = [],
}) {
  const gloss = GLOSSARY_ENTRIES[block.type];
  const tip = gloss?.whatItIs || gloss?.title || "";

  return (
    <div
      style={{
        background: "var(--color-background-primary)",
        border: `1px solid ${laneColor}`,
        borderLeft: `3px solid ${laneColor}`,
        borderRadius: 8,
        padding: "8px 10px",
        marginBottom: 8,
        position: "relative",
      }}
      title={tip || undefined}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--color-text-primary)",
          marginBottom: 4,
          paddingRight: readOnly ? 4 : 44,
        }}
      >
        {blockTitle(block.type)}
      </div>
      {BlockFieldsComponent ? (
        <BlockFieldsComponent
          block={block}
          indicatorOptions={indicatorOptions}
          onChange={(nextParams) => onParamsChange(block.id, nextParams)}
        />
      ) : null}
      {onOpenGlossary ? (
        <button
          type="button"
          className="glossary-palette-info"
          aria-label={`Open glossary: ${blockTitle(block.type)}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onOpenGlossary(block.type);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: 5,
            right: readOnly ? 5 : 24,
            width: 18,
            height: 18,
            borderRadius: 3,
            border: "0.5px solid var(--color-border-secondary)",
            background: "var(--color-background-secondary)",
            cursor: "pointer",
            fontSize: 10,
            fontStyle: "italic",
            color: "var(--color-text-tertiary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          i
        </button>
      ) : null}
      {!readOnly ? (
        <button
          type="button"
          className="delete-btn"
          aria-label={`Remove ${blockTitle(block.type)}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(block.id);
          }}
          style={{
            position: "absolute",
            top: 5,
            right: 5,
            width: 16,
            height: 16,
            borderRadius: 3,
            border: "0.5px solid var(--color-border-secondary)",
            background: "none",
            cursor: "pointer",
            fontSize: 10,
            color: "var(--color-text-tertiary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function Lane({
  laneKey,
  blocks,
  readOnly,
  onDrop,
  onDelete,
  onParamsChange,
  BlockFieldsComponent,
  onAddClick,
  onOpenGlossary,
  indicatorOptions = [],
}) {
  const [dragOver, setDragOver] = useState(false);
  const meta = LANE_META[laneKey];

  return (
    <div
      style={{
        flex: 1,
        minWidth: 160,
        maxWidth: 210,
        borderRight: "0.5px solid var(--color-border-tertiary)",
        display: "flex",
        flexDirection: "column",
        background: dragOver ? "var(--color-background-secondary)" : "var(--color-background-primary)",
        transition: "background .12s",
      }}
      onDragOver={(e) => {
        if (readOnly) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (readOnly) return;
        setDragOver(false);
        onDrop(e, laneKey);
      }}
    >
      <div
        style={{
          padding: "10px 12px 8px",
          borderBottom: "0.5px solid var(--color-border-tertiary)",
          background: "var(--color-background-secondary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 2,
              background: meta.color,
              flexShrink: 0,
              display: "block",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: meta.textColor,
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          >
            {meta.label}
          </span>
        </div>
        <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{meta.hint}</div>
      </div>

      <div style={{ flex: 1, padding: "10px 8px 8px", overflowY: "auto" }}>
        {blocks.map((block) => (
          <BlockCard
            key={block.id}
            block={block}
            laneColor={meta.color}
            readOnly={readOnly}
            onDelete={onDelete}
            onParamsChange={onParamsChange}
            BlockFieldsComponent={BlockFieldsComponent}
            onOpenGlossary={onOpenGlossary}
            indicatorOptions={indicatorOptions}
          />
        ))}
        {!readOnly ? (
          <button
            type="button"
            onClick={() => onAddClick(laneKey)}
            style={{
              width: "100%",
              padding: "6px 0",
              border: "0.5px dashed var(--color-border-secondary)",
              borderRadius: 7,
              background: "none",
              cursor: "pointer",
              fontSize: 11,
              color: "var(--color-text-tertiary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Add
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * @param {{
 *   blocks: Array<{ id: string; type: string; params?: Record<string, unknown>; _laneIndex?: number }>;
 *   readOnly?: boolean;
 *   onAddBlock: (laneKey: string) => void;
 *   onDeleteBlock: (id: string) => void;
 *   onBlockParamsChange: (id: string, params: Record<string, unknown>) => void;
 *   onDrop: (e: React.DragEvent, laneKey: string) => void;
 *   BlockFieldsComponent: import("react").ComponentType<any> | null;
 *   onOpenGlossary?: (type: string) => void;
 *   indicatorOptions?: { value: string; label: string }[];
 * }} props
 */
export default function LaneCanvas({
  blocks,
  readOnly = false,
  onAddBlock,
  onDeleteBlock,
  onBlockParamsChange,
  onDrop,
  BlockFieldsComponent,
  onOpenGlossary,
  indicatorOptions = [],
}) {
  return (
    <div style={{ display: "flex", flexDirection: "row", minHeight: 360, overflowX: "auto" }}>
      {LANE_ORDER.map((laneKey) => {
        const laneBlocks = blocks
          .filter((b) => (TYPE_CAT[b.type] || "data") === laneKey)
          .sort((a, b) => (a._laneIndex ?? 0) - (b._laneIndex ?? 0));
        return (
          <Lane
            key={laneKey}
            laneKey={laneKey}
            blocks={laneBlocks}
            readOnly={readOnly}
            onDrop={onDrop}
            onDelete={onDeleteBlock}
            onParamsChange={onBlockParamsChange}
            BlockFieldsComponent={BlockFieldsComponent}
            onAddClick={onAddBlock}
            onOpenGlossary={onOpenGlossary}
            indicatorOptions={indicatorOptions}
          />
        );
      })}
    </div>
  );
}
