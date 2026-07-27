import { prisma } from "@/lib/database/prisma";
import type { MemoryProposalView, MemoryView } from "@/features/memory/types";
import { getMemoryMaxTotal } from "@/features/memory/constants";
import { getEmbeddingConfigurationStatus, MEMORY_EMBEDDING_DIMENSIONS } from "@/lib/ai/embeddings/config";
import { buildMemoryEmbeddingText, computeMemoryEmbeddingHash } from "@/features/memory/embedding-text";
import { getMemoryEmbeddingMetadataForUser } from "@/features/memory/embedding-repository";
import { normalizeMemoryContent } from "@/features/memory/security";

export async function getMemories(userId: string): Promise<MemoryView[]> { const rows = await prisma.memory.findMany({ where: { userId }, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], include: { persona: { select: { name: true } }, sourceConversation: { select: { title: true } } } }); return rows.map((row) => ({ id: row.id, content: row.content, category: row.category, scope: row.scope, origin: row.origin, verificationMethod: row.verificationMethod, verifiedAt: row.verifiedAt?.toISOString(), importance: row.importance, enabled: row.enabled, pinned: row.pinned, useCount: row.useCount, topicKey: row.topicKey ?? undefined, keywords: row.keywords, personaId: row.personaId ?? undefined, personaName: row.persona?.name, sourceConversationId: row.sourceConversationId ?? undefined, sourceConversationTitle: row.sourceConversation?.title, lastUsedAt: row.lastUsedAt?.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })); }

export async function getPendingMemoryProposals(userId: string): Promise<MemoryProposalView[]> {
  const now = new Date();
  const rows = await prisma.memoryProposal.findMany({
    where: { userId, status: "PENDING", expiresAt: { gt: now } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      action: true,
      content: true,
      category: true,
      scope: true,
      importance: true,
      topicKey: true,
      keywords: true,
      confidence: true,
      personaId: true,
      sourceConversationId: true,
      targetMemoryId: true,
      targetMemoryRevision: true,
      createdAt: true,
      expiresAt: true,
    },
  });
  const [personas, conversations, memories] = await Promise.all([
    prisma.persona.findMany({
      where: {
        userId,
        id: { in: rows.flatMap((row) => row.personaId ? [row.personaId] : []) },
      },
      select: { id: true, name: true },
    }),
    prisma.conversation.findMany({
      where: {
        userId,
        id: {
          in: rows.flatMap(
            (row) => row.sourceConversationId ? [row.sourceConversationId] : [],
          ),
        },
      },
      select: { id: true, title: true },
    }),
    prisma.memory.findMany({
      where: { userId },
      select: {
        id: true,
        content: true,
        scope: true,
        personaId: true,
        topicKey: true,
        enabled: true,
        revision: true,
      },
    }),
  ]);
  const personaNames = new Map(personas.map((persona) => [persona.id, persona.name]));
  const conversationTitles = new Map(
    conversations.map((conversation) => [conversation.id, conversation.title]),
  );
  const memoriesById = new Map(memories.map((memory) => [memory.id, memory]));

  return rows.map((row) => ({
    ...(() => {
      const target = row.targetMemoryId
        ? memoriesById.get(row.targetMemoryId)
        : undefined;
      let conflictState: MemoryProposalView["conflictState"] = "NONE";
      if (row.action === "UPDATE") {
        if (!target) {
          conflictState = "TARGET_MISSING";
        } else if (
          !target.enabled
          || target.revision !== row.targetMemoryRevision
          || target.scope !== row.scope
          || target.personaId !== row.personaId
        ) {
          conflictState = "TARGET_CHANGED";
        }
      } else {
        const scoped = memories.filter(
          (memory) =>
            memory.scope === row.scope
            && memory.personaId === row.personaId,
        );
        const duplicate = scoped.find(
          (memory) =>
            normalizeMemoryContent(memory.content)
            === normalizeMemoryContent(row.content),
        );
        if (duplicate && !duplicate.enabled) {
          conflictState = "DISABLED_DUPLICATE";
        } else if (
          !duplicate
          && row.topicKey
          && scoped.some((memory) => memory.topicKey === row.topicKey)
        ) {
          conflictState = "TOPIC_CONFLICT";
        }
      }
      return {
        id: row.id,
        actionLabel: row.action === "CREATE" ? "建议新增" as const : "建议更新" as const,
        content: row.content,
        category: row.category,
        scope: row.scope,
        importance: row.importance,
        topicKey: row.topicKey ?? undefined,
        keywords: row.keywords,
        confidenceLabel: row.confidence >= 0.95
          ? "高置信建议"
          : row.confidence >= 0.9
            ? "较高置信建议"
            : "已通过严格阈值",
        personaId: row.personaId ?? undefined,
        personaName: row.personaId
          ? personaNames.get(row.personaId)
          : undefined,
        sourceConversationId: row.sourceConversationId ?? undefined,
        sourceConversationTitle: row.sourceConversationId
          ? conversationTitles.get(row.sourceConversationId)
          : undefined,
        currentTargetContent: target?.content,
        canAccept: conflictState === "NONE",
        conflictState,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      };
    })(),
  }));
}

export async function getMemoryPageData(userId: string) {
  const [profile, memories, proposals, personas] = await Promise.all([prisma.profile.findUnique({ where: { id: userId }, select: { memoryEnabled: true } }), getMemories(userId), getPendingMemoryProposals(userId), prisma.persona.findMany({ where: { userId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  const embedding = getEmbeddingConfigurationStatus();
  let indexed = 0;
  let indexedIds: string[] = [];
  if (embedding.configured) {
    try {
      const records = new Map((await getMemoryEmbeddingMetadataForUser(userId)).map((record) => [record.memoryId, record]));
      indexedIds = memories.filter((memory) => {
        if (!memory.enabled) return false;
        const record = records.get(memory.id);
        const hash = computeMemoryEmbeddingHash(buildMemoryEmbeddingText(memory));
        return record?.model === embedding.model && record.dimensions === MEMORY_EMBEDDING_DIMENSIONS && record.contentHash === hash;
      }).map((memory) => memory.id);
      indexed = indexedIds.length;
    } catch (error) {
      console.warn("memory_embedding_status_failed", { userId, errorCode: error instanceof Error ? error.name : "UNKNOWN" });
    }
  }
  const enabledCount = memories.filter((memory) => memory.enabled).length;
  return {
    memoryEnabled: profile?.memoryEnabled ?? true,
    memories,
    proposals,
    personas,
    maxTotal: getMemoryMaxTotal(),
    referenceNow: new Date().toISOString(),
    semanticIndex: { configured: embedding.configured, indexed, pending: Math.max(0, enabledCount - indexed), indexedIds, model: embedding.model, dimensions: MEMORY_EMBEDDING_DIMENSIONS },
  };
}
