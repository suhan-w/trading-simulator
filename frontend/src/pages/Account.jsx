import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatAud } from "../formatAud";
import ResetSessionModal from "../components/ResetSessionModal";

const ACCOUNT_PAGE_TOOLTIP =
  "Manage your Alpha Vantage API key, private or public leaderboard visibility for paper trading, and session. ASX closing prices use your key’s daily quota.";

function goldTitleMarker() {
  return (
    <span
      className="h-[8px] w-[8px] shrink-0 rounded-[1px]"
      style={{ backgroundColor: "#c8963e" }}
      aria-hidden
    />
  );
}

function displayUsername(email, isGuest) {
  if (!email) return "—";
  if (isGuest) return "Guest";
  const local = email.split("@")[0];
  return local || email;
}

function initialsFromEmail(email, isGuest) {
  if (!email) return "?";
  if (isGuest) return "G";
  const local = email.split("@")[0];
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[1][0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || "?";
}

function formatMemberSince(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function Account() {
  const { user, refreshMe } = useAuth();
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [titleTipOpen, setTitleTipOpen] = useState(false);
  const accountTitleTipId = useId();
  const [paperLbEntry, setPaperLbEntry] = useState(null);
  const [paperLbLoading, setPaperLbLoading] = useState(false);
  const [paperLbError, setPaperLbError] = useState(null);
  const [paperShareBusy, setPaperShareBusy] = useState(false);

  const username = useMemo(
    () => displayUsername(user?.email, user?.is_guest),
    [user?.email, user?.is_guest]
  );
  const initials = useMemo(
    () => initialsFromEmail(user?.email, user?.is_guest),
    [user?.email, user?.is_guest]
  );
  const memberSince = useMemo(() => formatMemberSince(user?.created_at), [user?.created_at]);
  const startingCapital = user?.initial_cash ?? 100_000;

  const avLimit = user?.alpha_vantage_daily_limit ?? 25;
  const avUsed = user?.alpha_vantage_requests_used_today ?? 0;

  useEffect(() => {
    if (!user) {
      setPaperLbEntry(null);
      setPaperLbError(null);
      setPaperLbLoading(false);
      return undefined;
    }
    let cancelled = false;
    setPaperLbLoading(true);
    setPaperLbError(null);
    api
      .leaderboardMine()
      .then((rows) => {
        if (cancelled) return;
        const paper = rows.find((r) => r.source === "paper");
        setPaperLbEntry(
          paper ? { id: paper.id, share_public: Boolean(paper.share_public) } : null
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setPaperLbEntry(null);
          setPaperLbError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setPaperLbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const onPaperShareToggle = useCallback(async (next) => {
    const current = paperLbEntry?.share_public ?? false;
    if (current === next) return;
    setPaperShareBusy(true);
    setPaperLbError(null);
    try {
      const out = await api.patchPaperLeaderboardSharing({ share_public: next });
      setPaperLbEntry({ id: out.id, share_public: Boolean(out.share_public) });
    } catch (err) {
      setPaperLbError(err instanceof Error ? err.message : String(err));
    } finally {
      setPaperShareBusy(false);
    }
  }, [paperLbEntry]);

  async function onSave(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (apiKey.trim().length < 8) {
      setError("API key must be at least 8 characters.");
      return;
    }
    setSaving(true);
    try {
      await api.updateAlphaVantageKey(apiKey.trim());
      setApiKey("");
      setMessage("API key saved.");
      await refreshMe();
    } catch (err) {
      setError(err?.message || "Could not save key");
    } finally {
      setSaving(false);
    }
  }

  const confirmResetSession = useCallback(async () => {
    setResetBusy(true);
    setError(null);
    try {
      await api.resetSession();
      await refreshMe();
      setResetOpen(false);
      navigate("/");
    } catch (err) {
      setError(err?.message || "Could not reset session");
    } finally {
      setResetBusy(false);
    }
  }, [refreshMe, navigate]);

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6 md:space-y-8">
      <div className="page-section-heading">
        <div className="page-title-row">
          <h1 className="page-title">Account</h1>
          <button
            type="button"
            className="pixel-tooltip-btn shrink-0"
            onClick={() => setTitleTipOpen((v) => !v)}
            aria-expanded={titleTipOpen}
            aria-controls={accountTitleTipId}
            aria-label="About this page"
          />
        </div>
        {titleTipOpen ? (
          <div id={accountTitleTipId} className="pixel-tooltip-text" role="region">
            {ACCOUNT_PAGE_TOOLTIP}
          </div>
        ) : null}
        <p className="page-subtitle">
          Your profile, private or public leaderboard visibility, market data key, and options to reset the paper portfolio.
        </p>
      </div>

      <div className="account-layout">
        <div className="profile-card cs-card flex flex-col p-5 md:p-6">
          <h2 className="mb-5 text-sm font-semibold text-ink">Profile</h2>
          <div className="flex flex-1 flex-col gap-6 sm:flex-row sm:items-start">
            <div
              className="mx-auto flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-ink text-xl font-semibold tracking-tight text-white sm:mx-0"
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1 space-y-4 text-center sm:text-left">
              <div>
                <div className="cs-label mb-1">Username</div>
                <p className="text-base font-semibold text-ink">{username}</p>
              </div>
              <div>
                <div className="cs-label mb-1">Email</div>
                <p className="break-all font-mono text-sm text-ink">{user?.email ?? "—"}</p>
              </div>
              <div>
                <div className="cs-label mb-1">Member since</div>
                <p className="text-sm text-ink">{memberSince}</p>
        </div>
        <div>
                <div className="cs-label mb-1">Starting capital</div>
                <p className="font-mono text-lg font-bold tabular-nums text-gold">{formatAud(startingCapital)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="api-card cs-card flex flex-col p-5 md:p-6">
          <h2 className="mb-5 text-sm font-semibold text-ink normal-case">Alpha Vantage API Key</h2>
          <form onSubmit={onSave} className="flex flex-1 flex-col gap-5">
          <div>
              <label htmlFor="account-api-key" className="cs-label mb-2">
                API key
              </label>
            <input
                id="account-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={user?.has_alpha_vantage_key ? "Enter a new key to replace" : "Paste your API key"}
              className="cs-input-mono"
              autoComplete="off"
            />
          </div>
            <p className="text-xs leading-relaxed text-muted">
              Free key from{" "}
          <a
            href="https://www.alphavantage.co/support/#api-key"
            className="font-semibold text-gold underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            alphavantage.co
          </a>
              . ~5 calls/min; end-of-day ASX prices count toward your daily quota below.
            </p>
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] font-mono text-muted">
                <span>Daily usage</span>
                <span className="tabular-nums text-ink">
                  {avUsed} / {avLimit}
                </span>
              </div>
              <div
                className="flex max-w-full flex-nowrap gap-[3px] overflow-x-auto"
                role="img"
                aria-label={`${Math.min(avUsed, avLimit)} of ${avLimit} daily API requests used`}
              >
                {Array.from({ length: Math.max(0, avLimit) }, (_, i) => (
                  <span
                    key={i}
                    className="shrink-0 rounded-[1px]"
                    style={{
                      width: 10,
                      height: 10,
                      backgroundColor: i < avUsed ? "#c8963e" : "#ede9e3",
                    }}
                    aria-hidden
                  />
                ))}
              </div>
            </div>
            {message && <p className="text-sm font-mono font-bold text-profit">{message}</p>}
            {error && <p className="text-sm font-mono font-semibold text-danger">{error}</p>}
            <button
              type="submit"
              disabled={saving || !apiKey.trim()}
              className="mt-auto w-full rounded-card bg-ink px-5 py-3 text-sm font-semibold text-white shadow-card-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save API Key"}
            </button>
          </form>
        </div>

        <div className="account-lb-visibility-card cs-card flex flex-col gap-4 p-5 md:p-6">
          <h2 className="text-sm font-semibold text-ink">Private or public account</h2>
          <p className="text-sm leading-relaxed text-muted">
            Choose whether your <strong className="font-semibold text-ink">paper trading</strong> row can appear on
            community leaderboards. You are always anonymous (no username). The same choice is available on{" "}
            <Link to="/trade" className="font-semibold text-gold underline-offset-2 hover:underline">
              Trade
            </Link>
            .
          </p>
          {paperLbLoading ? (
            <p className="text-sm font-mono text-muted">Loading leaderboard settings…</p>
          ) : paperLbError ? (
            <p className="text-sm font-mono font-semibold text-danger">{paperLbError}</p>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-muted">
                You can switch anytime. If you have not traded yet, a paper leaderboard row is created when you save your
                choice so your preference is remembered.
              </p>
              <fieldset
                className="account-lb-fieldset"
                disabled={paperShareBusy}
                aria-busy={paperShareBusy}
              >
                <legend className="sr-only">Paper account visibility on leaderboards</legend>
                <label
                  className={`account-lb-option ${!(paperLbEntry?.share_public ?? false) ? "account-lb-option--selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="account-lb-visibility"
                    className="sr-only"
                    checked={!(paperLbEntry?.share_public ?? false)}
                    onChange={() => void onPaperShareToggle(false)}
                  />
                  <span className="account-lb-option-title">Private account</span>
                  <span className="account-lb-option-desc">
                    Your paper results are not shown on community leaderboards.
                  </span>
                </label>
                <label
                  className={`account-lb-option ${paperLbEntry?.share_public ? "account-lb-option--selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="account-lb-visibility"
                    className="sr-only"
                    checked={Boolean(paperLbEntry?.share_public)}
                    onChange={() => void onPaperShareToggle(true)}
                  />
                  <span className="account-lb-option-title">Public account</span>
                  <span className="account-lb-option-desc">
                    Your paper row can appear on leaderboards anonymously (no username).
                  </span>
                </label>
              </fieldset>
            </>
          )}
        </div>

        <div
          className="simulator-card rounded-card border p-5 shadow-card md:p-6"
          style={{ borderColor: "#f0e0e0", backgroundColor: "#fffafa" }}
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-center">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                {goldTitleMarker()}
                <h2 className="text-sm font-semibold text-ink">New Session</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                Clear all trades, holdings, and performance history and reset cash to {formatAud(startingCapital)}. Your
                sign-in and API key are unchanged. This cannot be undone.
              </p>
            </div>
            <div className="flex md:justify-end">
              <button
                type="button"
                className="rounded-card border-2 border-danger bg-transparent px-5 py-3 text-sm font-semibold text-danger shadow-card-sm transition-colors hover:bg-danger/[0.06]"
                onClick={() => setResetOpen(true)}
              >
                Reset Account
              </button>
            </div>
          </div>
        </div>
      </div>

      <ResetSessionModal
        open={resetOpen}
        busy={resetBusy}
        onClose={() => {
          if (!resetBusy) setResetOpen(false);
        }}
        onConfirm={confirmResetSession}
      />
    </div>
  );
}
