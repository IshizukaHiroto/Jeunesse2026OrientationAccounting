/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./assets/**/*.js"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'M PLUS 1p'", "sans-serif"],
        body: ["'BIZ UDPGothic'", "sans-serif"]
      },
      colors: {
        court: {
          50: "#f4f7f1",
          100: "#e7efe2",
          300: "#9fc18e",
          500: "#4f8a4a",
          700: "#2f5f33",
          900: "#1c3a22"
        },
        clay: {
          100: "#fff1e6",
          500: "#c86134",
          700: "#8f3f22"
        },
        ink: {
          900: "#1f2a24"
        }
      },
      boxShadow: {
        panel: "0 10px 30px rgba(31, 42, 36, 0.08)"
      }
    }
  },
  plugins: []
};
