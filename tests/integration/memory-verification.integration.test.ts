import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { acceptMemoryProposal } from "@/features/memory/proposal-service";
import {
  reviewLegacyMemory,
  updateOwnedMemoryAfterManualReview,
} from "@/features/memory/review-service";
import { writeTrustedMemoryChange } from "@/features/memory/trusted-write";
import {
  createIntegrationPrisma,
  integrationDatabaseEnabled,
} from "@/tests/integration/database";

describe.skipIf(!integrationDatabaseEnabled)(
  "real PostgreSQL memory verification provenance",
  () => {
    let db: PrismaClient;
    const profileIds: string[] = [];

    beforeAll(() => {
      db = createIntegrationPrisma();
    });

    afterAll(async () => {
      if (!db) return;
      await db.profile.deleteMany({ where: { id: { in: profileIds } } });
      await db.$disconnect();
    });

    async function seedOwner(label: string) {
      const userId = randomUUID();
      profileIds.push(userId);
      await db.profile.create({
        data: { id: userId, email: `${label}-${userId}@example.test` },
      });
      const conversation = await db.conversation.create({
        data: { userId, title: `${label} verification conversation` },
      });
      const message = await db.message.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          status: "COMPLETE",
          content: `${label} durable evidence`,
        },
      });
      return { userId, conversationId: conversation.id, messageId: message.id };
    }

    it("enforces all five methods, trusted paths, review idempotency, and owner isolation", async () => {
      const owner = await seedOwner("verification-owner");
      const attacker = await seedOwner("verification-attacker");
      const baseNow = new Date("2026-07-27T02:00:00.000Z");

      const manual = await writeTrustedMemoryChange({
        userId: owner.userId,
        action: "CREATE",
        content: "verification manual entry",
        category: "preference",
        scope: "GLOBAL",
        importance: 3,
        keywords: [],
        origin: "MANUAL",
        verificationSource: "MANUAL_CREATE",
        verificationNow: baseNow,
        requireMemoryEnabled: false,
      });
      const explicitAt = new Date(baseNow.getTime() + 1_000);
      const explicit = await writeTrustedMemoryChange({
        userId: owner.userId,
        action: "CREATE",
        content: "verification explicit request",
        category: "preference",
        scope: "GLOBAL",
        importance: 4,
        keywords: [],
        sourceConversationId: owner.conversationId,
        sourceMessageId: owner.messageId,
        origin: "AUTO_EXTRACTED",
        verificationSource: "EXPLICIT_REQUEST",
        verificationNow: explicitAt,
        requireMemoryEnabled: false,
      });

      const proposalCreatedAt = new Date(Date.now() - 1_000);
      const proposal = await db.memoryProposal.create({
        data: {
          userId: owner.userId,
          action: "CREATE",
          status: "PENDING",
          content: "verification proposal acceptance",
          category: "preference",
          scope: "GLOBAL",
          importance: 4,
          confidence: 0.95,
          reasonCode: "preference",
          sourceConversationId: owner.conversationId,
          sourceMessageId: owner.messageId,
          dedupeKey: createHash("sha256")
            .update(`${owner.userId}:verification:proposal`)
            .digest("hex"),
          suppressionKey: createHash("sha256")
            .update(`${owner.userId}:verification:suppression`)
            .digest("hex"),
          createdAt: proposalCreatedAt,
          updatedAt: proposalCreatedAt,
          expiresAt: new Date(
            proposalCreatedAt.getTime() + 30 * 86_400_000,
          ),
        },
      });
      const accepted = await acceptMemoryProposal(owner.userId, proposal.id);
      expect(accepted).toMatchObject({
        success: true,
        finalStatus: "ACCEPTED",
        memoryId: expect.any(String),
      });

      const legacy = await db.memory.create({
        data: {
          userId: owner.userId,
          content: "verification legacy to review",
          category: "preference",
          scope: "GLOBAL",
          origin: "AUTO_EXTRACTED",
          verificationMethod: "LEGACY_UNREVIEWED",
          verifiedAt: null,
        },
      });
      const untouchedLegacy = await db.memory.create({
        data: {
          userId: owner.userId,
          content: "verification legacy remains visible",
          category: "preference",
          scope: "GLOBAL",
          origin: "AUTO_EXTRACTED",
          verificationMethod: "LEGACY_UNREVIEWED",
          verifiedAt: null,
        },
      });
      const manualEditSeed = await writeTrustedMemoryChange({
        userId: owner.userId,
        action: "CREATE",
        content: "verification manual edit before",
        category: "preference",
        scope: "GLOBAL",
        importance: 3,
        keywords: [],
        origin: "MANUAL",
        verificationSource: "MANUAL_CREATE",
        requireMemoryEnabled: false,
      });
      const manualReviewAt = new Date(baseNow.getTime() + 3_000);
      expect(await updateOwnedMemoryAfterManualReview(
        owner.userId,
        manualEditSeed.memoryId,
        {
          content: "verification manual edit after",
          category: "preference",
          scope: "GLOBAL",
          personaId: null,
          importance: 5,
          enabled: true,
        },
        manualReviewAt,
      )).toEqual({ count: 1 });
      expect(await db.memory.findUnique({
        where: { id: manualEditSeed.memoryId },
        select: {
          content: true,
          revision: true,
          verificationMethod: true,
          verifiedAt: true,
        },
      })).toEqual({
        content: "verification manual edit after",
        revision: 2,
        verificationMethod: "MANUAL_REVIEW",
        verifiedAt: manualReviewAt,
      });

      const enabledOnlySeed = await writeTrustedMemoryChange({
        userId: owner.userId,
        action: "CREATE",
        content: "verification enabled-only form update",
        category: "preference",
        scope: "GLOBAL",
        importance: 3,
        keywords: [],
        origin: "MANUAL",
        verificationSource: "MANUAL_CREATE",
        verificationNow: baseNow,
        requireMemoryEnabled: false,
      });
      expect(await updateOwnedMemoryAfterManualReview(
        owner.userId,
        enabledOnlySeed.memoryId,
        {
          content: "verification enabled-only form update",
          category: "preference",
          scope: "GLOBAL",
          personaId: null,
          importance: 3,
          enabled: false,
        },
        new Date(baseNow.getTime() + 3_500),
      )).toEqual({ count: 1 });
      expect(await db.memory.findUnique({
        where: { id: enabledOnlySeed.memoryId },
        select: {
          enabled: true,
          revision: true,
          verificationMethod: true,
          verifiedAt: true,
        },
      })).toEqual({
        enabled: false,
        revision: 2,
        verificationMethod: "MANUAL_ENTRY",
        verifiedAt: baseNow,
      });

      await db.$executeRaw(Prisma.sql`
        INSERT INTO public.memory_embeddings
          (memory_id, user_id, model, dimensions, content_hash, embedding,
           created_at, updated_at)
        VALUES
          (${legacy.id}::uuid, ${owner.userId}::uuid, 'verification-fixture',
           512, ${"9".repeat(64)},
           array_fill(0::real, ARRAY[512])::extensions.vector, now(), now())
      `);
      const revisionBeforeReview = legacy.revision;
      const embeddingCountBefore = await db.memoryEmbedding.count({
        where: { memoryId: legacy.id },
      });
      expect(await reviewLegacyMemory(
        attacker.userId,
        legacy.id,
        baseNow,
      )).toEqual({ success: false, code: "NOT_FOUND" });

      const legacyReviewAt = new Date(baseNow.getTime() + 4_000);
      expect(await reviewLegacyMemory(
        owner.userId,
        legacy.id,
        legacyReviewAt,
      )).toEqual({
        success: true,
        idempotent: false,
        verificationMethod: "MANUAL_REVIEW",
        verifiedAt: legacyReviewAt,
      });
      expect(await reviewLegacyMemory(
        owner.userId,
        legacy.id,
        new Date(baseNow.getTime() + 5_000),
      )).toEqual({
        success: true,
        idempotent: true,
        verificationMethod: "MANUAL_REVIEW",
        verifiedAt: legacyReviewAt,
      });
      expect(await db.memoryEmbedding.count({
        where: { memoryId: legacy.id },
      })).toBe(embeddingCountBefore);
      expect(await db.memory.findUnique({
        where: { id: legacy.id },
        select: {
          revision: true,
          content: true,
          origin: true,
          enabled: true,
          pinned: true,
          verificationMethod: true,
          verifiedAt: true,
        },
      })).toEqual({
        revision: revisionBeforeReview,
        content: "verification legacy to review",
        origin: "AUTO_EXTRACTED",
        enabled: true,
        pinned: false,
        verificationMethod: "MANUAL_REVIEW",
        verifiedAt: legacyReviewAt,
      });

      await db.memory.update({
        where: { id: manual.memoryId },
        data: {
          enabled: false,
          pinned: true,
        },
      });
      const revisionAfterEnableAndPin = await db.memory.findUniqueOrThrow({
        where: { id: manual.memoryId },
        select: { revision: true },
      });
      await db.memory.update({
        where: { id: manual.memoryId },
        data: {
          useCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });
      expect(await db.memory.findUnique({
        where: { id: manual.memoryId },
        select: {
          verificationMethod: true,
          verifiedAt: true,
          revision: true,
        },
      })).toEqual({
        verificationMethod: "MANUAL_ENTRY",
        verifiedAt: baseNow,
        revision: revisionAfterEnableAndPin.revision,
      });

      const rows = await db.memory.findMany({
        where: {
          id: {
            in: [
              manual.memoryId,
              explicit.memoryId,
              accepted.memoryId!,
              legacy.id,
              untouchedLegacy.id,
              manualEditSeed.memoryId,
              enabledOnlySeed.memoryId,
            ],
          },
        },
        select: { verificationMethod: true, verifiedAt: true },
      });
      expect(new Set(rows.map((row) => row.verificationMethod))).toEqual(
        new Set([
          "MANUAL_ENTRY",
          "EXPLICIT_REQUEST",
          "PROPOSAL_ACCEPTANCE",
          "MANUAL_REVIEW",
          "LEGACY_UNREVIEWED",
        ]),
      );
      expect(rows.every((row) =>
        row.verificationMethod === "LEGACY_UNREVIEWED"
          ? row.verifiedAt === null
          : row.verifiedAt instanceof Date)).toBe(true);

      await expect(db.$executeRawUnsafe(
        `UPDATE public.memories
         SET verified_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        untouchedLegacy.id,
      )).rejects.toBeTruthy();
      await expect(db.$executeRawUnsafe(
        `UPDATE public.memories
         SET verified_at = NULL
         WHERE id = $1::uuid`,
        manual.memoryId,
      )).rejects.toBeTruthy();
    }, 30_000);
  },
);
