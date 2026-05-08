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
  const { timeoutMs, ...rest } = options;
  const headers = { ...rest.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (rest.body && typeof rest.body === "object" && !(rest.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    rest.body = JSON.stringify(rest.body);
  }
  const controller = new AbortController();
  const tid =
    timeoutMs != null
      ? setTimeout(() => {
          controller.abort();
        }, timeoutMs)
      : null;
  let res;
  try {
    res = await fetch(`${base}${path}`, { ...rest, headers, signal: controller.signal });
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error("Request timed out. Try a shorter date range or check your network.");
    }
    const msg =
      e instanceof TypeError
        ? "Cannot reach the API. Start the backend on port 8000, or set VITE_API_URL."
        : String(e);
    throw new Error(msg);
  } finally {
    if (tid) clearTimeout(tid);
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
    let msg = data?.detail ?? data?.message ?? res.statusText;
    if (Array.isArray(msg)) {
      msg = msg
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item.msg === "string") return item.msg;
          try {
            return JSON.stringify(item);
          } catch {
            return String(item);
          }
        })
        .join(" ");
    } else if (msg && typeof msg === "object") {
      msg = JSON.stringify(msg);
    }
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
  verifyEmail: (body) => request("/api/auth/verify-email", { method: "POST", body }),
  resendVerification: (body) => request("/api/auth/resend-verification", { method: "POST", body }),
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

  runCodeBacktest: (body) =>
    request("/api/backtest/run-code", { method: "POST", body, timeoutMs: 120_000 }),

  leaderboard: (start, end) =>
    request(
      `/api/leaderboard?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    ),
  leaderboardCommunityMonthly: () => request("/api/leaderboard/community/monthly"),
  leaderboardCommunityHallOfFame: () => request("/api/leaderboard/community/hall-of-fame"),
  leaderboardCommunityAlltime: (windowKey = "all") =>
    request(`/api/leaderboard/community/alltime?window=${encodeURIComponent(windowKey)}`),
  leaderboardMine: () => request("/api/leaderboard/mine"),
  leaderboardEntry: (id) => request(`/api/leaderboard/entries/${encodeURIComponent(id)}`),
  patchLeaderboardEntry: (id, body) =>
    request(`/api/leaderboard/entries/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  /** Creates paper row if needed (e.g. before first trade), then sets share_public. */
  patchPaperLeaderboardSharing: (body) =>
    request("/api/leaderboard/mine/paper-sharing", { method: "PATCH", body }),

  /** Admin API (Bearer must be moderator or super_admin JWT). */
  admin: {
    stats: () => request("/api/admin/stats"),
    users: (params = {}) => {
      const q = new URLSearchParams();
      if (params.page != null) q.set("page", String(params.page));
      if (params.per_page != null) q.set("per_page", String(params.per_page));
      if (params.search?.trim()) q.set("search", params.search.trim());
      if (params.role?.trim()) q.set("role", params.role.trim());
      if (params.is_suspended != null && params.is_suspended !== "")
        q.set("is_suspended", String(params.is_suspended));
      if (params.include_guests === true) q.set("include_guests", "true");
      const qs = q.toString();
      return request(`/api/admin/users${qs ? `?${qs}` : ""}`);
    },
    user: (id) => request(`/api/admin/users/${encodeURIComponent(id)}`),
    userTrades: (id, params = {}) => {
      const q = new URLSearchParams();
      if (params.limit != null) q.set("limit", String(params.limit));
      if (params.offset != null) q.set("offset", String(params.offset));
      const qs = q.toString();
      return request(`/api/admin/users/${encodeURIComponent(id)}/trades${qs ? `?${qs}` : ""}`);
    },
    suspend: (id, reason) =>
      request(`/api/admin/users/${encodeURIComponent(id)}/suspend`, { method: "POST", body: { reason } }),
    unsuspend: (id) => request(`/api/admin/users/${encodeURIComponent(id)}/unsuspend`, { method: "POST" }),
    resetBalance: (id, body) =>
      request(`/api/admin/users/${encodeURIComponent(id)}/reset-balance`, { method: "POST", body }),
    deleteUser: (id) => request(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
    forceLogout: (id) =>
      request(`/api/admin/users/${encodeURIComponent(id)}/force-logout`, { method: "POST" }),
    grantAdmin: (id, role) =>
      request(`/api/admin/users/${encodeURIComponent(id)}/grant-admin`, { method: "POST", body: { role } }),
    revokeAdmin: (id) =>
      request(`/api/admin/users/${encodeURIComponent(id)}/revoke-admin`, { method: "POST" }),
    auditLog: (params = {}) => {
      const q = new URLSearchParams();
      if (params.page != null) q.set("page", String(params.page));
      if (params.per_page != null) q.set("per_page", String(params.per_page));
      if (params.admin_id != null && params.admin_id !== "") q.set("admin_id", String(params.admin_id));
      if (params.action?.trim()) q.set("action", params.action.trim());
      if (params.target_user_id != null && params.target_user_id !== "")
        q.set("target_user_id", String(params.target_user_id));
      if (params.from_date?.trim()) q.set("from_date", params.from_date.trim());
      if (params.to_date?.trim()) q.set("to_date", params.to_date.trim());
      const qs = q.toString();
      return request(`/api/admin/audit-log${qs ? `?${qs}` : ""}`);
    },
    configList: () => request("/api/admin/config"),
    patchConfig: (key, body) =>
      request(`/api/admin/config/${encodeURIComponent(key)}`, { method: "PATCH", body }),
  },
};

/** Download binary admin export (CSV / PDF). */
export async function downloadAdminExport(path, fallbackName) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `${base}${path}`;
  const res = await fetch(url, { headers });
  if (res.status === 401 && getToken()) {
    setToken(null);
    window.dispatchEvent(new Event("auth:logout"));
  }
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
  const blob = await res.blob();
  let filename = fallbackName || "download";
  const cd = res.headers.get("Content-Disposition");
  if (cd) {
    const m = /filename="?([^";\n]+)"?/i.exec(cd);
    if (m) filename = m[1].trim();
  }
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

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
