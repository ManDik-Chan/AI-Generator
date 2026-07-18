import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        background: "hsl(var(--background))",
        "background-subtle": "hsl(var(--background-subtle))",
        foreground: "hsl(var(--foreground))",
        surface: { DEFAULT: "hsl(var(--surface))", foreground: "hsl(var(--surface-foreground))", raised: "hsl(var(--surface-raised))", subtle: "hsl(var(--surface-subtle))", muted: "hsl(var(--surface-muted))" },
        overlay: "hsl(var(--overlay))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
          subtle: "hsl(var(--primary-subtle))",
          "subtle-foreground": "hsl(var(--primary-subtle-foreground))",
        },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))", gold: "hsl(var(--accent-gold))" },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: { DEFAULT: "hsl(var(--surface-raised))", foreground: "hsl(var(--surface-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))", subtle: "hsl(var(--success-subtle))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))", subtle: "hsl(var(--warning-subtle))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))", subtle: "hsl(var(--destructive-subtle))" },
        info: { DEFAULT: "hsl(var(--info))", foreground: "hsl(var(--info-foreground))", subtle: "hsl(var(--info-subtle))" },
        "focus-ring": "hsl(var(--focus-ring))",
      },
      borderRadius: {
        control: "var(--radius-control)", card: "var(--radius-card)", panel: "var(--radius-panel)", dialog: "var(--radius-dialog)", sheet: "var(--radius-sheet)", overlay: "var(--radius-overlay)", display: "var(--radius-display)",
        xl: "var(--radius-card)", "2xl": "var(--radius-overlay)",
      },
      boxShadow: {
        soft: "0 10px 28px hsl(var(--overlay) / .08)",
        raised: "0 20px 52px hsl(var(--overlay) / .13)",
        overlay: "0 28px 72px hsl(var(--overlay) / .18)",
      },
      transitionDuration: { fast: "140ms", panel: "220ms" },
    },
  },
  plugins: [],
};

export default config;
