import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  semanticConfig: vi.fn(),
  embeddingStatus: vi.fn(),
  providerConfig: vi.fn(),
  embed: vi.fn(),
  available: vi.fn(),
  search: vi.fn(),
}));

vi.mock("@/lib/ai/embeddings/config", () => ({
  getMemorySemanticConfig: mocks.semanticConfig,
  getEmbeddingConfigurationStatus: mocks.embeddingStatus,
  requireEmbeddingProviderConfig: mocks.providerConfig,
}));
vi.mock("@/lib/ai/embeddings/openai-compatible", () => ({ createOpenAiCompatibleEmbeddingProvider: () => ({ embed: mocks.embed }) }));
vi.mock("@/features/memory/embedding-repository", () => ({ hasAvailableMemoryEmbedding: mocks.available, searchSemanticMemories: mocks.search }));

import { retrieveRelevantMemories } from "@/features/memory/semantic-retrieval";
import { EmbeddingProviderError } from "@/lib/ai/embeddings/errors";

const vector = Array.from({ length: 512 }, () => 0.01);
const base = {
  userId: "11111111-1111-4111-8111-111111111111",
  conversationId: "22222222-2222-4222-8222-222222222222",
  requestId: "request-a",
  currentMessage: "之前那台机器的芯片是什么",
  recentUserMessages: [],
  candidates: [{ id: "memory-a", content: "用户的电脑配置", category: "profile", scope: "GLOBAL" as const, importance: 3, enabled: true, updatedAt: "2026-01-01" }],
  maxItems: 8,
  maxChars: 2400,
};

describe("semantic retrieval flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.semanticConfig.mockReturnValue({ mode: "adaptive", threshold: 0.55, maxCandidates: 20 });
    mocks.embeddingStatus.mockReturnValue({ configured: true });
    mocks.providerConfig.mockReturnValue({ baseUrl: "https://example.com", apiKey: "secret", model: "embedding-3", dimensions: 512, timeoutMs: 15000 });
    mocks.available.mockResolvedValue(true);
    mocks.embed.mockResolvedValue([vector]);
    mocks.search.mockResolvedValue([{ ...base.candidates[0], id: "semantic-memory", content: "用户使用 Intel Core i5-12600K", similarity: 0.9 }]);
  });

  it("off mode never calls the embedding provider", async () => {
    mocks.semanticConfig.mockReturnValue({ mode: "off", threshold: 0.55, maxCandidates: 20 });
    await retrieveRelevantMemories(base);
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("adaptive low-match mode embeds the query once and admits semantic candidates", async () => {
    const result = await retrieveRelevantMemories(base);
    expect(mocks.embed).toHaveBeenCalledOnce();
    expect(mocks.embed).toHaveBeenCalledWith({ input: base.currentMessage, model: "embedding-3", dimensions: 512 });
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ userId: base.userId, threshold: 0.55, limit: 20, queryEmbedding: vector }));
    expect(result.map((memory) => memory.id)).toContain("semantic-memory");
  });

  it("missing configuration and unavailable vectors fall back without a provider call", async () => {
    mocks.embeddingStatus.mockReturnValue({ configured: false });
    await retrieveRelevantMemories(base);
    expect(mocks.embed).not.toHaveBeenCalled();
    mocks.embeddingStatus.mockReturnValue({ configured: true });
    mocks.available.mockResolvedValue(false);
    await retrieveRelevantMemories(base);
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it("provider and pgvector failures return deterministic results with safe diagnostics", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.embed.mockRejectedValueOnce(new EmbeddingProviderError("AUTHENTICATION", "private current question secret", 401));
    await expect(retrieveRelevantMemories(base)).resolves.toEqual(expect.any(Array));
    mocks.embed.mockResolvedValueOnce([vector]);
    mocks.search.mockRejectedValueOnce(new Error("vector extension missing with private data"));
    await expect(retrieveRelevantMemories(base)).resolves.toEqual(expect.any(Array));
    expect(mocks.embed).toHaveBeenCalledTimes(2);
    const logs = JSON.stringify(warning.mock.calls);
    expect(logs).toContain("memory_semantic_fallback");
    expect(logs).toContain("AUTHENTICATION");
    expect(logs).not.toContain("private current question secret");
    expect(logs).not.toContain("vector extension missing with private data");
    warning.mockRestore();
  });
});
