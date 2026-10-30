export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950:"#09090B", 900:"#0C0D10", 850:"#121316", 800:"#16171C", 750:"#1E1F25", 700:"#26272E" },
        hairline: "rgba(255,255,255,0.07)"
      },
      fontFamily: {
        sans: ['"Inter Tight"','Inter','system-ui','sans-serif'],
        mono: ['"JetBrains Mono"','ui-monospace','monospace']
      }
    }
  },
  plugins: []
}
