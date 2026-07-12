import { describe, expect, it } from "vitest";

import { buildCompleteTurnContext, createConversationTitle, hasReachedDailyMessageLimit, startOfUtcDay, type ContextMessage } from "@/features/chat/utils";

const at = (second: number) => new Date(`2026-07-12T00:00:${String(second).padStart(2, "0")}.000Z`);
const message = (id: string, role: "USER" | "ASSISTANT", status: "PENDING" | "COMPLETE" | "ERROR", content: string, second: number, supersededAt: Date | null = null): ContextMessage => ({ id, role, status, content, createdAt: at(second), supersededAt });

describe("chat utilities", () => {
  it("creates a normalized title without another model request", () => {
    expect(createConversationTitle("  第一行\n\n第二行   内容 ")).toBe("第一行 第二行 内容");
    expect(createConversationTitle("   ")).toBe("新对话");
    expect(createConversationTitle("a".repeat(80))).toHaveLength(48);
  });

  it("keeps complete turns and appends the current user exactly once", () => {
    const rows = [message("u2", "USER", "COMPLETE", "current", 3), message("a1", "ASSISTANT", "COMPLETE", "answer", 2), message("u1", "USER", "COMPLETE", "old", 1)];
    expect(buildCompleteTurnContext(rows, "u2")).toEqual([
      { role: "user", content: "old" }, { role: "assistant", content: "answer" }, { role: "user", content: "current" },
    ]);
  });

  it.each(["PENDING", "ERROR"] as const)("excludes a user turn followed by %s assistant", (status) => {
    const rows = [message("u2", "USER", "COMPLETE", "current", 3), message("a1", "ASSISTANT", status, "partial", 2), message("u1", "USER", "COMPLETE", "old", 1)];
    expect(buildCompleteTurnContext(rows, "u2")).toEqual([{ role: "user", content: "current" }]);
  });

  it("excludes empty, orphaned and superseded messages", () => {
    const rows = [
      message("u3", "USER", "COMPLETE", "current", 6),
      message("a2", "ASSISTANT", "COMPLETE", "", 5), message("u2", "USER", "COMPLETE", "orphan", 4),
      message("a1", "ASSISTANT", "COMPLETE", "old answer", 2, at(9)), message("u1", "USER", "COMPLETE", "old", 1, at(9)),
    ];
    expect(buildCompleteTurnContext(rows, "u3")).toEqual([{ role: "user", content: "current" }]);
  });

  it("applies character and message budgets by whole turns", () => {
    const rows = [message("u3", "USER", "COMPLETE", "now", 5), message("a2", "ASSISTANT", "COMPLETE", "222", 4), message("u2", "USER", "COMPLETE", "22", 3), message("a1", "ASSISTANT", "COMPLETE", "111", 2), message("u1", "USER", "COMPLETE", "11", 1)];
    expect(buildCompleteTurnContext(rows, "u3", 8, 3)).toEqual([{ role: "user", content: "22" }, { role: "assistant", content: "222" }, { role: "user", content: "now" }]);
  });

  it("counts edited user messages toward the daily limit", () => {
    expect(hasReachedDailyMessageLimit("USER", 50, 50)).toBe(true);
    expect(hasReachedDailyMessageLimit("ADMIN", 500, 50)).toBe(false);
  });

  it("uses UTC midnight as the daily boundary", () => {
    expect(startOfUtcDay(new Date("2026-07-12T23:30:00+08:00")).toISOString()).toBe("2026-07-12T00:00:00.000Z");
  });
});
