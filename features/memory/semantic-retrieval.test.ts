import { describe, expect, it } from "vitest";
import { shouldRequestSemanticRecall } from "@/features/memory/semantic-retrieval";
import { fuseMemoryRankings, type MemoryCandidate } from "@/features/memory/selection";

const memory = (id: string, overrides: Partial<MemoryCandidate> = {}): MemoryCandidate => ({ id, content: `memory ${id}`, category: "profile", scope: "GLOBAL", importance: 3, enabled: true, updatedAt: "2026-01-01T00:00:00Z", ...overrides });

describe("adaptive semantic recall", () => {
  it("keeps off disabled and always limited to rounds with candidates", () => {
    expect(shouldRequestSemanticRecall({ mode: "off", currentMessage: "我的电脑呢", candidateCount: 2, deterministicCount: 0, hasDirectMatch: false, hasAvailableEmbeddings: true })).toBe(false);
    expect(shouldRequestSemanticRecall({ mode: "always", currentMessage: "你好", candidateCount: 2, deterministicCount: 2, hasDirectMatch: true, hasAvailableEmbeddings: false })).toBe(true);
    expect(shouldRequestSemanticRecall({ mode: "always", currentMessage: "hello", candidateCount: 0, deterministicCount: 0, hasDirectMatch: false, hasAvailableEmbeddings: true })).toBe(false);
  });

  it("skips trivial and strong deterministic queries but runs for low match and memory intent", () => {
    expect(shouldRequestSemanticRecall({ mode: "adaptive", currentMessage: "谢谢", candidateCount: 2, deterministicCount: 0, hasDirectMatch: false, hasAvailableEmbeddings: true })).toBe(false);
    expect(shouldRequestSemanticRecall({ mode: "adaptive", currentMessage: "CPU i5-12600K", candidateCount: 2, deterministicCount: 2, hasDirectMatch: true, hasAvailableEmbeddings: true })).toBe(false);
    expect(shouldRequestSemanticRecall({ mode: "adaptive", currentMessage: "之前那台机器的芯片是什么", candidateCount: 2, deterministicCount: 0, hasDirectMatch: false, hasAvailableEmbeddings: true })).toBe(true);
    expect(shouldRequestSemanticRecall({ mode: "adaptive", currentMessage: "你还记得我的设备吗", candidateCount: 2, deterministicCount: 3, hasDirectMatch: true, hasAvailableEmbeddings: true })).toBe(true);
  });
});

describe("hybrid reciprocal rank fusion", () => {
  it("keeps direct keyword matches trusted while admitting semantic-only memories", () => {
    const direct = memory("direct", { content: "用户使用 CPU i5-12600K", topicKey: "profile.cpu" });
    const semantic = memory("semantic", { content: "用户的整套电脑硬件配置", topicKey: "profile.computer" });
    const result = fuseMemoryRankings({ deterministic: [{ memory: direct, score: 10, matched: 1, directMatch: true }], semantic: [{ ...semantic, similarity: 0.9 }, { ...direct, similarity: 0.8 }], maxItems: 8, maxChars: 2400 });
    expect(result.map((item) => item.id)).toEqual(["direct", "semantic"]);
  });

  it("deduplicates topics, filters disabled/persona mismatches and obeys item and character budgets stably", () => {
    const items = [
      memory("a", { topicKey: "profile.pc", pinned: true }),
      memory("b", { topicKey: "profile.pc" }),
      memory("c", { scope: "PERSONA", personaId: "persona-b" }),
      memory("d", { enabled: false }),
      memory("e", { content: "x".repeat(20) }),
    ];
    const input = { deterministic: [], semantic: items.map((item, index) => ({ ...item, similarity: 0.9 - index / 100 })), personaId: "persona-a", maxItems: 2, maxChars: 25 };
    expect(fuseMemoryRankings(input).map((item) => item.id)).toEqual(["a"]);
    expect(fuseMemoryRankings(input).map((item) => item.id)).toEqual(["a"]);
  });
});
