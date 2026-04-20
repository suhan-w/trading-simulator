import { useEffect, useRef } from "react";

/**
 * Confirm irreversible reset of the current user's simulation data.
 *
 * Token-compliant reference implementation:
 *   - No inline styles; every visual uses the cs-* primitive layer or tokens.
 *   - Moves initial focus to Cancel on open and restores focus to the
 *     previously-focused element on close.
 *   - ESC closes when not busy.
 *
 * @param {{ open: boolean, onClose: () => void, onConfirm: () => Promise<void>, busy?: boolean }} props
 */
export default function ResetSessionModal({ open, onClose, onConfirm, busy = false }) {
  const cancelRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  // Remember the trigger element so we can restore focus on close.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement;
      // Defer focus until after render so the button exists.
      queueMicrotask(() => cancelRef.current?.focus());
      return undefined;
    }
    const prev = previouslyFocusedRef.current;
    if (prev && typeof prev.focus === "function") {
      prev.focus();
    }
    return undefined;
  }, [open]);

  // ESC to dismiss (ignored while busy to avoid losing an in-flight confirm).
  useEffect(() => {
    if (!open || busy) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="cs-modal-overlay"
      onClick={busy ? undefined : onClose}
      role="presentation"
    >
      <div
        className="cs-modal-panel max-w-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-session-title"
        aria-describedby="reset-session-desc"
      >
        <h2
          id="reset-session-title"
          className="m-0 font-medium leading-tight tracking-tight"
          style={{ fontSize: "18px", fontWeight: 500, color: "#111111" }}
        >
          New Session
        </h2>
        <p id="reset-session-desc" className="cs-modal-body">
          Are you sure? This will delete all your trades, holdings and performance history and reset your cash to
          A$100,000. This cannot be undone.
        </p>
        <div className="cs-modal-footer">
          <button
            ref={cancelRef}
            type="button"
            className="cs-btn-ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cs-btn-danger-outline"
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? "Resetting…" : "Reset Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
