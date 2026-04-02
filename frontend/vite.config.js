import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Dev: browser calls same origin `/api/*` → proxied to FastAPI (avoids CORS when using LAN IP or 127.0.0.1). */
const apiTarget = process.env.VITE_PROXY_API || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
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
