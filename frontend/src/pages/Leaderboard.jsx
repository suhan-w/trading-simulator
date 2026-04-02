import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.leaderboard();
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Leaderboard</h1>
        <p className="text-slate-400 text-sm">Ranked by % gain/loss vs $100,000 starting balance.</p>
      </div>

      {err && <div className="text-danger text-sm">{err}</div>}

      <div className="rounded-xl border border-surface-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-700 bg-surface-800 text-left text-slate-400">
              <th className="px-4 py-3 font-medium">Rank</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Equity</th>
              <th className="px-4 py-3 font-medium">Return</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-b border-surface-700/60 font-mono">
                <td className="px-4 py-3 text-slate-300">{r.rank}</td>
                <td className="px-4 py-3 text-white">{r.email}</td>
                <td className="px-4 py-3">${r.total_equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className={`px-4 py-3 ${r.gain_loss_pct >= 0 ? "text-accent" : "text-danger"}`}>
                  {r.gain_loss_pct >= 0 ? "+" : ""}
                  {r.gain_loss_pct.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !err && (
          <p className="text-center text-slate-500 py-12">No users yet.</p>
        )}
      </div>
    </div>
  );
}
