import { Route, Routes, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import AuthLanding from "./pages/AuthLanding";
import PortfolioPage from "./pages/PortfolioPage";
import PerformanceReport from "./pages/PerformanceReport";
import Account from "./pages/Account";

function GuestGate({ error, onRetry }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-canvas font-sans text-ink">
      <div className="cs-card max-w-sm p-6 text-center space-y-4">
        <h1 className="text-sm font-semibold text-ink">Could not connect</h1>
        <p className="text-sm text-muted leading-relaxed">{error}</p>
        <button type="button" onClick={onRetry} className="cs-btn-buy w-full">
          Retry
        </button>
      </div>
    </div>
  );
}

function Protected({ children }) {
  const { user, loading, guestError, refresh } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas font-sans">
        <span className="text-sm font-medium text-muted">Loading…</span>
      </div>
    );
  }
  if (!user) {
    if (guestError) {
      return <GuestGate error={guestError} onRetry={() => refresh()} />;
    }
    return <AuthLanding />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<PortfolioPage />} />
        <Route path="portfolio" element={<Navigate to="/" replace />} />
        <Route path="performance" element={<PerformanceReport />} />
        <Route path="account" element={<Account />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
