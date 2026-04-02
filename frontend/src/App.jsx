import { Route, Routes, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Trade from "./pages/Trade";
import Backtest from "./pages/Backtest";
import Leaderboard from "./pages/Leaderboard";

function GuestGate({ error, onRetry }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-surface-900">
      <div className="max-w-md text-center space-y-6">
        <h1 className="text-2xl font-semibold text-white">Could not connect</h1>
        <p className="text-slate-400 text-sm">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="px-6 py-3 rounded-lg bg-accent text-surface-900 font-semibold hover:bg-accent-dim"
        >
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
      <div className="min-h-screen flex items-center justify-center text-slate-400 bg-surface-900">
        Loading…
      </div>
    );
  }
  if (!user) {
    if (guestError) {
      return <GuestGate error={guestError} onRetry={() => refresh()} />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 bg-surface-900">
        Starting…
      </div>
    );
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
        <Route index element={<Dashboard />} />
        <Route path="trade" element={<Trade />} />
        <Route path="backtest" element={<Backtest />} />
        <Route path="leaderboard" element={<Leaderboard />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
