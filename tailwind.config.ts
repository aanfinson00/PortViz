import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          vacant: "#9ca3af",
          pending: "#f59e0b",
          leased: "#2563eb",
          available: "#10b981",
        },
      },
    },
  },
  plugins: [],
};

export default config;
