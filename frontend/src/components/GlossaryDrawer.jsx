import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  GLOSSARY_BLOCK_ORDER,
  GLOSSARY_ENTRIES,
  glossaryCategoryDot,
} from "../constants/strategyPaletteGlossary";

/** @param {{ type: string }} props */
export function GlossaryExampleSvg({ type }) {
  const common = { width: 120, height: 64, viewBox: "0 0 120 64", "aria-hidden": true };
  switch (type) {
    case "sma":
    case "ema":
      return (
        <svg {...common} className="glossary-example-svg">
          <path
            d="M4 48 L20 22 L36 40 L52 18 L68 35 L84 12 L100 28 L116 8"
            fill="none"
            stroke="#ccc"
            strokeWidth="2"
          />
          <path
            d="M4 42 L20 28 L36 34 L52 24 L68 30 L84 20 L100 26 L116 16"
            fill="none"
            stroke="#4a90d9"
            strokeWidth="2.5"
          />
        </svg>
      );
    case "rsi":
      return (
        <svg {...common} className="glossary-example-svg">
          <line x1="4" y1="48" x2="116" y2="48" stroke="#eee" strokeWidth="1" />
          <line x1="4" y1="36" x2="116" y2="36" stroke="#fde8e8" strokeWidth="1" />
          <line x1="4" y1="24" x2="116" y2="24" stroke="#eee" strokeWidth="1" />
          <text x="8" y="50" fontSize="7" fill="#999">
            30
          </text>
          <text x="8" y="26" fontSize="7" fill="#999">
            70
          </text>
          <path
            d="M4 40 Q30 44 50 20 T100 38 L116 32"
            fill="none"
            stroke="#7b68ee"
            strokeWidth="2"
          />
        </svg>
      );
    case "bollinger":
      return (
        <svg {...common} className="glossary-example-svg">
          <path
            d="M4 12 Q30 8 60 10 T116 14"
            fill="none"
            stroke="#4a90d9"
            strokeWidth="1"
            opacity="0.6"
          />
          <path
            d="M4 32 Q30 28 60 30 T116 34"
            fill="none"
            stroke="#4a90d9"
            strokeWidth="2"
          />
          <path
            d="M4 52 Q30 48 60 50 T116 54"
            fill="none"
            stroke="#4a90d9"
            strokeWidth="1"
            opacity="0.6"
          />
          <path
            d="M4 48 L20 30 L36 42 L52 20 L68 38 L84 16 L100 36 L116 22"
            fill="none"
            stroke="#111"
            strokeWidth="1.5"
          />
        </svg>
      );
    case "macd":
      return (
        <svg {...common} className="glossary-example-svg">
          <line x1="60" y1="4" x2="60" y2="60" stroke="#eee" strokeWidth="1" />
          <path d="M8 40 L32 28 L56 36 L80 14 L104 24" fill="none" stroke="#111" strokeWidth="2" />
          <path d="M8 48 L32 42 L56 44 L80 32 L104 36" fill="none" stroke="#c8963e" strokeWidth="1.5" />
        </svg>
      );
    case "volume":
      return (
        <svg {...common} className="glossary-example-svg">
          {[12, 28, 44, 60, 76, 92, 108].map((x, i) => {
            const h = 10 + (i % 5) * 8;
            return <rect key={i} x={x - 5} y={56 - h} width="8" height={h} fill="#4a90d9" opacity="0.7" />;
          })}
        </svg>
      );
    case "select_data":
      return (
        <svg {...common} className="glossary-example-svg">
          <rect x="12" y="12" width="96" height="52" rx="6" fill="#fdf8f0" stroke="#c8963e" strokeWidth="2" />
          <text x="60" y="30" textAnchor="middle" fontSize="11" fill="#111" fontFamily="monospace">
            CBA.AX
          </text>
          <text x="60" y="48" textAnchor="middle" fontSize="8" fill="#666">
            start → end
          </text>
        </svg>
      );
    case "select_stock":
      return (
        <svg {...common} className="glossary-example-svg">
          <rect x="24" y="16" width="72" height="36" rx="6" fill="#fdf8f0" stroke="#c8963e" strokeWidth="2" />
          <text x="60" y="40" textAnchor="middle" fontSize="14" fill="#111" fontFamily="monospace">
            CBA.AX
          </text>
        </svg>
      );
    case "select_date_range":
      return (
        <svg {...common} className="glossary-example-svg">
          <rect x="8" y="20" width="104" height="28" rx="4" fill="#f5f3ef" stroke="#ede9e3" />
          <text x="16" y="38" fontSize="9" fill="#666">
            start → end
          </text>
        </svg>
      );
    case "if_gt":
    case "if_lt":
      return (
        <svg {...common} className="glossary-example-svg">
          <line x1="20" y1="48" x2="100" y2="16" stroke="#ccc" strokeWidth="1" strokeDasharray="3 2" />
          <circle cx="100" cy="16" r="6" fill="#7b68ee" />
          <text x="16" y="56" fontSize="9" fill="#666">
            threshold
          </text>
        </svg>
      );
    case "if_cross_above":
    case "if_cross_below":
    case "if_two_indicators_cross":
      return (
        <svg {...common} className="glossary-example-svg">
          <path d="M8 44 L40 20 L72 36 L112 12" fill="none" stroke="#aaa" strokeWidth="1.5" />
          <path d="M8 52 L40 40 L72 28 L112 36" fill="none" stroke="#4a90d9" strokeWidth="1.5" />
          <circle cx="72" cy="28" r="5" fill="#7b68ee" />
        </svg>
      );
    case "buy":
      return (
        <svg {...common} className="glossary-example-svg">
          <path d="M60 12 L72 28 L48 28 Z" fill="#2d8a55" opacity="0.9" />
          <text x="60" y="52" textAnchor="middle" fontSize="10" fill="#2d8a55" fontWeight="600">
            BUY
          </text>
        </svg>
      );
    case "sell":
      return (
        <svg {...common} className="glossary-example-svg">
          <path d="M48 16 L72 40 M72 16 L48 40" stroke="#c0392b" strokeWidth="3" />
          <text x="60" y="56" textAnchor="middle" fontSize="10" fill="#c0392b" fontWeight="600">
            SELL
          </text>
        </svg>
      );
    case "hold":
      return (
        <svg {...common} className="glossary-example-svg">
          <rect x="36" y="24" width="48" height="20" rx="4" fill="#f5f3ef" stroke="#ede9e3" />
          <text x="60" y="38" textAnchor="middle" fontSize="9" fill="#888">
            pause
          </text>
        </svg>
      );
    case "stop_loss":
      return (
        <svg {...common} className="glossary-example-svg">
          <path d="M8 20 L100 20" stroke="#2d8a55" strokeWidth="2" />
          <path d="M8 44 L100 44" stroke="#c0392b" strokeWidth="1" strokeDasharray="4 2" />
          <text x="8" y="58" fontSize="8" fill="#c0392b">
            stop
          </text>
        </svg>
      );
    case "take_profit":
      return (
        <svg {...common} className="glossary-example-svg">
          <path d="M8 44 L100 44" stroke="#2d8a55" strokeWidth="2" />
          <path d="M8 16 L100 16" stroke="#c8963e" strokeWidth="1" strokeDasharray="4 2" />
          <text x="8" y="14" fontSize="8" fill="#c8963e">
            target
          </text>
        </svg>
      );
    case "max_position":
      return (
        <svg {...common} className="glossary-example-svg">
          <rect x="20" y="16" width="80" height="36" rx="4" fill="#fdf8f0" stroke="#c0392b" strokeWidth="1" />
          <rect x="28" y="24" width="40" height="20" rx="2" fill="#c8963e" opacity="0.35" />
          <text x="60" y="58" textAnchor="middle" fontSize="8" fill="#666">
            cap %
          </text>
        </svg>
      );
    default:
      return (
        <svg {...common} className="glossary-example-svg">
          <text x="60" y="36" textAnchor="middle" fontSize="10" fill="#aaa">
            —
          </text>
        </svg>
      );
  }
}

/**
 * @param {{
 *   type: string | null;
 *   onClose: () => void;
 *   onAddToCanvas: (type: string) => void;
 *   onNavigate: (type: string) => void;
 * }} props
 */
export default function GlossaryDrawer({ type, onClose, onAddToCanvas, onNavigate }) {
  const [entered, setEntered] = useState(false);
  const closeTimerRef = useRef(null);
  const hadTypeRef = useRef(false);

  const handleRequestClose = useCallback(() => {
    setEntered(false);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, 300);
  }, [onClose]);

  useEffect(() => {
    if (!type) {
      setEntered(false);
      hadTypeRef.current = false;
      return undefined;
    }
    if (!hadTypeRef.current) {
      hadTypeRef.current = true;
      const id = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(id);
    }
    setEntered(true);
    return undefined;
  }, [type]);

  useEffect(() => {
    if (!type) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") handleRequestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [type, handleRequestClose]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    },
    []
  );

  const idx = type ? GLOSSARY_BLOCK_ORDER.indexOf(type) : -1;
  const entry = type ? GLOSSARY_ENTRIES[type] : null;
  const dot = type ? glossaryCategoryDot(type) : "#888";

  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < GLOSSARY_BLOCK_ORDER.length - 1;

  if (typeof document === "undefined" || !type || !entry) return null;

  return createPortal(
    <div className="glossary-drawer-root" role="presentation">
      <button
        type="button"
        className={`glossary-drawer-overlay${entered ? " glossary-drawer-overlay--open" : ""}`}
        aria-label="Close glossary"
        onClick={handleRequestClose}
      />
      <aside
        className={`glossary-drawer${entered ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="glossary-drawer-title"
      >
        <button type="button" className="glossary-drawer-close" aria-label="Close" onClick={handleRequestClose}>
          ×
        </button>
        <div className="glossary-drawer-header-meta">
          <span className="glossary-drawer-cat-dot" style={{ background: dot }} aria-hidden />
          <span className="glossary-drawer-cat-label">{entry.categoryLabel}</span>
        </div>
        <h2 id="glossary-drawer-title" className="glossary-drawer-title">
          {entry.title}
        </h2>
        <div className="glossary-drawer-title-line" aria-hidden />

        <section className="glossary-drawer-section">
          <h3 className="glossary-drawer-h3">What it is</h3>
          <p className="glossary-drawer-p">{entry.whatItIs}</p>
        </section>
        <section className="glossary-drawer-section">
          <h3 className="glossary-drawer-h3">How it works</h3>
          <pre className="glossary-drawer-code">{entry.howItWorks}</pre>
        </section>
        <section className="glossary-drawer-section">
          <h3 className="glossary-drawer-h3">When to use it</h3>
          <p className="glossary-drawer-p">{entry.whenToUse}</p>
        </section>
        <section className="glossary-drawer-section">
          <h3 className="glossary-drawer-h3">Signal interpretation</h3>
          <ul className="glossary-drawer-ul">
            {entry.signals.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
        <section className="glossary-drawer-section">
          <h3 className="glossary-drawer-h3">Example chart</h3>
          <div className="glossary-drawer-chart-wrap">
            <GlossaryExampleSvg type={type} />
          </div>
        </section>
        <section className="glossary-drawer-section">
          <h3 className="glossary-drawer-h3">Used in strategy</h3>
          {entry.usedInTemplates.length ? (
            <div className="glossary-drawer-pills">
              {entry.usedInTemplates.map((t) => (
                <span key={t} className="glossary-drawer-pill">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="glossary-drawer-muted">Not used in the three example templates — combine freely on the canvas.</p>
          )}
        </section>

        <div className="glossary-drawer-nav">
          <button
            type="button"
            className="glossary-drawer-nav-btn"
            disabled={!canPrev}
            onClick={() => canPrev && onNavigate(GLOSSARY_BLOCK_ORDER[idx - 1])}
            aria-label="Previous block"
          >
            ←
          </button>
          <span className="glossary-drawer-nav-pos">
            {idx + 1} of {GLOSSARY_BLOCK_ORDER.length}
          </span>
          <button
            type="button"
            className="glossary-drawer-nav-btn"
            disabled={!canNext}
            onClick={() => canNext && onNavigate(GLOSSARY_BLOCK_ORDER[idx + 1])}
            aria-label="Next block"
          >
            →
          </button>
        </div>

        <button type="button" className="glossary-drawer-add-btn" onClick={() => onAddToCanvas(type)}>
          Add to Strategy
        </button>
      </aside>
    </div>,
    document.body
  );
}
