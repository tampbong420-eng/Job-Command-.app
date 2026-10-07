import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        foreground: "#efefef",
        card: {
          DEFAULT: "#141414",
          foreground: "#efefef",
        },
        popover: {
          DEFAULT: "#141414",
          foreground: "#efefef",
        },
        primary: {
          DEFAULT: "#b2ff00",
          foreground: "#141800",
        },
        secondary: {
          DEFAULT: "#141414",
          foreground: "#efefef",
        },
        muted: {
          DEFAULT: "#141414",
          foreground: "#999999",
        },
        accent: {
          DEFAULT: "#b2ff00",
          foreground: "#141800",
        },
        destructive: {
          DEFAULT: "#ff3b30",
        },
        border: "#333333",
        input: "#333333",
        ring: "#b2ff00",
        live: "#b2ff00",
        warn: "#facc15",
        boss: "#b2ff00",
        lime: "#b2ff00",
        metal: {
          0: "#0a0a0a",
          1: "#141414",
          2: "#1c1c1c",
          3: "#333333",
        },
        /* Universal UI Skin tokens */
        skin: {
          canvas: "#0a0a0a",
          char1: "#141414",
          char2: "#1c1c1c",
          neon: "#b2ff00",
          neonsoft: "#9eff00",
          safety: "#ff6600",
          amber: "#f59e0b",
          gold: "#c9a227",
          goldink: "#e8d48b",
          blood: "#7f1d1d",
          bronze: "#3f2a14",
          slate: "#1e293b",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        heading: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
