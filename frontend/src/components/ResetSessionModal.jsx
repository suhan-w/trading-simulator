/**
 * Confirm irreversible reset of the current user's simulation data.
 * @param {{ open: boolean, onClose: () => void, onConfirm: () => Promise<void>, busy?: boolean }} props
 */
export default function ResetSessionModal({ open, onClose, onConfirm, busy = false }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
      onClick={busy ? undefined : onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onClose();
      }}
      role="presentation"
    >
      <div
        className="cs-card max-w-md shadow-card w-full space-y-5 p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-session-title"
      >
        <h2 id="reset-session-title" className="text-base font-semibold text-ink font-sans">
          New session
        </h2>
        <p className="text-sm leading-relaxed text-ink">
          Are you sure? This will delete all your trades, holdings and performance history and reset your
          cash to A$100,000. This cannot be undone.
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" className="cs-btn-neutral px-4 py-2" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded-card bg-danger px-4 py-2 text-sm font-semibold text-white shadow-card-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
