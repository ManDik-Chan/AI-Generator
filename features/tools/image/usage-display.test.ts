import { describe, expect, it } from "vitest";

import { formatVisionUsage } from "@/features/tools/image/usage-display";

describe("vision usage display", () => {
  it("shows remaining quota for regular users", () => expect(formatVisionUsage({ limit: 10, used: 1, remaining: 9, unlimited: false })).toBe("今日剩余 9 / 10"));
  it("shows actual usage instead of a misleading remainder for admins", () => expect(formatVisionUsage({ limit: 10, used: 12, remaining: 10, unlimited: true })).toBe("管理员不限次数 · 今日已使用 12 次"));
});
