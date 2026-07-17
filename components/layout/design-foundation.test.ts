import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appShellWidthClasses } from "@/components/layout/layout-variants";
import {
  mobileNavigation,
  navigationGroups,
} from "@/components/layout/navigation";

describe("approved premium application shell", () => {
  it("provides reading, standard, wide and full layouts", () =>
    expect(appShellWidthClasses).toEqual({
      reading: "max-w-[48rem]",
      standard: "max-w-[65rem]",
      wide: "max-w-[77.75rem]",
      full: "max-w-none",
    }));

  it("keeps only real product destinations in grouped navigation", () => {
    const desktopHrefs = navigationGroups.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    const mobileHrefs = mobileNavigation.map((item) => item.href);
    const hrefs: string[] = [...desktopHrefs, ...mobileHrefs];

    expect(navigationGroups.map((group) => group.label)).toEqual([
      "工作空间",
      "效率工具",
    ]);
    expect(hrefs).toContain("/chat");
    expect(hrefs).toContain("/personas");
    expect(hrefs).toContain("/memories");
    expect(hrefs).toContain("/tools");
    expect(hrefs).toContain("/tools/image");
    expect(hrefs).not.toContain("/create");
    expect(hrefs).not.toContain("/settings");
  });

  it("uses a real centered new-chat route in the floating mobile tabbar", () => {
    const mobile = readFileSync(
      "components/layout/mobile-navigation.tsx",
      "utf8",
    );
    expect(mobile).toContain('aria-label="新建对话"');
    expect(mobile).toContain('href="/chat"');
    expect(mobile).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.5rem_minmax(0,1fr)_minmax(0,1fr)]");
  });

  it("switches to the mobile shell through 820px and supports 390px structure", () => {
    const shell = readFileSync("components/layout/app-shell.tsx", "utf8");
    const sidebar = readFileSync(
      "components/layout/desktop-sidebar.tsx",
      "utf8",
    );
    const home = readFileSync(
      "features/home/components/home-dashboard.tsx",
      "utf8",
    );
    expect(shell).toContain("min-[821px]:ml-");
    expect(sidebar).toContain("min-[821px]:flex");
    expect(home).toContain("min-[521px]:grid-cols-2");
  });

  it("removes development phases and prototype-only fake features", () => {
    const ui = [
      "components/layout/desktop-sidebar.tsx",
      "components/layout/mobile-navigation.tsx",
      "features/home/components/home-dashboard.tsx",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(ui).not.toMatch(/Phase\s*\d/i);
    expect(ui).not.toContain("ManDik");
    expect(ui).not.toContain("网页分析");
    expect(ui).not.toContain("自定义首页");
    expect(ui).not.toContain("隐私中心");
    expect(ui).not.toContain("18 条消息");
  });

  it("honors reduced motion and mobile safe areas", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const mobile = readFileSync(
      "components/layout/mobile-navigation.tsx",
      "utf8",
    );
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("env(safe-area-inset-bottom, 0px)");
    expect(mobile).toContain("var(--safe-area-bottom)");
  });

  it("opens the desktop profile menu upward without changing its role links", () => {
    const sidebar = readFileSync(
      "components/layout/desktop-sidebar.tsx",
      "utf8",
    );

    expect(sidebar).toContain('placement="top-end"');
    expect(sidebar).toContain('href="/account"');
    expect(sidebar).toContain("账号与设置");
    expect(sidebar).toContain('viewer?.role === "ADMIN"');
    expect(sidebar).toContain('href="/admin"');
    expect(sidebar).toContain("系统管理");
    expect(sidebar).toContain("min-h-0 flex-1");
    expect(sidebar).toContain("overflow-y-auto");
    expect(sidebar).toContain("mt-auto shrink-0");
  });
});
