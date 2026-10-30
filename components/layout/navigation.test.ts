import { describe, expect, it } from "vitest";
import { navigationGroups, mobileNavigation, navigationItemActive } from "@/components/layout/navigation";

describe("application navigation active state", () => {
  it("only marks home active at the root", () => { expect(navigationItemActive("/", "/")).toBe(true); expect(navigationItemActive("/tools", "/")).toBe(false); });
  it("supports explicit route groups without overlapping sibling tools", () => {
    expect(navigationItemActive("/tools/rewrite", "/tools", ["/tools", "/tools/rewrite"])).toBe(true);
    expect(navigationItemActive("/tools/history", "/tools", ["/tools", "/tools/rewrite"])).toBe(false);
    expect(navigationItemActive("/memories", "/tools")).toBe(false);
  });
  it("all dashboard navigation points to the workspace, independently of public home", () => {
    expect(navigationGroups[0].items[0].href).toBe("/workspace");
    expect(navigationGroups[0].items[0].demoHref).toBe("/platform");
    expect(mobileNavigation[0].href).toBe("/workspace");
    expect(navigationItemActive("/", "/workspace")).toBe(false);
    expect(navigationItemActive("/workspace", "/workspace")).toBe(true);
  });
});
