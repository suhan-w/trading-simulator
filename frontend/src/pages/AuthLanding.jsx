import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function AuthLanding() {
  const { startGuest, register, login, verifyEmailCode } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNotice, setResendNotice] = useState(null);
  /** Plain code when API returns dev_verification_code (non-production when mail not sent). */
  const [devVerificationCode, setDevVerificationCode] = useState(null);

  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("cowrie_pending_verify_email");
      const savedCode = sessionStorage.getItem("cowrie_dev_verify_code");
      if (pending?.trim()) {
        setEmail((prev) => prev.trim() || pending.trim());
        setVerifyNotice(
          "Enter the 6-digit code we sent to your email. If you see a development code below, you can use it without email."
        );
        setMode("login");
      }
      if (savedCode?.trim()) {
        setDevVerificationCode(savedCode.trim());
        setVerifyCode(savedCode.trim());
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function onRegister(e) {
    e.preventDefault();
    setError(null);
    setVerifyNotice(null);
    setResendNotice(null);
    setBusy(true);
    try {
      const result = await register({
        email: email.trim(),
        password,
        alpha_vantage_api_key: apiKey.trim(),
      });
      if (result?.needsVerification) {
        try {
          sessionStorage.setItem("cowrie_pending_verify_email", email.trim());
          const dc = result.devVerificationCode?.trim();
          if (dc) {
            sessionStorage.setItem("cowrie_dev_verify_code", dc);
            setDevVerificationCode(dc);
            setVerifyCode(dc);
          } else {
            sessionStorage.removeItem("cowrie_dev_verify_code");
            setDevVerificationCode(null);
            setVerifyCode("");
          }
        } catch {
          /* ignore */
        }
        setVerifyNotice(
          result.message || "Check your inbox for the 6-digit code, then enter it below."
        );
        if (!result.devVerificationCode?.trim()) {
          setVerifyCode("");
        }
        setVerifyError(null);
        setMode("login");
      }
    } catch (err) {
      setError(err?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function onLogin(e) {
    e.preventDefault();
    setError(null);
    setResendNotice(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyWithCode(e) {
    e.preventDefault();
    setVerifyError(null);
    const em = email.trim();
    const digits = verifyCode.replace(/\D/g, "");
    if (!em) {
      setVerifyError("Enter your email address.");
      return;
    }
    if (digits.length !== 6) {
      setVerifyError("Enter the 6-digit code from your email.");
      return;
    }
    setVerifyBusy(true);
    try {
      await verifyEmailCode(em, digits);
      try {
        sessionStorage.removeItem("cowrie_pending_verify_email");
        sessionStorage.removeItem("cowrie_dev_verify_code");
      } catch {
        /* ignore */
      }
      setDevVerificationCode(null);
    } catch (err) {
      setVerifyError(err?.message || "Verification failed.");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function onResendVerification() {
    const em = email.trim();
    if (!em) {
      setResendNotice("Enter your email above first.");
      return;
    }
    setResendBusy(true);
    setResendNotice(null);
    try {
      const r = await api.resendVerification({ email: em });
      const dc = typeof r?.dev_verification_code === "string" ? r.dev_verification_code.trim() : "";
      if (dc) {
        try {
          sessionStorage.setItem("cowrie_dev_verify_code", dc);
        } catch {
          /* ignore */
        }
        setDevVerificationCode(dc);
        setVerifyCode(dc);
      }
      setResendNotice(typeof r?.detail === "string" ? r.detail : "Check your inbox.");
    } catch (err) {
      setResendNotice(err?.message || "Could not send email.");
    } finally {
      setResendBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-canvas font-sans text-ink">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-ink shadow-card">
            <span className="text-sm font-bold tracking-tight text-white">CS</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="text-ink">Cowrie</span>
              <span className="text-gold">Shell</span>
            </h1>
            <p className="mt-1 text-sm text-muted">Paper trading · ASX · AUD</p>
          </div>
          <p className="text-sm text-muted leading-relaxed max-w-sm">
            Live quotes with your{" "}
            <a
              href="https://www.alphavantage.co/support/#api-key"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-gold underline-offset-2 hover:underline"
            >
              Alpha Vantage
            </a>{" "}
            key.
          </p>
        </div>

        <div className="flex gap-3 rounded-card bg-card p-1.5 shadow-card">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
              if (!verifyNotice) setResendNotice(null);
            }}
            className={`cs-btn-side ${mode === "login" ? "cs-btn-side-active" : ""}`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
              if (!verifyNotice) setResendNotice(null);
            }}
            className={`cs-btn-side ${mode === "register" ? "cs-btn-side-active" : ""}`}
          >
            Register
          </button>
        </div>

        {verifyNotice ? (
          <div className="cs-card space-y-3 p-5 border-l-4 border-gold bg-card">
            <p className="text-sm font-medium text-ink">Almost there</p>
            <p className="text-sm text-muted leading-relaxed">{verifyNotice}</p>
            {devVerificationCode ? (
              <div className="rounded-card border border-gold/40 bg-canvas px-4 py-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Development — code (email not sent)
                </p>
                <p className="text-center font-mono text-2xl font-bold tracking-[0.25em] text-ink">
                  {devVerificationCode}
                </p>
                <p className="text-xs text-muted leading-relaxed">
                  Shown because the server is not in production or email delivery failed. Never exposed in production.
                </p>
              </div>
            ) : null}
            <form onSubmit={(e) => void onVerifyWithCode(e)} className="space-y-3 pt-1">
              <div>
                <label className="cs-label mb-2">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="cs-input"
                  autoComplete="email"
                />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Verification code
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
                placeholder="000000"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                className="cs-input-mono tracking-widest text-center text-lg w-full"
              />
              {verifyError ? (
                <p className="text-sm font-mono font-semibold text-danger">{verifyError}</p>
              ) : null}
              <button type="submit" disabled={verifyBusy} className="cs-btn-buy w-full">
                {verifyBusy ? "Verifying…" : "Verify and continue"}
              </button>
            </form>
            <div className="pt-2 border-t border-ink/[0.06]">
              <p className="text-xs text-muted mb-2 leading-relaxed">
                Didn&apos;t get the email, or your code expired? We can send another to the address above.
              </p>
              <button
                type="button"
                disabled={resendBusy}
                onClick={() => void onResendVerification()}
                className="w-full rounded-card border border-ink/15 bg-card px-4 py-2 text-xs font-semibold text-ink shadow-card-sm hover:border-ink/25 disabled:opacity-50"
              >
                {resendBusy ? "Sending…" : "Send a new code"}
              </button>
              {resendNotice ? <p className="mt-2 text-xs text-muted leading-relaxed">{resendNotice}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setVerifyNotice(null);
                setVerifyCode("");
                setVerifyError(null);
                setResendNotice(null);
                setDevVerificationCode(null);
                setMode("login");
                try {
                  sessionStorage.removeItem("cowrie_pending_verify_email");
                  sessionStorage.removeItem("cowrie_dev_verify_code");
                } catch {
                  /* ignore */
                }
              }}
              className="w-full rounded-card border border-ink/15 bg-transparent px-4 py-2 text-xs font-semibold text-muted hover:border-ink/25"
            >
              Back to sign in
            </button>
          </div>
        ) : mode === "register" ? (
          <form onSubmit={onRegister} className="cs-card space-y-4 p-5">
            <div>
              <label className="cs-label mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="cs-input"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="cs-label mb-2">Password (min 8 characters)</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="cs-input"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="cs-label mb-2">Alpha Vantage API key</label>
              <input
                type="password"
                required
                minLength={8}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="From alphavantage.co"
                className="cs-input-mono"
                autoComplete="off"
              />
            </div>
            {error && <p className="text-sm font-mono font-semibold text-danger">{error}</p>}
            <button type="submit" disabled={busy} className="cs-btn-buy w-full">
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>
        ) : (
          <form onSubmit={onLogin} className="cs-card space-y-4 p-5">
            <div>
              <label className="cs-label mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="cs-input"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="cs-label mb-2">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="cs-input"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm font-mono font-semibold text-danger">{error}</p>}
            <button type="submit" disabled={busy} className="cs-btn-buy w-full">
              {busy ? "Signing in…" : "Log in"}
            </button>
          </form>
        )}

        {!verifyNotice ? (
          <>
            <div className="relative text-center">
              <span className="relative z-[1] inline-flex items-center bg-canvas px-3 text-xs font-semibold uppercase tracking-wide text-muted">
                or
              </span>
              <div className="absolute left-0 right-0 top-1/2 h-px bg-ink/10 -z-0" />
            </div>

            <div className="text-center space-y-2">
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  onClick={() => void startGuest()}
                  disabled={busy}
                  className="text-sm font-semibold text-gold underline-offset-2 hover:underline disabled:opacity-40"
                >
                  Continue as guest
                </button>
                <span className="text-xs font-medium text-ink/[0.2] select-none" aria-hidden>
                  ·
                </span>
                <Link
                  to="/admin"
                  className="text-sm font-semibold text-gold underline-offset-2 hover:underline"
                >
                  Admin portal
                </Link>
              </div>
              <p className="text-xs font-mono text-muted">Add an API key in Account for live prices.</p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
