import { describe, expect, it } from "vitest";
import { navigationItemActive } from "@/components/layout/navigation";

describe("application navigation active state", () => {
  it("only marks home active at the root", () => { expect(navigationItemActive("/", "/")).toBe(true); expect(navigationItemActive("/tools", "/")).toBe(false); });
  it("marks nested tools pages active", () => { expect(navigationItemActive("/tools/history", "/tools")).toBe(true); expect(navigationItemActive("/memories", "/tools")).toBe(false); });
});
