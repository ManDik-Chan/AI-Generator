import { describe, expect, it } from "vitest";

import { formatBrainstormUsage } from "@/features/tools/brainstorm/usage-display";

describe("brainstorm usage display", () => {
  it("shows remaining quota for users", () => expect(formatBrainstormUsage({ limit: 3, used: 1, remaining: 2, unlimited: false })).toBe("今日剩余 2 / 3"));
  it("shows real use without a fake remaining quota for admins", () => expect(formatBrainstormUsage({ limit: 3, used: 9, remaining: 3, unlimited: true })).toBe("管理员不限次数 · 今日已使用 9 次"));
});
