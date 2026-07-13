import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { validateEmbeddingVector } from "@/lib/ai/embeddings/openai-compatible";
import { MEMORY_EMBEDDING_DIMENSIONS } from "@/lib/ai/embeddings/config";
import type { MemoryCandidate } from "@/features/memory/selection";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MemoryEmbeddingMetadata {
  memoryId: string;
  userId: string;
  model: string;
  dimensions: number;
  contentHash: string;
  updatedAt: Date;
}

export interface SemanticMemoryCandidate extends MemoryCandidate {
  similarity: number;
}

function vectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}

export async function getMemoryEmbeddingMetadata(memoryId: string, userId: string) {
  const rows = await prisma.$queryRaw<MemoryEmbeddingMetadata[]>(Prisma.sql`
    SELECT memory_id AS "memoryId", user_id AS "userId", model, dimensions,
      content_hash AS "contentHash", updated_at AS "updatedAt"
    FROM public.memory_embeddings
    WHERE memory_id = ${memoryId}::uuid AND user_id = ${userId}::uuid
    LIMIT 1
  `);
  return rows[0];
}

export async function getMemoryEmbeddingMetadataForUser(userId: string) {
  return prisma.$queryRaw<MemoryEmbeddingMetadata[]>(Prisma.sql`
    SELECT memory_id AS "memoryId", user_id AS "userId", model, dimensions,
      content_hash AS "contentHash", updated_at AS "updatedAt"
    FROM public.memory_embeddings
    WHERE user_id = ${userId}::uuid
  `);
}

export async function upsertMemoryEmbedding(input: {
  memoryId: string;
  userId: string;
  model: string;
  dimensions: 512;
  contentHash: string;
  embedding: number[];
}) {
  const embedding = validateEmbeddingVector(input.embedding, MEMORY_EMBEDDING_DIMENSIONS);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO public.memory_embeddings
      (memory_id, user_id, model, dimensions, content_hash, embedding, created_at, updated_at)
    SELECT ${input.memoryId}::uuid, ${input.userId}::uuid, ${input.model}, ${input.dimensions},
      ${input.contentHash}, ${vectorLiteral(embedding)}::extensions.vector, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    WHERE EXISTS (
      SELECT 1 FROM public.memories m WHERE m.id = ${input.memoryId}::uuid AND m.user_id = ${input.userId}::uuid
    )
    ON CONFLICT (memory_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      model = EXCLUDED.model,
      dimensions = EXCLUDED.dimensions,
      content_hash = EXCLUDED.content_hash,
      embedding = EXCLUDED.embedding,
      updated_at = CURRENT_TIMESTAMP
    WHERE public.memory_embeddings.user_id = ${input.userId}::uuid
  `);
}

export async function hasAvailableMemoryEmbedding(input: { userId: string; personaId?: string; model: string; dimensions: number }) {
  const rows = await prisma.$queryRaw<Array<{ available: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM public.memory_embeddings me
      JOIN public.memories m ON m.id = me.memory_id AND m.user_id = me.user_id
      WHERE me.user_id = ${input.userId}::uuid
        AND me.model = ${input.model}
        AND me.dimensions = ${input.dimensions}
        AND m.enabled = true
        AND (m.scope = 'GLOBAL' OR (m.scope = 'PERSONA' AND m.persona_id = ${input.personaId ?? null}::uuid))
    ) AS available
  `);
  return rows[0]?.available ?? false;
}

export async function searchSemanticMemories(input: {
  userId: string;
  personaId?: string;
  queryEmbedding: number[];
  model: string;
  dimensions: 512;
  threshold: number;
  limit: number;
}) {
  if (!UUID_PATTERN.test(input.userId) || (input.personaId && !UUID_PATTERN.test(input.personaId))) throw new Error("Invalid semantic memory owner identifier.");
  const queryEmbedding = validateEmbeddingVector(input.queryEmbedding, input.dimensions);
  const threshold = Math.min(1, Math.max(0, input.threshold));
  const limit = Math.min(50, Math.max(1, Math.floor(input.limit)));
  const rows = await prisma.$queryRaw<SemanticMemoryCandidate[]>(Prisma.sql`
    SELECT m.id, m.content, m.category, m.scope, m.persona_id AS "personaId",
      m.importance, m.enabled, m.updated_at AS "updatedAt", m.topic_key AS "topicKey",
      m.keywords, m.pinned, m.use_count AS "useCount", m.last_used_at AS "lastUsedAt",
      1 - (me.embedding <=> ${vectorLiteral(queryEmbedding)}::extensions.vector) AS similarity
    FROM public.memories m
    JOIN public.memory_embeddings me ON me.memory_id = m.id AND me.user_id = m.user_id
    WHERE m.user_id = ${input.userId}::uuid
      AND m.enabled = true
      AND (m.scope = 'GLOBAL' OR (m.scope = 'PERSONA' AND m.persona_id = ${input.personaId ?? null}::uuid))
      AND me.model = ${input.model}
      AND me.dimensions = ${input.dimensions}
      AND 1 - (me.embedding <=> ${vectorLiteral(queryEmbedding)}::extensions.vector) >= ${threshold}
    ORDER BY similarity DESC, m.pinned DESC, m.importance DESC, m.updated_at DESC, m.id ASC
    LIMIT ${limit}
  `);
  return rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
}
