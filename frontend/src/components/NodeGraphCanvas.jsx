import { useState } from "react";

const PORT_RADIUS = 6;
const BLOCK_W = 160;
const BLOCK_H = 56;
const CAT_COLORS = {
  data: "#c8963e", indicator: "#4a90d9", condition: "#7b68ee",
  action: "#2d8a55", risk: "#c0392b",
};
const TYPE_CAT = {
  select_stock:"data",select_date_range:"data",sma:"indicator",ema:"indicator",
  rsi:"indicator",bollinger:"indicator",macd:"indicator",volume:"indicator",
  if_gt:"condition",if_lt:"condition",if_cross_above:"condition",if_cross_below:"condition",
  if_two_indicators_cross:"condition",buy:"action",sell:"action",hold:"action",
  stop_loss:"risk",take_profit:"risk",max_position:"risk",
};

function PortHandle({ style, onPointerDown, onPointerUp }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        ...style,
        transform: hovered ? "translateY(-50%) scale(1.4)" : "translateY(-50%) scale(1)",
        transition: "transform 0.1s ease",
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    />
  );
}

function Port({ x, y, color, onDown, onUp }) {
  return (
    <g data-port style={{ cursor: "crosshair" }} onPointerDown={onDown} onPointerUp={onUp}>
      <circle cx={x} cy={y} r={PORT_RADIUS + 4} fill="transparent" />
      <circle cx={x} cy={y} r={PORT_RADIUS} fill="var(--bg-primary,#fff)"
        stroke={color} strokeWidth={1.5} />
    </g>
  );
}

function ConnectorNode({ conn, onPortDown, onPortUp, onDragStart, onDelete }) {
  const opts = ["AND","OR","THEN","NOT"];
  const col = "#888";
  return (
    <g transform={`translate(${conn.x},${conn.y})`}>
      <rect x={0} y={0} width={58} height={52} rx={6}
        fill="var(--color-background-secondary,#f5f3ef)"
        stroke="var(--color-border-secondary,rgba(0,0,0,0.2))" strokeWidth={0.5}
        style={{ cursor: "move" }}
        onPointerDown={(e) => { e.stopPropagation(); onDragStart(e, conn.id, "connector"); }}
      />
      {/* Input port top */}
      <Port x={0} y={16} color={col}
        onDown={e => onPortDown(e, conn.id, 'in', 0)}
        onUp={e => onPortUp(e, conn.id, 'in', 0)}
      />
      {/* Input port bottom */}
      <Port x={0} y={38} color={col}
        onDown={e => onPortDown(e, conn.id, 'in', 1)}
        onUp={e => onPortUp(e, conn.id, 'in', 1)}
      />
      {/* Output port right */}
      <Port x={58} y={26} color="#555"
        onDown={e => onPortDown(e, conn.id, 'out', 0)}
        onUp={e => onPortUp(e, conn.id, 'out', 0)}
      />
      <text x={29} y={20} textAnchor="middle" fontSize={10} fontWeight={500}
        fill="var(--color-text-secondary,#666)">{conn.type}</text>
      <text x={29} y={33} textAnchor="middle" fontSize={8}
        fill="var(--color-text-tertiary,#999)">in1 · in2</text>
      {/* Delete */}
      <g style={{ cursor: "pointer" }} onClick={() => onDelete(conn.id)}>
        <rect x={42} y={2} width={13} height={13} rx={2}
          fill="var(--color-background-secondary,#eee)"
          stroke="var(--color-border-tertiary,rgba(0,0,0,0.1))" strokeWidth={0.5} />
        <text x={48.5} y={12} textAnchor="middle" fontSize={9}
          fill="var(--color-text-tertiary,#999)">×</text>
      </g>
    </g>
  );
}

export default function NodeGraphCanvas({
  blocks, edges, connectors, wiringFrom, mousePos,
  onBlockPointerDown, onPortPointerDown, onPortPointerUp,
  onEdgeDelete, onConnectorDelete, onConnectorDragStart,
  BlockFieldsComponent,
  onBlockDelete, onBlockParamChange,
}) {
  // Resolve all nodes (blocks + connectors) for edge drawing
  function getNodePos(nodeId) {
    const b = blocks.find(b => b.id === nodeId);
    if (b) return b;
    const c = connectors.find(c => c.id === nodeId);
    if (c) return { x: c.x, y: c.y, _conn: true };
    return null;
  }
  function getEdgeEndpoints(edge) {
    const from = getNodePos(edge.fromNodeId);
    const to = getNodePos(edge.toNodeId);
    if (!from || !to) return null;
    const fromIsConn = !!from._conn;
    const toIsConn = !!to._conn;
    // out port
    const fx = fromIsConn ? from.x + 58 : from.x + BLOCK_W;
    const fy = fromIsConn ? from.y + 26 : from.y + BLOCK_H / 2;
    // in port
    const tx = toIsConn ? to.x : to.x;
    const portOffset = (edge.toPortIndex === 1) ? 38 : 16;
    const ty = toIsConn ? to.y + portOffset : to.y + BLOCK_H / 2;
    return { fx, fy, tx, ty };
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* Dotted grid background */}
      <svg style={{ position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none" }}>
        <defs>
          <pattern id="dot-grid" x={0} y={0} width={20} height={20} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={0.8} fill="var(--color-border-tertiary,rgba(0,0,0,0.12))" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)" />
      </svg>

      {/* Pan container */}
      <div style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%" }}>
        {/* SVG layer for edges */}
        <svg style={{ position:"absolute",top:0,left:0,width:"100%",height:"100%",overflow:"visible",pointerEvents:"none" }}>
          <defs>
            <marker id="arrowhead" markerWidth={8} markerHeight={6} refX={7} refY={3} orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="var(--color-border-primary,rgba(0,0,0,0.35))" />
            </marker>
          </defs>
          {/* Committed edges */}
          {edges.map(edge => {
            const pts = getEdgeEndpoints(edge);
            if (!pts) return null;
            const d = `M${pts.fx},${pts.fy} C${pts.fx+60},${pts.fy} ${pts.tx-60},${pts.ty} ${pts.tx},${pts.ty}`;
            return (
              <g key={edge.id} style={{ pointerEvents:"stroke", cursor:"pointer" }}
                onContextMenu={e => { e.preventDefault(); onEdgeDelete(edge.id); }}>
                {/* Fat invisible hit area */}
                <path d={d} stroke="transparent" strokeWidth={10} fill="none" />
                <path d={d} stroke="var(--color-border-primary,rgba(0,0,0,0.35))"
                  strokeWidth={1.5} fill="none" markerEnd="url(#arrowhead)" />
              </g>
            );
          })}
          {/* Live wiring preview */}
          {wiringFrom && (() => {
            const src = getNodePos(wiringFrom.nodeId);
            if (!src) return null;
            const isConn = !!src._conn;
            const fx = isConn ? src.x + 58 : src.x + BLOCK_W;
            const fy = isConn ? src.y + 26 : src.y + BLOCK_H / 2;
            const d = `M${fx},${fy} C${fx+60},${fy} ${mousePos.x-60},${mousePos.y} ${mousePos.x},${mousePos.y}`;
            return <path d={d} stroke="var(--color-border-secondary,rgba(0,0,0,0.2))"
              strokeWidth={1.5} fill="none" strokeDasharray="5 4" />;
          })()}
        </svg>

        {/* Block nodes */}
        {blocks.map(block => {
          const cat = TYPE_CAT[block.type] || "data";
          const col = CAT_COLORS[cat];
          return (
            <div key={block.id}
              style={{
                position:"absolute", left:block.x, top:block.y,
                width:BLOCK_W, minHeight:BLOCK_H,
                background:"var(--color-background-primary,#fff)",
                border:`1px solid ${col}`,
                borderLeft:`3px solid ${col}`,
                borderRadius:8,
                boxShadow:"none",
                userSelect:"none",
                cursor:"move",
                zIndex:2,
              }}
              onPointerDown={e => onBlockPointerDown(e, block)}
            >
              {/* Header */}
              <div style={{ display:"flex",alignItems:"center",gap:6,padding:"6px 8px 4px",
                borderBottom:"0.5px solid var(--color-border-tertiary,rgba(0,0,0,0.1))" }}>
                <span style={{ width:7,height:7,borderRadius:2,background:col,flexShrink:0,display:"block" }} />
                <span style={{ fontSize:12,fontWeight:500,flex:1,
                  color:"var(--color-text-primary,#111)",lineHeight:1.3 }}>
                  {block.type.replace(/_/g," ").replace(/\\b\\w/g, l=>l.toUpperCase())}
                </span>
                <button className="delete-btn"
                  style={{ width:15,height:15,border:"0.5px solid var(--color-border-secondary,rgba(0,0,0,0.2))",
                    borderRadius:3,background:"none",cursor:"pointer",fontSize:10,
                    color:"var(--color-text-tertiary,#999)",lineHeight:1,display:"flex",
                    alignItems:"center",justifyContent:"center",padding:0 }}
                  onClick={e => { e.stopPropagation(); onBlockDelete(block.id); }}>
                  ×
                </button>
              </div>
              {/* Fields */}
              {BlockFieldsComponent && (
                <div
                  style={{ padding: "4px 8px 6px", cursor: "default" }}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onPointerUpCapture={(e) => e.stopPropagation()}
                  onClickCapture={(e) => e.stopPropagation()}
                >
                  <BlockFieldsComponent
                    block={block}
                    onChange={(params) => onBlockParamChange(block.id, "params", params)}
                  />
                </div>
              )}
              {/* IN port — left center */}
              <PortHandle
                style={{
                  position:"absolute", left:-8, top:"50%",
                  width:14, height:14, borderRadius:"50%",
                  border:`2px solid ${col}`,
                  background:"var(--color-background-primary,#fff)",
                  cursor:"crosshair", zIndex:3,
                  boxSizing:"border-box",
                }}
                onPointerDown={e => onPortPointerDown(e, block.id, 'in')}
                onPointerUp={e => onPortPointerUp(e, block.id, 'in')}
              />
              {/* OUT port — right center */}
              <PortHandle
                style={{
                  position:"absolute", right:-8, top:"50%",
                  width:14, height:14, borderRadius:"50%",
                  border:`2px solid ${col}`,
                  background: col,
                  cursor:"crosshair", zIndex:3,
                  boxSizing:"border-box",
                }}
                onPointerDown={e => onPortPointerDown(e, block.id, 'out')}
                onPointerUp={e => onPortPointerUp(e, block.id, 'out')}
              />
            </div>
          );
        })}

        {/* Connector nodes */}
        <svg style={{ position:"absolute",top:0,left:0,overflow:"visible",pointerEvents:"none" }}>
          {connectors.map(conn => (
            <g key={conn.id} style={{ pointerEvents:"all" }}>
              <ConnectorNode
                conn={conn}
                onPortDown={onPortPointerDown}
                onPortUp={onPortPointerUp}
                onDragStart={onConnectorDragStart}
                onDelete={onConnectorDelete}
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

