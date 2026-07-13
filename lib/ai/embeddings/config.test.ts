import { describe, expect, it } from "vitest";
import { getEmbeddingConfigurationStatus, getMemorySemanticConfig, requireEmbeddingProviderConfig } from "@/lib/ai/embeddings/config";

describe("embedding configuration", () => {
  it("falls back to shared base URL and API key without requiring build-time configuration", () => {
    expect(getEmbeddingConfigurationStatus({}).configured).toBe(false);
    expect(requireEmbeddingProviderConfig({ AI_BASE_URL: "https://api.example.com/v1", AI_API_KEY: "key" })).toMatchObject({ baseUrl: "https://api.example.com/v1", apiKey: "key", model: "embedding-3", dimensions: 512, timeoutMs: 15000 });
  });

  it("rejects dimensions other than the fixed 512", () => {
    expect(getEmbeddingConfigurationStatus({ AI_BASE_URL: "https://api.example.com", AI_API_KEY: "key", AI_EMBEDDING_DIMENSIONS: "768" }).configured).toBe(false);
  });

  it("normalizes semantic mode, threshold and candidate limits", () => {
    expect(getMemorySemanticConfig({})).toEqual({ mode: "adaptive", threshold: 0.55, maxCandidates: 20 });
    expect(getMemorySemanticConfig({ MEMORY_SEMANTIC_MODE: "off", MEMORY_SEMANTIC_THRESHOLD: "0.7", MEMORY_SEMANTIC_MAX_CANDIDATES: "50" })).toEqual({ mode: "off", threshold: 0.7, maxCandidates: 50 });
  });
});
