/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dashboard surface palette.
        surface: {
          900: "#0b0f17",
          800: "#111827",
          700: "#1f2937",
          600: "#374151",
        },
        accent: "#38bdf8",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
