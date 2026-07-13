import { EmbeddingProviderError } from "@/lib/ai/embeddings/errors";
import { getEmbeddingConfigurationStatus } from "@/lib/ai/embeddings/config";
import { getEmbeddingProvider } from "@/lib/ai/embeddings/provider";
import { prisma } from "@/lib/database/prisma";
import { buildMemoryEmbeddingText, computeMemoryEmbeddingHash } from "@/features/memory/embedding-text";
import { getMemoryEmbeddingMetadata, upsertMemoryEmbedding } from "@/features/memory/embedding-repository";

export type MemoryEmbeddingStage = "load" | "provider" | "persist";

export class MemoryEmbeddingFailure extends Error {
  constructor(public readonly stage: MemoryEmbeddingStage, public readonly originalError: unknown) {
    super("Memory embedding generation failed.");
    this.name = "MemoryEmbeddingFailure";
  }
}

export async function syncMemoryEmbedding(memoryId: string, userId: string) {
  let stage: MemoryEmbeddingStage = "load";
  try {
    const status = getEmbeddingConfigurationStatus();
    if (!status.configured) return { status: "unconfigured" as const };
    const memory = await prisma.memory.findFirst({
      where: { id: memoryId, userId, enabled: true },
      select: { id: true, content: true, category: true, topicKey: true, keywords: true },
    });
    if (!memory) return { status: "skipped" as const };
    const text = buildMemoryEmbeddingText(memory);
    const contentHash = computeMemoryEmbeddingHash(text);
    const { config, provider } = getEmbeddingProvider();
    const existing = await getMemoryEmbeddingMetadata(memory.id, userId);
    if (existing?.contentHash === contentHash && existing.model === config.model && existing.dimensions === config.dimensions) return { status: "current" as const };
    stage = "provider";
    const [embedding] = await provider.embed({ input: text, model: config.model, dimensions: config.dimensions });
    stage = "persist";
    await upsertMemoryEmbedding({ memoryId: memory.id, userId, model: config.model, dimensions: config.dimensions, contentHash, embedding });
    return { status: "generated" as const };
  } catch (error) {
    throw new MemoryEmbeddingFailure(stage, error);
  }
}

export function safeMemoryEmbeddingError(error: unknown) {
  const failure = error instanceof MemoryEmbeddingFailure ? error : undefined;
  const original = failure?.originalError ?? error;
  return {
    stage: failure?.stage ?? "persist",
    errorCode: original instanceof EmbeddingProviderError ? original.code : original instanceof Error ? original.name : "UNKNOWN",
    ...(original instanceof EmbeddingProviderError && original.status ? { providerStatus: original.status } : {}),
  };
}

export async function syncMemoryEmbeddingSafely(memoryId: string, userId: string) {
  try { return await syncMemoryEmbedding(memoryId, userId); }
  catch (error) {
    console.warn("memory_embedding_failed", { memoryId, userId, ...safeMemoryEmbeddingError(error) });
    return { status: "failed" as const };
  }
}

export async function syncMemoryEmbeddingsForSourceMessage(userId: string, sourceMessageId: string) {
  const memories = await prisma.memory.findMany({ where: { userId, sourceMessageId, enabled: true }, select: { id: true } });
  for (const memory of memories) await syncMemoryEmbeddingSafely(memory.id, userId);
}
