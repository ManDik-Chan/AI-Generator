export const THEME_STORAGE_KEY = "ai-generator-theme";
export const themeValues = ["light", "dark", "system"] as const;
export type ThemePreference = typeof themeValues[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export function parseTheme(value: unknown): ThemePreference {
  return typeof value === "string" && themeValues.includes(value as ThemePreference) ? value as ThemePreference : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === "system" ? systemDark ? "dark" : "light" : preference;
}

export const themeInitializationScript = `(()=>{try{const k='${THEME_STORAGE_KEY}',v=localStorage.getItem(k),p=v==='light'||v==='dark'||v==='system'?v:'system',d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches),e=document.documentElement;e.classList.toggle('dark',d);e.dataset.theme=p;e.style.colorScheme=d?'dark':'light'}catch{}})()`;
