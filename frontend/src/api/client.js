/**
 * Default: same-origin `/api` (Vite dev proxy, or nginx → FastAPI in Docker).
 * Set VITE_API_URL only if the API is on another origin.
 */
function apiBase() {
  const v = import.meta.env.VITE_API_URL;
  if (v !== undefined && v !== null && String(v).trim() !== "") {
    return String(v).replace(/\/$/, "");
  }
  return "";
}
const base = apiBase();

export function getToken() {
  return localStorage.getItem("token");
}

export function setToken(t) {
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}

async function request(path, options = {}) {
  const headers = { ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  let res;
  try {
    res = await fetch(`${base}${path}`, { ...options, headers });
  } catch (e) {
    const msg =
      e instanceof TypeError
        ? "Cannot reach the API. Start the backend on port 8000, or set VITE_API_URL."
        : String(e);
    throw new Error(msg);
  }
  if (res.status === 401 && getToken()) {
    setToken(null);
    window.dispatchEvent(new Event("auth:logout"));
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    let msg = data?.detail || data?.message || res.statusText;
    if (res.status === 404 && String(path).startsWith("/api")) {
      msg =
        typeof msg === "string" && msg === "Not Found"
          ? "API not found. Use Vite with the backend running or set VITE_API_URL."
          : msg;
    }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  guest: () => request("/api/auth/guest", { method: "POST" }),
  register: (body) => request("/api/auth/register", { method: "POST", body }),
  login: (body) => request("/api/auth/login", { method: "POST", body }),
  me: () => request("/api/auth/me"),
  updateAlphaVantageKey: (alpha_vantage_api_key) =>
    request("/api/auth/alpha-vantage-key", { method: "PATCH", body: { alpha_vantage_api_key } }),
  resetSession: () => request("/api/auth/reset-session", { method: "POST" }),
  logout: () => request("/api/auth/logout", { method: "POST" }),

  marketSession: () => request("/api/market/session"),
  asx200Index: () => request("/api/market/asx200-index"),
  quote: (ticker) => request(`/api/market/quote/${encodeURIComponent(ticker)}`),
  placeOrder: (body) => request("/api/orders", { method: "POST", body }),
  portfolio: () => request("/api/portfolio"),
  equityDaily: (start, end) =>
    request(
      `/api/portfolio/equity-daily?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    ),
  holdingSparklines: (days = 90) =>
    request(`/api/portfolio/holding-sparklines?days=${encodeURIComponent(days)}`),
  ohlcvRange: (ticker, start, end) =>
    request(
      `/api/portfolio/ohlcv/${encodeURIComponent(ticker)}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    ),

  performanceReport: (start, end) =>
    request(`/api/performance/report?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),

  performanceSummaryReport: (start, end, extras = {}) => {
    const body = { start, end };
    if (extras.strategyTitle?.trim()) body.strategy_title = extras.strategyTitle.trim();
    if (extras.strategyNotes?.trim()) body.strategy_notes = extras.strategyNotes.trim();
    return request("/api/performance/summary-report", { method: "POST", body });
  },

  async performanceSummaryReportPdfBlob(start, end, extras = {}) {
    const headers = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const body = { start, end };
    if (extras.strategyTitle?.trim()) body.strategy_title = extras.strategyTitle.trim();
    if (extras.strategyNotes?.trim()) body.strategy_notes = extras.strategyNotes.trim();
    const url = `${base}/api/performance/summary-report.pdf`;
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text();
      let msg = text;
      try {
        const j = JSON.parse(text);
        msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? text);
      } catch {
        /* ignore */
      }
      throw new Error(typeof msg === "string" ? msg : res.statusText);
    }
    return res.blob();
  },

  runCodeBacktest: (body) => request("/api/backtest/run-code", { method: "POST", body }),

  leaderboard: (start, end) =>
    request(
      `/api/leaderboard?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    ),
  leaderboardMine: () => request("/api/leaderboard/mine"),
  leaderboardEntry: (id) => request(`/api/leaderboard/entries/${encodeURIComponent(id)}`),
  patchLeaderboardEntry: (id, body) =>
    request(`/api/leaderboard/entries/${encodeURIComponent(id)}`, { method: "PATCH", body }),
};

/** After a market order, paper snapshot is refreshed in a background task; poll until the row exists. */
export async function fetchPaperLeaderboardEntryIdWithRetry(maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i++) {
    const rows = await api.leaderboardMine();
    const paper = rows.find((r) => r.source === "paper");
    if (paper?.id != null) return paper.id;
    await new Promise((r) => setTimeout(r, 250 + i * 150));
  }
  return null;
}
