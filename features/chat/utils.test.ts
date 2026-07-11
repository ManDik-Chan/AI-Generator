import { describe, expect, it } from "vitest";

import { createConversationTitle, hasReachedDailyMessageLimit, selectContextMessages, startOfUtcDay } from "@/features/chat/utils";

describe("chat utilities", () => {
  it("creates a normalized title without another model request", () => {
    expect(createConversationTitle("  第一行\n\n第二行   内容 ")).toBe("第一行 第二行 内容");
    expect(createConversationTitle("   ")).toBe("新对话");
    expect(createConversationTitle("a".repeat(80))).toHaveLength(48);
  });

  it("keeps the newest context within the character budget", () => {
    const newestFirst = [
      { role: "user" as const, content: "new" },
      { role: "assistant" as const, content: "middle" },
      { role: "user" as const, content: "old-content" },
    ];
    expect(selectContextMessages(newestFirst, 9, 20)).toEqual([
      { role: "assistant", content: "middle" },
      { role: "user", content: "new" },
    ]);
  });

  it("applies daily limits only to normal users", () => {
    expect(hasReachedDailyMessageLimit("USER", 50, 50)).toBe(true);
    expect(hasReachedDailyMessageLimit("USER", 49, 50)).toBe(false);
    expect(hasReachedDailyMessageLimit("ADMIN", 500, 50)).toBe(false);
  });

  it("uses UTC midnight as the daily boundary", () => {
    expect(startOfUtcDay(new Date("2026-07-12T23:30:00+08:00")).toISOString()).toBe("2026-07-12T00:00:00.000Z");
  });
});
