import { describe, expect, it } from "vitest";
import {
  parseMemoryExtraction,
  selectExtractionCandidates,
  shouldRunMemoryExtraction,
} from "@/features/memory/extraction";

describe("automatic memory extraction protocol", () => {
  it.each(["你好", "谢谢。", "好的", "继续！", "明白了", "...", "  "])("filters low-value message %s locally", (message) => {
    expect(shouldRunMemoryExtraction(message)).toBe(false);
  });

  it.each(["以后回答先给结论，再解释。", "我正在长期准备研究生考试。"])("allows durable statement %s", (message) => {
    expect(shouldRunMemoryExtraction(message)).toBe(true);
  });

  it("does not discard a short but explicit durable statement", () => {
    expect(shouldRunMemoryExtraction("我怕狗")).toBe(true);
  });

  it("accepts at most three strict operations", () => {
    const result = parseMemoryExtraction(JSON.stringify({ operations: [{ action: "CREATE", content: "用户偏好先给结论", category: "preference", scope: "GLOBAL", importance: 4, confidence: 0.93, reasonCode: "preference" }] }));
    expect(result.operations[0]?.action).toBe("CREATE");
    expect(() => parseMemoryExtraction(JSON.stringify({ operations: Array.from({ length: 4 }, () => ({ action: "IGNORE", confidence: 1, reasonCode: "temporary" })) }))).toThrow();
    expect(() => parseMemoryExtraction('```json\n{"operations":[]}\n```')).toThrow();
  });

  it("requires a candidate UUID for UPDATE and strips model-owned fields", () => {
    expect(() => parseMemoryExtraction(JSON.stringify({ operations: [{ action: "UPDATE", content: "用户喜欢简洁回答", category: "preference", scope: "GLOBAL", importance: 4, confidence: 0.9, reasonCode: "preference" }] }))).toThrow();
    const result = parseMemoryExtraction(JSON.stringify({ operations: [{ action: "IGNORE", confidence: 0.2, reasonCode: "uncertain", userId: "forbidden" }] }));
    expect(result.operations[0]).not.toHaveProperty("userId");
  });

  it("limits and deterministically ranks existing candidates", () => {
    const candidates = Array.from({ length: 25 }, (_, index) => ({ id: String(index), content: index === 24 ? "长期项目" : `无关 ${index}`, category: "project", scope: "GLOBAL" as const, importance: 3, updatedAt: "2026-01-01T00:00:00Z" }));
    const selected = selectExtractionCandidates("长期项目", candidates);
    expect(selected).toHaveLength(20);
    expect(selected[0]?.id).toBe("24");
  });
});
