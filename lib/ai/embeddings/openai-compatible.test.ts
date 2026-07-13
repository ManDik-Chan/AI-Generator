import { describe, expect, it, vi } from "vitest";
import { EmbeddingProviderError } from "@/lib/ai/embeddings/errors";
import { buildEmbeddingsUrl, createOpenAiCompatibleEmbeddingProvider, parseEmbeddingResponse, validateEmbeddingVector } from "@/lib/ai/embeddings/openai-compatible";
import type { EmbeddingProviderConfig } from "@/lib/ai/embeddings/types";

const vector = (seed = 0) => Array.from({ length: 512 }, (_, index) => (index + seed) / 1000);
const config: EmbeddingProviderConfig = { baseUrl: "https://api.example.com/v1", apiKey: "test-secret-key", model: "embedding-3", dimensions: 512, timeoutMs: 5000 };

describe("OpenAI-compatible embedding provider", () => {
  it("normalizes origin, v1 and vendor roots", () => {
    expect(buildEmbeddingsUrl("https://api.example.com")).toBe("https://api.example.com/v1/embeddings");
    expect(buildEmbeddingsUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1/embeddings");
    expect(buildEmbeddingsUrl("https://api.example.com/api/paas/v4")).toBe("https://api.example.com/api/paas/v4/embeddings");
  });

  it("sends model, string input and fixed dimensions", async () => {
    let body: Record<string, unknown> = {};
    const provider = createOpenAiCompatibleEmbeddingProvider(config, { fetchImplementation: async (_url, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ data: [{ index: 0, embedding: vector() }] });
    } });
    await expect(provider.embed({ input: "query", model: config.model, dimensions: 512 })).resolves.toEqual([vector()]);
    expect(body).toEqual({ model: "embedding-3", input: "query", dimensions: 512 });
    expect(JSON.stringify(body)).not.toContain(config.apiKey);
  });

  it("restores batch response order by index", () => {
    expect(parseEmbeddingResponse({ data: [{ index: 1, embedding: vector(2) }, { index: 0, embedding: vector(1) }] }, 2, 512)).toEqual([vector(1), vector(2)]);
  });

  it("rejects wrong dimensions, non-finite values, empty data and duplicate indexes", () => {
    expect(() => validateEmbeddingVector([1], 512)).toThrowError(EmbeddingProviderError);
    expect(() => validateEmbeddingVector([...vector().slice(0, -1), Number.NaN], 512)).toThrowError(EmbeddingProviderError);
    expect(() => validateEmbeddingVector([...vector().slice(0, -1), Number.POSITIVE_INFINITY], 512)).toThrowError(EmbeddingProviderError);
    expect(() => parseEmbeddingResponse({ data: [] }, 1, 512)).toThrowError(EmbeddingProviderError);
    expect(() => parseEmbeddingResponse({ data: [{ index: 0, embedding: vector() }, { index: 0, embedding: vector() }] }, 2, 512)).toThrowError(EmbeddingProviderError);
  });

  it.each([[401, "AUTHENTICATION"], [404, "NOT_FOUND"], [429, "RATE_LIMITED"]] as const)("normalizes HTTP %s", async (status, code) => {
    const provider = createOpenAiCompatibleEmbeddingProvider(config, { fetchImplementation: async () => new Response("provider secret body", { status }) });
    await expect(provider.embed({ input: "query", model: config.model, dimensions: 512 })).rejects.toMatchObject({ code, status });
  });

  it("normalizes timeout without logging key, input or vector", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const provider = createOpenAiCompatibleEmbeddingProvider({ ...config, timeoutMs: 1 }, { fetchImplementation: async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })) });
    await expect(provider.embed({ input: "private current question", model: config.model, dimensions: 512 })).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(JSON.stringify(warning.mock.calls)).not.toContain(config.apiKey);
    expect(JSON.stringify(warning.mock.calls)).not.toContain("private current question");
    warning.mockRestore();
  });
});
