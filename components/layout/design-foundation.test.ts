import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appShellWidthClasses } from "@/components/layout/layout-variants";
import {
  accountNavigation,
  hubNavigation,
  isHubPath,
  isItemActive,
  mobileNavigation,
  navigationGroups,
  primaryNavigation,
  resolveHref,
  visibleItems,
} from "@/components/layout/navigation";

const read = (path: string) => readFileSync(path, "utf8");

describe("AIG platform application shell", () => {
  it("provides reading, standard, wide and full layouts", () =>
    expect(appShellWidthClasses).toEqual({
      reading: "max-w-[52rem]",
      standard: "max-w-[84rem]",
      wide: "max-w-[100rem]",
      full: "max-w-none",
    }));

  it("groups the platform, the AI Hub and the account", () => {
    expect(navigationGroups.map((group) => group.label)).toEqual(["平台", "AI Hub", "账户"]);
    expect(primaryNavigation.map((item) => item.href)).toEqual(["/workspace", "/projects", "/hub", "/developer", "/explore"]);
  });

  it("keeps every existing product destination reachable", () => {
    const hrefs: string[] = navigationGroups.flatMap((group) => group.items.map((item) => item.href));
    for (const href of ["/chat", "/personas", "/memories", "/tools", "/agents", "/tools/history", "/account", "/admin"]) expect(hrefs).toContain(href);
    expect(hrefs).not.toContain("/create");
    expect(hrefs).not.toContain("/settings");
  });

  it("marks modules that are not fully live", () => {
    const status = (key: string) => [...primaryNavigation, ...hubNavigation, ...accountNavigation].find((item) => item.key === key)?.status;
    expect(status("projects")).toBe("dev");
    expect(status("developer")).toBe("dev");
    expect(status("agents")).toBe("dev");
    expect(status("connections")).toBe("planned");
    expect(status("chat")).toBeUndefined();
  });

  it("maps the demo workspace onto public routes and never exposes admin there", () => {
    expect(resolveHref(primaryNavigation[0], "demo")).toBe("/platform");
    expect(visibleItems(accountNavigation, "demo", true).map((item) => item.key)).not.toContain("admin");
    expect(visibleItems(accountNavigation, "live", false).map((item) => item.key)).not.toContain("admin");
    expect(visibleItems(accountNavigation, "live", true).map((item) => item.key)).toContain("admin");
    expect(visibleItems(hubNavigation, "demo", false).map((item) => item.key)).not.toContain("history");
  });

  it("keeps active states precise for live and demo routes", () => {
    const home = primaryNavigation[0];
    const hub = primaryNavigation[2];
    expect(isItemActive("/platform", home, "demo")).toBe(true);
    expect(isItemActive("/platform/projects", home, "demo")).toBe(false);
    expect(isItemActive("/tools/history", hub, "live")).toBe(true);
    expect(isItemActive("/platform/memory", hub, "demo")).toBe(true);
    expect(isHubPath("/chat/abc", "live")).toBe(true);
    expect(isHubPath("/projects", "live")).toBe(false);
  });

  it("uses a real centered new-chat route in the floating mobile tabbar", () => {
    const mobile = read("components/layout/mobile-navigation.tsx");
    expect(mobileNavigation.map((item) => item.href)).toEqual(["/workspace", "/projects", "/hub"]);
    expect(mobile).toContain('aria-label="新建对话"');
    expect(mobile).toContain('"/chat"');
    expect(mobile).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.5rem_minmax(0,1fr)_minmax(0,1fr)]");
    expect(mobile).toContain("data-mobile-navigation");
  });

  it("switches to the top navigation at 1024px and the bottom bar below it", () => {
    const header = read("components/layout/shell-header.tsx");
    const mobile = read("components/layout/mobile-navigation.tsx");
    expect(header).toContain('aria-label="主导航" className="hidden min-[1024px]:block"');
    expect(mobile).toContain("min-[1024px]:hidden");
  });

  it("removes development phases and prototype-only fake features from the shell", () => {
    const ui = ["components/layout/shell-header.tsx", "components/layout/mobile-navigation.tsx", "components/layout/app-shell.tsx", "features/home/components/workspace-home.tsx"].map(read).join("\n");
    expect(ui).not.toMatch(/Phase\s*\d/i);
    expect(ui).not.toContain("ManDik-Chan/AI-Generator/blob");
    expect(ui).not.toContain("网页分析");
    expect(ui).not.toContain("自定义首页");
  });

  it("keeps role-scoped account links in the header menu", () => {
    const header = read("components/layout/shell-header.tsx");
    expect(header).toContain('href="/account"');
    expect(header).toContain("账号与设置");
    expect(header).toContain('viewer?.role === "ADMIN"');
    expect(header).toContain('href="/admin"');
    expect(header).toContain("系统管理");
  });

  it("labels the demo workspace on every page", () => {
    const shell = read("components/layout/app-shell.tsx");
    expect(shell).toContain("演示工作台");
    expect(shell).toContain("所有项目、运行与记录均为示例");
    expect(read("app/platform/layout.tsx")).toContain('mode="demo"');
  });

  it("honors reduced motion and mobile safe areas", () => {
    const css = read("app/globals.css");
    const mobile = read("components/layout/mobile-navigation.tsx");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("env(safe-area-inset-bottom, 0px)");
    expect(mobile).toContain("var(--safe-area-bottom)");
  });
});
