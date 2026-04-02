const base = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
  const res = await fetch(`${base}${path}`, { ...options, headers });
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
    const msg = data?.detail || data?.message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  register: (email, password) =>
    request("/api/auth/register", { method: "POST", body: { email, password } }),
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", body: { email, password } }),
  me: () => request("/api/auth/me"),
  logout: () => request("/api/auth/logout", { method: "POST" }),

  search: (q) => request(`/api/market/search?q=${encodeURIComponent(q)}`),
  quote: (ticker) => request(`/api/market/quote/${encodeURIComponent(ticker)}`),
  chart: (ticker, period = "3mo") =>
    request(`/api/market/chart/${encodeURIComponent(ticker)}?period=${period}`),

  placeOrder: (body) => request("/api/orders", { method: "POST", body }),
  orders: () => request("/api/orders"),
  transactions: () => request("/api/transactions"),

  portfolio: () => request("/api/portfolio"),

  backtest: (body) => request("/api/backtest", { method: "POST", body }),

  leaderboard: () => request("/api/leaderboard"),
};
