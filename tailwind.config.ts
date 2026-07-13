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
        foreground: "hsl(var(--foreground))",
        surface: { DEFAULT: "hsl(var(--surface))", foreground: "hsl(var(--surface-foreground))", raised: "hsl(var(--surface-raised))", subtle: "hsl(var(--surface-subtle))" },
        overlay: "hsl(var(--overlay))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
          subtle: "hsl(var(--primary-subtle))",
          "subtle-foreground": "hsl(var(--primary-subtle-foreground))",
        },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
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
        control: "var(--radius-control)", card: "var(--radius-card)", overlay: "var(--radius-overlay)", display: "var(--radius-display)",
        xl: "var(--radius-card)", "2xl": "var(--radius-overlay)",
      },
      boxShadow: {
        soft: "0 14px 40px -24px hsl(var(--overlay) / .32)",
        raised: "0 18px 50px -28px hsl(var(--overlay) / .42)",
        overlay: "0 28px 90px -34px hsl(var(--overlay) / .62)",
      },
      transitionDuration: { fast: "140ms", panel: "220ms" },
    },
  },
  plugins: [],
};

export default config;
