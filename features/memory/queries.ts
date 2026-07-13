import { prisma } from "@/lib/database/prisma";
import type { MemoryView } from "@/features/memory/types";
import { getMemoryMaxTotal } from "@/features/memory/constants";
import { getEmbeddingConfigurationStatus, MEMORY_EMBEDDING_DIMENSIONS } from "@/lib/ai/embeddings/config";
import { buildMemoryEmbeddingText, computeMemoryEmbeddingHash } from "@/features/memory/embedding-text";
import { getMemoryEmbeddingMetadataForUser } from "@/features/memory/embedding-repository";

export async function getMemories(userId: string): Promise<MemoryView[]> { const rows = await prisma.memory.findMany({ where: { userId }, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], include: { persona: { select: { name: true } }, sourceConversation: { select: { title: true } } } }); return rows.map((row) => ({ id: row.id, content: row.content, category: row.category, scope: row.scope, origin: row.origin, importance: row.importance, enabled: row.enabled, pinned: row.pinned, useCount: row.useCount, topicKey: row.topicKey ?? undefined, keywords: row.keywords, personaId: row.personaId ?? undefined, personaName: row.persona?.name, sourceConversationId: row.sourceConversationId ?? undefined, sourceConversationTitle: row.sourceConversation?.title, lastUsedAt: row.lastUsedAt?.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })); }
export async function getMemoryPageData(userId: string) {
  const [profile, memories, personas] = await Promise.all([prisma.profile.findUnique({ where: { id: userId }, select: { memoryEnabled: true } }), getMemories(userId), prisma.persona.findMany({ where: { userId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  const embedding = getEmbeddingConfigurationStatus();
  let indexed = 0;
  if (embedding.configured) {
    try {
      const records = new Map((await getMemoryEmbeddingMetadataForUser(userId)).map((record) => [record.memoryId, record]));
      indexed = memories.filter((memory) => {
        if (!memory.enabled) return false;
        const record = records.get(memory.id);
        const hash = computeMemoryEmbeddingHash(buildMemoryEmbeddingText(memory));
        return record?.model === embedding.model && record.dimensions === MEMORY_EMBEDDING_DIMENSIONS && record.contentHash === hash;
      }).length;
    } catch (error) {
      console.warn("memory_embedding_status_failed", { userId, errorCode: error instanceof Error ? error.name : "UNKNOWN" });
    }
  }
  const enabledCount = memories.filter((memory) => memory.enabled).length;
  return {
    memoryEnabled: profile?.memoryEnabled ?? true,
    memories,
    personas,
    maxTotal: getMemoryMaxTotal(),
    referenceNow: new Date().toISOString(),
    semanticIndex: { configured: embedding.configured, indexed, pending: Math.max(0, enabledCount - indexed), model: embedding.model, dimensions: MEMORY_EMBEDDING_DIMENSIONS },
  };
}
