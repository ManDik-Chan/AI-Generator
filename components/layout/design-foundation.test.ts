import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appShellWidthClasses } from "@/components/layout/layout-variants";
import { mobileNavigation, navigationGroups } from "@/components/layout/navigation";

describe("application shell design foundation", () => {
  it("provides reading, standard, wide and full layouts", () => expect(appShellWidthClasses).toEqual({ reading: "max-w-3xl", standard: "max-w-5xl", wide: "max-w-[90rem]", full: "max-w-none" }));
  it("keeps only real product destinations in navigation", () => {
    const desktopHrefs = navigationGroups.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    const mobileHrefs = mobileNavigation.map((item) => item.href);
    const hrefs: string[] = [...desktopHrefs, ...mobileHrefs];

    expect(hrefs).toContain("/chat");
    expect(hrefs).toContain("/personas");
    expect(hrefs).toContain("/memories");
    expect(hrefs).toContain("/tools");
    expect(hrefs).not.toContain("/create");
    expect(hrefs).not.toContain("/settings");
  });
  it("removes development phase copy from the product shell and home", () => { const ui = ["components/layout/desktop-sidebar.tsx", "components/layout/mobile-navigation.tsx", "features/home/components/home-dashboard.tsx"].map((path) => readFileSync(path, "utf8")).join("\n"); expect(ui).not.toMatch(/Phase\s*\d/i); });
  it("honors reduced motion and mobile safe areas", () => { const css = readFileSync("app/globals.css", "utf8"); const mobile = readFileSync("components/layout/mobile-navigation.tsx", "utf8"); expect(css).toContain("prefers-reduced-motion: reduce"); expect(css).toContain("env(safe-area-inset-bottom)"); expect(mobile).toContain("min-h-12"); });
});
