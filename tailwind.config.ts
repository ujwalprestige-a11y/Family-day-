import type { Config } from "tailwindcss";

// Prestige brand tokens. Change the brand in one place here (and the matching
// CSS variables in app/globals.css :root).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#FFFFFF",
        ink: "#1F1A12",
        "ink-2": "#5B5648",
        paper: "#FBF8F1",
        "soft-gold": "#F3ECDB",
        line: "#E4DCC8",
        "line-2": "#CDBF9C",
        gold: "#A88944", // large text, borders, fills, icons
        "gold-ink": "#8A6D2B", // small gold text (>=4.5:1 on white)
        "gold-hover": "#8F7337",
        "paid-fill": "#EADBB4",
        danger: "#B3261E",
        ok: "#2E7D4F",
      },
      fontFamily: {
        display: ["Grandview", "Segoe UI", "var(--font-body)", "Arial", "sans-serif"],
        body: ["Grandview", "Segoe UI", "var(--font-body)", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
