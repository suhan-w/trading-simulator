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
};
