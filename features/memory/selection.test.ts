import { describe, expect, it } from "vitest";
import { memoryTerms, selectRelevantMemories } from "@/features/memory/selection";
const memory = (id: string, content: string, extra: Partial<Parameters<typeof selectRelevantMemories>[0]["candidates"][number]> = {}) => ({ id, content, category: "other", scope: "GLOBAL" as const, importance: 3, enabled: true, updatedAt: "2026-07-13T00:00:00Z", ...extra });
describe("deterministic memory selection", () => { it("tokenizes Chinese bigrams and English deterministically", () => expect([...memoryTerms("网络 Exam 2026")]).toEqual(expect.arrayContaining(["网络", "exam", "2026"]))); it("keeps global and matching persona memories isolated", () => { const result = selectRelevantMemories({ currentMessage: "网络考试", recentUserMessages: [], personaId: "a", candidates: [memory("g", "网络偏好"), memory("a", "网络考试", { scope: "PERSONA", personaId: "a" }), memory("b", "网络考试", { scope: "PERSONA", personaId: "b" })], maxItems: 8, maxChars: 2400 }); expect(result.map((item) => item.id)).toEqual(expect.arrayContaining(["g", "a"])); expect(result.map((item) => item.id)).not.toContain("b"); }); it("excludes disabled and respects whole-item budgets", () => { const result = selectRelevantMemories({ currentMessage: "项目", recentUserMessages: [], candidates: [memory("off", "项目", { enabled: false }), memory("long", "项目".repeat(20)), memory("fit", "项目计划")], maxItems: 8, maxChars: 10 }); expect(result.map((item) => item.id)).toEqual(["fit"]); }); it("allows at most two unrelated high-importance fallbacks", () => { const result = selectRelevantMemories({ currentMessage: "天气", recentUserMessages: [], candidates: [memory("1", "偏好一", { importance: 5 }), memory("2", "偏好二", { importance: 5 }), memory("3", "偏好三", { importance: 5 })], maxItems: 8, maxChars: 2400 }); expect(result).toHaveLength(2); }); });

describe("memory selection limits", () => {
  it("never exceeds the item limit", () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      memory(String(index), `网络计划 ${index}`),
    );
    const result = selectRelevantMemories({ currentMessage: "网络计划", recentUserMessages: [], candidates, maxItems: 8, maxChars: 2400 });
    expect(result).toHaveLength(8);
  });

  it("produces the same order for the same input", () => {
    const options = { currentMessage: "网络计划", recentUserMessages: ["准备考试"], candidates: [memory("b", "网络计划"), memory("a", "网络计划")], maxItems: 8, maxChars: 2400 };
    expect(selectRelevantMemories(options).map((item) => item.id)).toEqual(["a", "b"]);
    expect(selectRelevantMemories(options).map((item) => item.id)).toEqual(["a", "b"]);
  });
});
