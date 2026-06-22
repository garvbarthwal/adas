/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dashboard surface palette (matches the design system).
        ink: "#07090f", // app background
        panel: "#0c1322", // side panels / cards container
        video: "#040810", // video stage background
        surface: {
          900: "#07090f",
          800: "#0c1322",
          700: "#111c2e",
          600: "#1f2937",
        },
        accent: "#38bdf8",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      animation: {
        "live-dot": "live-dot 1.5s ease-in-out infinite",
        "live-ring": "live-ring 1.5s ease-in-out infinite",
        "scan-v": "scan-v 4.5s linear infinite",
        "fade-slide": "fade-slide 0.2s ease",
        "radar-sweep": "radar-sweep 4s linear infinite",
      },
      keyframes: {
        "live-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
        "live-ring": {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "100%": { transform: "scale(2.8)", opacity: "0" },
        },
        "scan-v": {
          "0%": { top: "-4px", opacity: "0.4" },
          "50%": { opacity: "0.12" },
          "100%": { top: "105%", opacity: "0" },
        },
        "fade-slide": {
          from: { opacity: "0", transform: "translateY(-5px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "radar-sweep": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
      },
    },
  },
  plugins: [],
};
