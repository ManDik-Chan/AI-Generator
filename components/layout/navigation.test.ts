import { describe, expect, it } from "vitest";
import { navigationItemActive } from "@/components/layout/navigation";

describe("application navigation active state", () => {
  it("only marks home active at the root", () => { expect(navigationItemActive("/", "/")).toBe(true); expect(navigationItemActive("/tools", "/")).toBe(false); });
  it("supports explicit route groups without overlapping sibling tools", () => {
    expect(navigationItemActive("/tools/rewrite", "/tools", ["/tools", "/tools/rewrite"])).toBe(true);
    expect(navigationItemActive("/tools/history", "/tools", ["/tools", "/tools/rewrite"])).toBe(false);
    expect(navigationItemActive("/memories", "/tools")).toBe(false);
  });
});
