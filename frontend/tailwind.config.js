/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f5f3ef",
        ink: "#111111",
        muted: "#aaaaaa",
        line: "rgba(17, 17, 17, 0.06)",
        card: "#ffffff",
        gold: "#c8963e",
        profit: "#2d8a55",
        danger: "#c0392b",
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 2px 16px rgba(17, 17, 17, 0.06), 0 1px 4px rgba(17, 17, 17, 0.04)",
        "card-sm": "0 1px 8px rgba(17, 17, 17, 0.05), 0 1px 2px rgba(17, 17, 17, 0.03)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
    },
  },
  plugins: [],
};
