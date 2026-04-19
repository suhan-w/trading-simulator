import { useEffect } from "react";

/**
 * Confirm irreversible reset of the current user's simulation data.
 * @param {{ open: boolean, onClose: () => void, onConfirm: () => Promise<void>, busy?: boolean }} props
 */
export default function ResetSessionModal({ open, onClose, onConfirm, busy = false }) {
  useEffect(() => {
    if (!open || busy) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const panelStyle = {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "32px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
      onClick={busy ? undefined : onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md"
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-session-title"
      >
        <h2
          id="reset-session-title"
          className="m-0 font-medium leading-tight tracking-tight"
          style={{ fontSize: "18px", fontWeight: 500, color: "#111111" }}
        >
          New Session
        </h2>
        <p
          className="m-0 mt-5 font-normal"
          style={{
            fontSize: "13px",
            lineHeight: 1.7,
            color: "#666666",
          }}
        >
          Are you sure? This will delete all your trades, holdings and performance history and reset your cash to
          A$100,000. This cannot be undone.
        </p>
        <div className="mt-8 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="cursor-pointer font-normal transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8963e]/35 focus-visible:ring-offset-2"
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #ede9e3",
              borderRadius: "10px",
              padding: "10px 20px",
              fontSize: "13px",
              color: "#111111",
            }}
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cursor-pointer font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c0392b]/30 focus-visible:ring-offset-2"
            style={{
              backgroundColor: "#ffffff",
              border: "1.5px solid #c0392b",
              borderRadius: "10px",
              padding: "10px 20px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#c0392b",
            }}
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
