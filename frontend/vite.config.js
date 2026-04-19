import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Dev: browser calls same origin `/api/*` → proxied to FastAPI (avoids CORS when using LAN IP or 127.0.0.1). */
const apiTarget = process.env.VITE_PROXY_API || "http://127.0.0.1:8000";

/** Hint caches not to treat the SPA shell as long-lived; hashed /assets/* stay immutable. */
function htmlCacheHintsPlugin() {
  return {
    name: "cowrie-html-cache-hints",
    transformIndexHtml(html) {
      const stamp = new Date().toISOString();
      const inject = `    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />\n    <meta http-equiv="Pragma" content="no-cache" />\n    <!-- cowrie-build:${stamp} -->\n`;
      return html.replace("<head>", `<head>\n${inject}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), htmlCacheHintsPlugin()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
