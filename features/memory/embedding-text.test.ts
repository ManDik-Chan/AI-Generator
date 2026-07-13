import { describe, expect, it } from "vitest";
import { buildMemoryEmbeddingText, computeMemoryEmbeddingHash, readableMemoryTopic } from "@/features/memory/embedding-text";

describe("memory embedding input", () => {
  it("uses stable business text and excludes ownership and usage metadata", () => {
    const input = { id: "memory-id", userId: "user-id", content: "用户的电脑配置为 RTX 5080。", category: "profile", topicKey: "profile.computer_configuration-v2", keywords: ["CPU", "CPU", "电脑配置"], pinned: true, useCount: 8 };
    const text = buildMemoryEmbeddingText(input);
    expect(text).toBe("类别：profile\n主题：profile computer configuration v2\n内容：用户的电脑配置为 RTX 5080。\n关键词：CPU，电脑配置");
    expect(text).not.toContain("memory-id");
    expect(text).not.toContain("user-id");
    expect(text).not.toContain("pinned");
    expect(readableMemoryTopic("a.b_c-d")).toBe("a b c d");
  });

  it("produces deterministic SHA-256 hashes", () => {
    const first = computeMemoryEmbeddingHash("same text");
    expect(first).toBe(computeMemoryEmbeddingHash("same text"));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(computeMemoryEmbeddingHash("changed text"));
  });
});
