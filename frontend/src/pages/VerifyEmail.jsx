import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { verifyEmailCode } = useAuth();
  const initialEmail = useMemo(() => (params.get("email") || "").trim(), [params]);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const em = email.trim();
    const digits = code.replace(/\D/g, "");
    if (!em) {
      setError("Enter the email you registered with.");
      return;
    }
    if (digits.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      await verifyEmailCode(em, digits);
      try {
        sessionStorage.removeItem("cowrie_pending_verify_email");
      } catch {
        /* ignore */
      }
      navigate("/", { replace: true });
    } catch (err) {
      setError(err?.message || "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-canvas font-sans text-ink">
      <div className="cs-card w-full max-w-md space-y-4 p-6">
        <h1 className="text-lg font-semibold text-ink">Verify your email</h1>
        <p className="text-sm text-muted leading-relaxed">
          Enter the email you used to register and the 6-digit code we sent you.
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
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
            <label className="cs-label mb-2">Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="cs-input-mono tracking-widest text-center text-lg"
            />
          </div>
          {error ? <p className="text-sm font-mono font-semibold text-danger">{error}</p> : null}
          <button type="submit" disabled={busy} className="cs-btn-buy w-full">
            {busy ? "Verifying…" : "Verify and continue"}
          </button>
        </form>
        <p className="text-center text-sm">
          <Link to="/" className="font-semibold text-gold underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
