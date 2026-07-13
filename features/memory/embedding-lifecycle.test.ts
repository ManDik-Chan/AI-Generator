import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  status: vi.fn(),
  provider: { embed: vi.fn() },
  metadata: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/database/prisma", () => ({ prisma: { memory: { findFirst: mocks.findFirst, findMany: mocks.findMany } } }));
vi.mock("@/lib/ai/embeddings/config", () => ({ getEmbeddingConfigurationStatus: mocks.status }));
vi.mock("@/lib/ai/embeddings/provider", () => ({ getEmbeddingProvider: () => ({ config: { model: "embedding-3", dimensions: 512 }, provider: mocks.provider }) }));
vi.mock("@/features/memory/embedding-repository", () => ({ getMemoryEmbeddingMetadata: mocks.metadata, upsertMemoryEmbedding: mocks.upsert }));

import { syncMemoryEmbedding, syncMemoryEmbeddingSafely, syncMemoryEmbeddingsForSourceMessage } from "@/features/memory/embedding-lifecycle";
import { computeMemoryEmbeddingHash, buildMemoryEmbeddingText } from "@/features/memory/embedding-text";
import { EmbeddingProviderError } from "@/lib/ai/embeddings/errors";

const memory = { id: "11111111-1111-4111-8111-111111111111", content: "用户使用 RTX 5080", category: "profile", topicKey: "profile.computer", keywords: ["显卡", "RTX 5080"] };
const embedding = Array.from({ length: 512 }, () => 0.01);

describe("memory embedding lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status.mockReturnValue({ configured: true });
    mocks.findFirst.mockResolvedValue(memory);
    mocks.findMany.mockResolvedValue([{ id: memory.id }]);
    mocks.metadata.mockResolvedValue(undefined);
    mocks.provider.embed.mockResolvedValue([embedding]);
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("generates and upserts after a new or changed memory without modifying the Memory row", async () => {
    await expect(syncMemoryEmbedding(memory.id, "user-a")).resolves.toEqual({ status: "generated" });
    expect(mocks.provider.embed).toHaveBeenCalledOnce();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ memoryId: memory.id, userId: "user-a", model: "embedding-3", dimensions: 512, embedding }));
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: memory.id, userId: "user-a", enabled: true }, select: { id: true, content: true, category: true, topicKey: true, keywords: true } }));
  });

  it("skips provider calls when content hash, model and dimensions are current", async () => {
    const contentHash = computeMemoryEmbeddingHash(buildMemoryEmbeddingText(memory));
    mocks.metadata.mockResolvedValue({ contentHash, model: "embedding-3", dimensions: 512 });
    await expect(syncMemoryEmbedding(memory.id, "user-a")).resolves.toEqual({ status: "current" });
    expect(mocks.provider.embed).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does not depend on pinned, useCount or lastUsedAt changes", async () => {
    const selectedFields = mocks.findFirst.mockResolvedValue(memory);
    await syncMemoryEmbedding(memory.id, "user-a");
    expect(selectedFields).toBeDefined();
    const select = mocks.findFirst.mock.calls[0]?.[0]?.select;
    expect(select).not.toHaveProperty("pinned");
    expect(select).not.toHaveProperty("useCount");
    expect(select).not.toHaveProperty("lastUsedAt");
  });

  it("keeps embedding failures isolated and safe", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.provider.embed.mockRejectedValue(new EmbeddingProviderError("AUTHENTICATION", "secret provider response", 401));
    await expect(syncMemoryEmbeddingSafely(memory.id, "user-a")).resolves.toEqual({ status: "failed" });
    const logged = JSON.stringify(warning.mock.calls);
    expect(logged).toContain("AUTHENTICATION");
    expect(logged).not.toContain("secret provider response");
    expect(logged).not.toContain(memory.content);
    expect(mocks.upsert).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  it("indexes every memory changed by one automatic extraction source message", async () => {
    mocks.findMany.mockResolvedValue([{ id: memory.id }, { id: "22222222-2222-4222-8222-222222222222" }]);
    await syncMemoryEmbeddingsForSourceMessage("user-a", "source-a");
    expect(mocks.findMany).toHaveBeenCalledWith({ where: { userId: "user-a", sourceMessageId: "source-a", enabled: true }, select: { id: true } });
    expect(mocks.provider.embed).toHaveBeenCalledTimes(2);
  });
});
