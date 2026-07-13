import { describe, expect, it } from "vitest";
import { parseTheme, resolveTheme, THEME_STORAGE_KEY, themeInitializationScript } from "@/lib/theme";

describe("theme preference", () => {
  it("parses supported preferences", () => { expect(parseTheme("light")).toBe("light"); expect(parseTheme("dark")).toBe("dark"); expect(parseTheme("system")).toBe("system"); });
  it("falls back invalid stored values to system", () => { expect(parseTheme("sepia")).toBe("system"); expect(parseTheme(null)).toBe("system"); });
  it("resolves system preference", () => { expect(resolveTheme("system", true)).toBe("dark"); expect(resolveTheme("system", false)).toBe("light"); expect(resolveTheme("light", true)).toBe("light"); });
  it("initializes before hydration from persistent storage", () => { expect(themeInitializationScript).toContain(THEME_STORAGE_KEY); expect(themeInitializationScript).toContain("localStorage.getItem"); expect(themeInitializationScript).toContain("classList.toggle('dark'"); expect(themeInitializationScript).toContain("matchMedia"); });
});
