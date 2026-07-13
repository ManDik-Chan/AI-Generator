"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { parseTheme, resolveTheme, THEME_STORAGE_KEY, type ResolvedTheme, type ThemePreference } from "@/lib/theme";

interface ThemeContextValue { theme: ThemePreference; resolvedTheme: ResolvedTheme; setTheme(theme: ThemePreference): void }
const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(preference: ThemePreference) {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveTheme(preference, dark);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.theme = preference;
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setPreference] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const themeRef = useRef<ThemePreference>("system");
  useEffect(() => {
    const initial = parseTheme(localStorage.getItem(THEME_STORAGE_KEY)); themeRef.current = initial; setPreference(initial); setResolvedTheme(applyTheme(initial));
    const media = window.matchMedia("(prefers-color-scheme: dark)"); const onChange = () => setResolvedTheme(applyTheme(themeRef.current)); media.addEventListener("change", onChange); return () => media.removeEventListener("change", onChange);
  }, []);
  const setTheme = useCallback((next: ThemePreference) => { themeRef.current = next; localStorage.setItem(THEME_STORAGE_KEY, next); setPreference(next); setResolvedTheme(applyTheme(next)); }, []);
  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [resolvedTheme, setTheme, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error("useTheme must be used inside ThemeProvider"); return value; }
