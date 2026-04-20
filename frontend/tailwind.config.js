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
        // Cream / beige family (cards, banners, soft borders)
        beige: {
          50: "#faf9f7",
          100: "#fdf8f0",
          200: "#ede9e3",
          300: "#e8d5b0",
        },
        // Neutral grey scale (subdued text, code editor bg)
        grey: {
          400: "#999999",
          500: "#888888",
          600: "#666666",
          800: "#555555",
          900: "#1a1a1a",
        },
      },
      borderRadius: {
        // Keep Tailwind's sm/md/lg/xl defaults — existing code depends on them.
        card: "12px",
        pill: "999px",
        soft: "10px", // favored for sub-cards, banners, inputs
        chunky: "14px", // favored for outer cards / hero panels
      },
      boxShadow: {
        card: "0 2px 16px rgba(17, 17, 17, 0.06), 0 1px 4px rgba(17, 17, 17, 0.04)",
        "card-sm": "0 1px 8px rgba(17, 17, 17, 0.05), 0 1px 2px rgba(17, 17, 17, 0.03)",
        elevated: "0 4px 12px rgba(17, 17, 17, 0.04)",
        modal: "0 4px 24px rgba(0, 0, 0, 0.08)",
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
