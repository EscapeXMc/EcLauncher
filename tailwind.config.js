/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        glass: {
          50: "rgba(255, 255, 255, 0.05)",
          100: "rgba(255, 255, 255, 0.08)",
          200: "rgba(255, 255, 255, 0.12)",
          300: "rgba(255, 255, 255, 0.18)",
          400: "rgba(255, 255, 255, 0.25)",
        },
        neon: {
          blue: "#00aaff",
          pink: "#ff3366",
          purple: "#b847ff",
          green: "#00e6a0",
          orange: "#ff7733",
          red: "#ff4466",
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        neon: "0 0 15px rgba(0, 170, 255, 0.3), 0 0 45px rgba(0, 170, 255, 0.1)",
        "neon-pink": "0 0 15px rgba(255, 51, 102, 0.3), 0 0 45px rgba(255, 51, 102, 0.1)",
        "neon-purple": "0 0 15px rgba(184, 71, 255, 0.3), 0 0 45px rgba(184, 71, 255, 0.1)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.37)",
        "glass-inset": "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
      },
      animation: {
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "slide-up": "slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 0.3s ease-out",
        shimmer: "shimmer 2s linear infinite",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "slide-up": {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [],
};
