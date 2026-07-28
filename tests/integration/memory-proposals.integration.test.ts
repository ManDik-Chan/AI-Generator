import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma, PrismaClient } from "@prisma/client";

import {
  acceptMemoryProposal,
  rejectMemoryProposal,
} from "@/features/memory/proposal-service";
import {
  TrustedMemoryWriteError,
  writeTrustedMemoryChange,
} from "@/features/memory/trusted-write";
import {
  buildMemoryProposalDedupeKey,
  buildMemoryProposalSuppressionKey,
} from "@/features/memory/proposal-utils";
import {
  createIntegrationPrisma,
  integrationDatabaseEnabled,
} from "@/tests/integration/database";

const DAY_MS = 86_400_000;

function fingerprint(label: string) {
  return createHash("sha256").update(label).digest("hex");
}

describe.skipIf(!integrationDatabaseEnabled)(
  "real PostgreSQL memory proposal security and production transactions",
  () => {
    let db: PrismaClient;
    const profileIds: string[] = [];

    beforeAll(() => {
      db = createIntegrationPrisma();
    });

    afterAll(async () => {
      if (!db) return;
      await db.memoryProposal.deleteMany({
        where: { userId: { in: profileIds } },
      });
      await db.profile.deleteMany({ where: { id: { in: profileIds } } });
      await db.$disconnect();
    });

    async function seedUser(label: string, withMemory = true) {
      const userId = randomUUID();
      profileIds.push(userId);
      await db.profile.create({
        data: { id: userId, email: `${label}-${userId}@example.test` },
      });
      const persona = await db.persona.create({
        data: {
          userId,
          name: `${label} Persona`,
          personality: "fixture",
          systemPrompt: "fixture",
        },
      });
      const conversation = await db.conversation.create({
        data: { userId, personaId: persona.id, title: `${label} Conversation` },
      });
      const message = await db.message.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          status: "COMPLETE",
          content: `${label} evidence`,
        },
      });
      const memory = withMemory
        ? await db.memory.create({
            data: {
              userId,
              content: `${label} current memory`,
              category: "other",
              scope: "GLOBAL",
              verificationMethod: "MANUAL_ENTRY",
              verifiedAt: new Date(),
              topicKey: `${label}.topic`,
            },
          })
        : undefined;
      return { userId, persona, conversation, message, memory };
    }

    function proposalData(
      owner: Awaited<ReturnType<typeof seedUser>>,
      label: string,
      overrides: Partial<Prisma.MemoryProposalUncheckedCreateInput> = {},
    ): Prisma.MemoryProposalUncheckedCreateInput {
      const createdAt = overrides.createdAt instanceof Date
        ? overrides.createdAt
        : new Date();
      return {
        userId: owner.userId,
        action: "CREATE",
        status: "PENDING",
        content: `${label} proposed fact`,
        category: "other",
        scope: "GLOBAL",
        importance: 3,
        confidence: 0.95,
        reasonCode: "stable_fact",
        sourceConversationId: owner.conversation.id,
        sourceMessageId: owner.message.id,
        dedupeKey: fingerprint(`${label}:dedupe:${randomUUID()}`),
        suppressionKey: fingerprint(`${label}:suppression`),
        createdAt,
        updatedAt: createdAt,
        expiresAt: new Date(createdAt.getTime() + 30 * DAY_MS),
        ...overrides,
      };
    }

    it("uses composite owner FKs permanently and rejects parent ownership changes", async () => {
      const a = await seedUser("owner-a");
      const b = await seedUser("owner-b");
      const proposal = await db.memoryProposal.create({
        data: proposalData(a, "owner-valid", {
          action: "UPDATE",
          targetMemoryId: a.memory!.id,
          targetMemoryUpdatedAt: a.memory!.updatedAt,
          targetMemoryRevision: a.memory!.revision,
          content: "owner-a updated memory",
          topicKey: a.memory!.topicKey,
        }),
      });
      await db.memoryProposal.create({
        data: proposalData(a, "owner-persona", {
          personaId: a.persona.id,
          scope: "PERSONA",
        }),
      });

      await expect(db.memoryProposal.create({
        data: proposalData(a, "cross-persona", {
          personaId: b.persona.id,
          scope: "PERSONA",
        }),
      })).rejects.toBeTruthy();
      await expect(db.memoryProposal.create({
        data: proposalData(a, "cross-target", {
          action: "UPDATE",
          targetMemoryId: b.memory!.id,
          targetMemoryUpdatedAt: b.memory!.updatedAt,
          targetMemoryRevision: b.memory!.revision,
        }),
      })).rejects.toBeTruthy();
      await expect(db.memoryProposal.create({
        data: proposalData(a, "cross-source", {
          sourceConversationId: b.conversation.id,
          sourceMessageId: b.message.id,
        }),
      })).rejects.toBeTruthy();
      await expect(db.memory.update({
        where: { id: a.memory!.id },
        data: { userId: b.userId },
      })).rejects.toBeTruthy();
      await expect(db.persona.update({
        where: { id: a.persona.id },
        data: { userId: b.userId },
      })).rejects.toBeTruthy();
      await expect(db.conversation.update({
        where: { id: a.conversation.id },
        data: { userId: b.userId },
      })).rejects.toBeTruthy();
      await expect(db.message.update({
        where: { id: a.message.id },
        data: { conversationId: b.conversation.id },
      })).rejects.toBeTruthy();
      await expect(db.persona.delete({
        where: { id: a.persona.id },
      })).rejects.toBeTruthy();
      const resolution = await db.memoryProposal.create({
        data: proposalData(a, "cross-resolution"),
      });
      await expect(db.memoryProposal.update({
        where: { id: resolution.id },
        data: {
          status: "ACCEPTED",
          resolvedAt: new Date(),
          resolvedMemoryId: b.memory!.id,
        },
      })).rejects.toBeTruthy();
      expect(await db.memoryProposal.findUnique({
        where: { id: proposal.id },
        select: {
          userId: true,
          targetMemoryId: true,
          sourceConversationId: true,
          sourceMessageId: true,
        },
      })).toEqual({
        userId: a.userId,
        targetMemoryId: a.memory!.id,
        sourceConversationId: a.conversation.id,
        sourceMessageId: a.message.id,
      });
    });

    it("accepts only active COMPLETE USER sources and cancels pending proposals on chat supersede", async () => {
      const owner = await seedUser("source-validation");
      const otherConversation = await db.conversation.create({
        data: { userId: owner.userId, title: "other source conversation" },
      });
      const invalid = await Promise.all([
        db.message.create({
          data: {
            conversationId: owner.conversation.id,
            role: "ASSISTANT",
            status: "COMPLETE",
            content: "assistant",
          },
        }),
        db.message.create({
          data: {
            conversationId: owner.conversation.id,
            role: "USER",
            status: "PENDING",
            content: "pending",
          },
        }),
        db.message.create({
          data: {
            conversationId: owner.conversation.id,
            role: "USER",
            status: "ERROR",
            content: "error",
          },
        }),
        db.message.create({
          data: {
            conversationId: owner.conversation.id,
            role: "USER",
            status: "COMPLETE",
            supersededAt: new Date(),
            content: "superseded",
          },
        }),
        db.message.create({
          data: {
            conversationId: otherConversation.id,
            role: "USER",
            status: "COMPLETE",
            content: "other conversation",
          },
        }),
      ]);
      for (const [index, message] of invalid.entries()) {
        await expect(db.memoryProposal.create({
          data: proposalData(owner, `invalid-source-${index}`, {
            sourceMessageId: message.id,
          }),
        })).rejects.toBeTruthy();
      }

      const proposal = await db.memoryProposal.create({
        data: proposalData(owner, "immutable-source"),
      });
      await expect(db.memoryProposal.update({
        where: { id: proposal.id },
        data: { sourceMessageId: invalid[4]!.id },
      })).rejects.toBeTruthy();
      await expect(db.message.update({
        where: { id: owner.message.id },
        data: { status: "ERROR" },
      })).rejects.toBeTruthy();

      const supersededAt = new Date();
      await db.message.update({
        where: { id: owner.message.id },
        data: { supersededAt },
      });
      expect(await db.memoryProposal.findUnique({
        where: { id: proposal.id },
        select: {
          status: true,
          resolvedAt: true,
          sourceMessageId: true,
          sourceConversationId: true,
        },
      })).toEqual({
        status: "CANCELLED",
        resolvedAt: expect.any(Date),
        sourceMessageId: owner.message.id,
        sourceConversationId: owner.conversation.id,
      });
      expect(await acceptMemoryProposal(owner.userId, proposal.id)).toMatchObject({
        success: false,
        finalStatus: "CANCELLED",
        code: "NOT_PENDING",
      });
      expect(await db.memory.count({
        where: { userId: owner.userId, content: proposal.content },
      })).toBe(0);

      const replacementMessage = await db.message.create({
        data: {
          conversationId: owner.conversation.id,
          role: "USER",
          status: "COMPLETE",
          content: "replacement source after edit",
        },
      });
      const replacement = await db.memoryProposal.create({
        data: proposalData(owner, "replacement-source", {
          sourceMessageId: replacementMessage.id,
        }),
      });
      const terminal = await db.memoryProposal.create({
        data: proposalData(owner, "terminal-source", {
          sourceMessageId: replacementMessage.id,
        }),
      });
      await db.memoryProposal.update({
        where: { id: terminal.id },
        data: { status: "REJECTED", resolvedAt: new Date() },
      });
      await db.message.update({
        where: { id: replacementMessage.id },
        data: { supersededAt: new Date() },
      });
      expect(await db.memoryProposal.findMany({
        where: { id: { in: [replacement.id, terminal.id] } },
        orderBy: { id: "asc" },
        select: { id: true, status: true, sourceMessageId: true },
      })).toEqual([
        { id: replacement.id, status: "CANCELLED", sourceMessageId: replacementMessage.id },
        { id: terminal.id, status: "REJECTED", sourceMessageId: replacementMessage.id },
      ].sort((left, right) => left.id.localeCompare(right.id)));

      await db.message.delete({ where: { id: owner.message.id } });
      expect(await db.memoryProposal.findUnique({
        where: { id: proposal.id },
        select: { sourceMessageId: true, sourceConversationId: true },
      })).toEqual({
        sourceMessageId: null,
        sourceConversationId: owner.conversation.id,
      });
      await db.conversation.delete({ where: { id: owner.conversation.id } });
      expect(await db.memoryProposal.findUnique({
        where: { id: proposal.id },
        select: { sourceMessageId: true, sourceConversationId: true },
      })).toEqual({
        sourceMessageId: null,
        sourceConversationId: null,
      });
    });

    it("rejects illegal TTL, target, resolution combinations, and terminal transitions", async () => {
      const owner = await seedUser("state-machine");
      await expect(db.memoryProposal.create({
        data: proposalData(owner, "ten-year-ttl", {
          expiresAt: new Date(Date.now() + 10 * 365 * DAY_MS),
        }),
      })).rejects.toBeTruthy();
      await expect(db.memoryProposal.create({
        data: proposalData(owner, "insert-accepted", {
          status: "ACCEPTED",
          resolvedAt: new Date(),
          resolvedMemoryId: owner.memory!.id,
        }),
      })).rejects.toBeTruthy();
      await expect(db.memoryProposal.create({
        data: proposalData(owner, "update-without-target", {
          action: "UPDATE",
          targetMemoryId: null,
          targetMemoryUpdatedAt: null,
          targetMemoryRevision: null,
        }),
      })).rejects.toBeTruthy();

      const updateProposal = await db.memoryProposal.create({
        data: proposalData(owner, "state-update", {
          action: "UPDATE",
          targetMemoryId: owner.memory!.id,
          targetMemoryUpdatedAt: owner.memory!.updatedAt,
          targetMemoryRevision: owner.memory!.revision,
        }),
      });
      await expect(db.memoryProposal.update({
        where: { id: updateProposal.id },
        data: {
          targetMemoryId: null,
          targetMemoryUpdatedAt: null,
          targetMemoryRevision: null,
        },
      })).rejects.toBeTruthy();

      const rejected = await db.memoryProposal.create({
        data: proposalData(owner, "terminal-rejected"),
      });
      await db.memoryProposal.update({
        where: { id: rejected.id },
        data: { status: "REJECTED", resolvedAt: new Date() },
      });
      for (const status of ["PENDING", "ACCEPTED", "EXPIRED", "CANCELLED"] as const) {
        await expect(db.memoryProposal.update({
          where: { id: rejected.id },
          data: {
            status,
            resolvedAt: status === "PENDING" ? null : new Date(),
            resolvedMemoryId: status === "ACCEPTED" ? owner.memory!.id : null,
          },
        })).rejects.toBeTruthy();
      }
      await expect(db.memoryProposal.update({
        where: { id: updateProposal.id },
        data: { status: "ACCEPTED", resolvedAt: new Date() },
      })).rejects.toBeTruthy();
      await expect(db.memoryProposal.update({
        where: { id: updateProposal.id },
        data: {
          status: "REJECTED",
          resolvedAt: new Date(),
          resolvedMemoryId: owner.memory!.id,
        },
      })).rejects.toBeTruthy();
      const acceptedAudit = await db.memoryProposal.create({
        data: proposalData(owner, "accepted-audit"),
      });
      await db.memoryProposal.update({
        where: { id: acceptedAudit.id },
        data: {
          status: "ACCEPTED",
          resolvedAt: new Date(),
          resolvedMemoryId: owner.memory!.id,
        },
      });
      await expect(db.memoryProposal.update({
        where: { id: acceptedAudit.id },
        data: { resolvedMemoryId: null },
      })).rejects.toBeTruthy();
      const terminalUpdate = await db.memoryProposal.create({
        data: proposalData(owner, "terminal-update-target", {
          action: "UPDATE",
          targetMemoryId: owner.memory!.id,
          targetMemoryUpdatedAt: owner.memory!.updatedAt,
          targetMemoryRevision: owner.memory!.revision,
        }),
      });
      await db.memoryProposal.update({
        where: { id: terminalUpdate.id },
        data: { status: "REJECTED", resolvedAt: new Date() },
      });
      await expect(db.memoryProposal.update({
        where: { id: terminalUpdate.id },
        data: { targetMemoryId: null },
      })).rejects.toBeTruthy();
      const earlyResolution = await db.memoryProposal.create({
        data: proposalData(owner, "early-resolution"),
      });
      await expect(db.memoryProposal.update({
        where: { id: earlyResolution.id },
        data: {
          status: "REJECTED",
          resolvedAt: new Date(earlyResolution.createdAt.getTime() - 1),
        },
      })).rejects.toBeTruthy();
    });

    it("lets users delete formal memories while preserving non-restoring Proposal audit state", async () => {
      const createOwner = await seedUser("delete-accepted-create", false);
      const createProposal = await db.memoryProposal.create({
        data: proposalData(createOwner, "delete-accepted-create", {
          content: "accepted CREATE that will be deleted",
          topicKey: "delete.accepted-create",
        }),
      });
      const createAccepted = await acceptMemoryProposal(
        createOwner.userId,
        createProposal.id,
      );
      expect(createAccepted).toMatchObject({
        success: true,
        finalStatus: "ACCEPTED",
      });
      const createdMemoryId = createAccepted.memoryId!;
      const vector = `[${Array.from(
        { length: 512 },
        (_, index) => index === 0 ? 1 : 0,
      ).join(",")}]`;
      await db.$executeRawUnsafe(
        `INSERT INTO public.memory_embeddings
           (memory_id, user_id, model, dimensions, content_hash, embedding)
         VALUES ($1::uuid, $2::uuid, 'integration-delete', 512, 'fixture-hash', $3::extensions.vector)`,
        createdMemoryId,
        createOwner.userId,
        vector,
      );
      await db.memory.delete({ where: { id: createdMemoryId } });
      expect(await db.memoryEmbedding.count({
        where: { memoryId: createdMemoryId },
      })).toBe(0);
      expect(await db.memoryProposal.findUnique({
        where: { id: createProposal.id },
        select: {
          status: true,
          targetMemoryId: true,
          resolvedMemoryId: true,
          resolvedAt: true,
        },
      })).toEqual({
        status: "ACCEPTED",
        targetMemoryId: null,
        resolvedMemoryId: null,
        resolvedAt: expect.any(Date),
      });
      expect(await acceptMemoryProposal(
        createOwner.userId,
        createProposal.id,
      )).toMatchObject({
        success: true,
        stateChanged: false,
        finalStatus: "ACCEPTED",
        idempotent: true,
      });
      expect(await db.memory.count({
        where: {
          userId: createOwner.userId,
          content: createProposal.content,
        },
      })).toBe(0);

      const updateOwner = await seedUser("delete-accepted-update");
      const updateProposal = await db.memoryProposal.create({
        data: proposalData(updateOwner, "delete-accepted-update", {
          action: "UPDATE",
          targetMemoryId: updateOwner.memory!.id,
          targetMemoryUpdatedAt: updateOwner.memory!.updatedAt,
          targetMemoryRevision: updateOwner.memory!.revision,
          content: "accepted UPDATE that will be deleted",
          topicKey: updateOwner.memory!.topicKey,
        }),
      });
      expect(await acceptMemoryProposal(
        updateOwner.userId,
        updateProposal.id,
      )).toMatchObject({
        success: true,
        finalStatus: "ACCEPTED",
        memoryId: updateOwner.memory!.id,
      });
      await db.memory.delete({ where: { id: updateOwner.memory!.id } });
      expect(await db.memoryProposal.findUnique({
        where: { id: updateProposal.id },
        select: {
          status: true,
          targetMemoryId: true,
          targetMemoryUpdatedAt: true,
          targetMemoryRevision: true,
          resolvedMemoryId: true,
        },
      })).toEqual({
        status: "ACCEPTED",
        targetMemoryId: null,
        targetMemoryUpdatedAt: updateOwner.memory!.updatedAt,
        targetMemoryRevision: updateOwner.memory!.revision,
        resolvedMemoryId: null,
      });
      expect(await acceptMemoryProposal(
        updateOwner.userId,
        updateProposal.id,
      )).toMatchObject({
        success: true,
        stateChanged: false,
        finalStatus: "ACCEPTED",
      });
      expect(await db.memory.count({
        where: { userId: updateOwner.userId },
      })).toBe(0);

      const terminalOwner = await seedUser("delete-terminal-updates");
      const terminalStatuses = ["REJECTED", "EXPIRED", "CANCELLED"] as const;
      const terminalProposals = await Promise.all(
        terminalStatuses.map(async (status) => {
          const proposal = await db.memoryProposal.create({
            data: proposalData(terminalOwner, `delete-${status.toLowerCase()}`, {
              action: "UPDATE",
              targetMemoryId: terminalOwner.memory!.id,
              targetMemoryUpdatedAt: terminalOwner.memory!.updatedAt,
              targetMemoryRevision: terminalOwner.memory!.revision,
              topicKey: terminalOwner.memory!.topicKey,
            }),
          });
          return db.memoryProposal.update({
            where: { id: proposal.id },
            data: { status, resolvedAt: new Date() },
          });
        }),
      );
      const pendingTarget = await db.memoryProposal.create({
        data: proposalData(terminalOwner, "delete-pending-update", {
          action: "UPDATE",
          targetMemoryId: terminalOwner.memory!.id,
          targetMemoryUpdatedAt: terminalOwner.memory!.updatedAt,
          targetMemoryRevision: terminalOwner.memory!.revision,
          topicKey: terminalOwner.memory!.topicKey,
        }),
      });
      await db.memory.delete({ where: { id: terminalOwner.memory!.id } });
      const terminalRows = await db.memoryProposal.findMany({
        where: {
          id: {
            in: [
              ...terminalProposals.map((proposal) => proposal.id),
              pendingTarget.id,
            ],
          },
        },
        select: {
          id: true,
          status: true,
          targetMemoryId: true,
          resolvedAt: true,
        },
      });
      expect(terminalRows).toHaveLength(4);
      expect(terminalRows.every(
        (proposal) => proposal.targetMemoryId === null && proposal.resolvedAt != null,
      )).toBe(true);
      expect(
        new Map(terminalRows.map((proposal) => [proposal.id, proposal.status])),
      ).toEqual(new Map([
        ...terminalProposals.map(
          (proposal) => [proposal.id, proposal.status] as const,
        ),
        [pendingTarget.id, "CANCELLED" as const],
      ]));
      for (const proposal of terminalRows) {
        expect(await acceptMemoryProposal(
          terminalOwner.userId,
          proposal.id,
        )).toMatchObject({
          success: false,
          stateChanged: false,
          finalStatus: proposal.status,
        });
      }
      expect(await db.memory.count({
        where: { userId: terminalOwner.userId },
      })).toBe(0);
    });

    it("calls the production service for CREATE, UPDATE, edited accept, reject, expiry, and conflicts", async () => {
      const owner = await seedUser("production-service");
      const create = await db.memoryProposal.create({
        data: proposalData(owner, "service-create", {
          content: "production CREATE accepted",
          topicKey: "service.create",
        }),
      });
      expect(await acceptMemoryProposal(owner.userId, create.id)).toMatchObject({
        success: true,
        stateChanged: true,
        finalStatus: "ACCEPTED",
      });
      expect(await db.memory.count({
        where: { userId: owner.userId, content: "production CREATE accepted" },
      })).toBe(1);
      expect(await db.memory.findFirst({
        where: { userId: owner.userId, content: "production CREATE accepted" },
        select: { verificationMethod: true, verifiedAt: true },
      })).toEqual({
        verificationMethod: "PROPOSAL_ACCEPTANCE",
        verifiedAt: expect.any(Date),
      });

      const target = await db.memory.create({
        data: {
          userId: owner.userId,
          content: "production UPDATE before",
          category: "other",
          scope: "GLOBAL",
          verificationMethod: "MANUAL_ENTRY",
          verifiedAt: new Date(),
          topicKey: "service.update",
        },
      });
      const update = await db.memoryProposal.create({
        data: proposalData(owner, "service-update", {
          action: "UPDATE",
          targetMemoryId: target.id,
          targetMemoryUpdatedAt: target.updatedAt,
          targetMemoryRevision: target.revision,
          content: "production UPDATE after",
          topicKey: target.topicKey,
        }),
      });
      expect(await acceptMemoryProposal(owner.userId, update.id)).toMatchObject({
        success: true,
        finalStatus: "ACCEPTED",
      });
      expect(await db.memory.findUnique({
        where: { id: target.id },
        select: { content: true, revision: true, verificationMethod: true, verifiedAt: true },
      })).toEqual({
        content: "production UPDATE after",
        revision: 2,
        verificationMethod: "PROPOSAL_ACCEPTANCE",
        verifiedAt: expect.any(Date),
      });

      const edited = await db.memoryProposal.create({
        data: proposalData(owner, "service-edited", {
          content: "unedited content",
          topicKey: "service.edited",
        }),
      });
      expect(await acceptMemoryProposal(owner.userId, edited.id, {
        content: "edited content accepted",
        category: "preference",
        scope: "GLOBAL",
        importance: 5,
        topicKey: "service.edited",
        keywords: ["Edited", "edited", "关键词"],
      })).toMatchObject({ success: true, finalStatus: "ACCEPTED" });
      expect(await db.memory.findFirst({
        where: { userId: owner.userId, content: "edited content accepted" },
        select: { category: true, importance: true, keywords: true, verificationMethod: true, verifiedAt: true },
      })).toEqual({
        category: "preference",
        importance: 5,
        keywords: ["Edited", "关键词"],
        verificationMethod: "PROPOSAL_ACCEPTANCE",
        verifiedAt: expect.any(Date),
      });

      const rejected = await db.memoryProposal.create({
        data: proposalData(owner, "service-reject"),
      });
      expect(await rejectMemoryProposal(owner.userId, rejected.id)).toMatchObject({
        success: true,
        stateChanged: true,
        finalStatus: "REJECTED",
      });
      expect(await db.memoryProposal.findUnique({
        where: { id: rejected.id },
        select: { status: true, resolvedMemoryId: true },
      })).toEqual({ status: "REJECTED", resolvedMemoryId: null });

      const createdAt = new Date(Date.now() - 31 * DAY_MS);
      const expired = await db.memoryProposal.create({
        data: proposalData(owner, "service-expired", { createdAt }),
      });
      expect(await acceptMemoryProposal(owner.userId, expired.id)).toMatchObject({
        success: false,
        stateChanged: true,
        finalStatus: "EXPIRED",
        code: "EXPIRED",
      });
      expect(await db.memoryProposal.findUnique({
        where: { id: expired.id },
        select: { status: true },
      })).toEqual({ status: "EXPIRED" });

      const conflictTarget = await db.memory.create({
        data: {
          userId: owner.userId,
          content: "conflict before",
          category: "other",
          scope: "GLOBAL",
          verificationMethod: "MANUAL_ENTRY",
          verifiedAt: new Date(),
          topicKey: "service.conflict",
        },
      });
      const conflict = await db.memoryProposal.create({
        data: proposalData(owner, "service-conflict", {
          action: "UPDATE",
          targetMemoryId: conflictTarget.id,
          targetMemoryUpdatedAt: conflictTarget.updatedAt,
          targetMemoryRevision: conflictTarget.revision,
          content: "conflict proposal",
          topicKey: conflictTarget.topicKey,
        }),
      });
      await db.memory.update({
        where: { id: conflictTarget.id },
        data: { content: "conflict manually edited" },
      });
      expect(await db.memory.findUnique({
        where: { id: conflictTarget.id },
        select: { revision: true },
      })).toEqual({ revision: 2 });
      await expect(db.memory.update({
        where: { id: conflictTarget.id },
        data: { revision: { increment: 1 } },
      })).rejects.toBeTruthy();
      expect(await acceptMemoryProposal(owner.userId, conflict.id)).toMatchObject({
        success: false,
        finalStatus: "PENDING",
        code: "CONFLICT",
      });
      expect(await db.memoryProposal.findUnique({
        where: { id: conflict.id },
        select: { status: true },
      })).toEqual({ status: "PENDING" });

      const editTarget = await db.memory.create({
        data: {
          userId: owner.userId,
          content: "edited update target",
          category: "other",
          scope: "GLOBAL",
          verificationMethod: "MANUAL_ENTRY",
          verifiedAt: new Date(),
          topicKey: "service.edit-target",
        },
      });
      await db.memory.create({
        data: {
          userId: owner.userId,
          content: "other topic owner",
          category: "other",
          scope: "GLOBAL",
          verificationMethod: "MANUAL_ENTRY",
          verifiedAt: new Date(),
          topicKey: "service.occupied-topic",
        },
      });
      const editedUpdate = await db.memoryProposal.create({
        data: proposalData(owner, "edited-update-conflict", {
          action: "UPDATE",
          targetMemoryId: editTarget.id,
          targetMemoryUpdatedAt: editTarget.updatedAt,
          targetMemoryRevision: editTarget.revision,
          topicKey: editTarget.topicKey,
        }),
      });
      expect(await acceptMemoryProposal(owner.userId, editedUpdate.id, {
        content: "edited update would collide",
        category: "other",
        scope: "GLOBAL",
        importance: 3,
        topicKey: "service.occupied-topic",
        keywords: [],
      })).toMatchObject({
        success: false,
        finalStatus: "PENDING",
        code: "CONFLICT",
      });
      expect(await db.memory.findUnique({
        where: { id: editTarget.id },
        select: { content: true, topicKey: true },
      })).toEqual({
        content: "edited update target",
        topicKey: "service.edit-target",
      });
    });

    it("never turns a CREATE proposal into an UPDATE after later manual changes", async () => {
      const owner = await seedUser("strict-create", false);
      const sameTopicProposal = await db.memoryProposal.create({
        data: proposalData(owner, "strict-topic", {
          content: "proposal must remain create",
          topicKey: "strict.topic",
        }),
      });
      const manual = await db.memory.create({
        data: {
          userId: owner.userId,
          content: "later manual same topic",
          category: "other",
          scope: "GLOBAL",
          verificationMethod: "MANUAL_ENTRY",
          verifiedAt: new Date(),
          topicKey: "strict.topic",
        },
      });
      await db.memory.update({
        where: { id: manual.id },
        data: { content: "later manual same topic, subsequently edited" },
      });
      expect(await acceptMemoryProposal(owner.userId, sameTopicProposal.id)).toMatchObject({
        success: false,
        finalStatus: "PENDING",
        code: "CONFLICT",
      });
      expect(await db.memory.findUnique({
        where: { id: manual.id },
        select: { content: true },
      })).toEqual({ content: "later manual same topic, subsequently edited" });

      const stoppedTopicProposal = await db.memoryProposal.create({
        data: proposalData(owner, "strict-stopped-topic", {
          content: "proposal must not revive a stopped topic",
          topicKey: "strict.stopped-topic",
        }),
      });
      const stoppedTopic = await db.memory.create({
        data: {
          userId: owner.userId,
          content: "later stopped same topic",
          category: "other",
          scope: "GLOBAL",
          verificationMethod: "MANUAL_ENTRY",
          verifiedAt: new Date(),
          topicKey: "strict.stopped-topic",
        },
      });
      await db.memory.update({
        where: { id: stoppedTopic.id },
        data: { enabled: false },
      });
      expect(await acceptMemoryProposal(owner.userId, stoppedTopicProposal.id)).toMatchObject({
        success: false,
        finalStatus: "PENDING",
        code: "CONFLICT",
      });
      expect(await db.memory.findUnique({
        where: { id: stoppedTopic.id },
        select: { enabled: true, content: true },
      })).toEqual({ enabled: false, content: "later stopped same topic" });

      const duplicateProposal = await db.memoryProposal.create({
        data: proposalData(owner, "strict-duplicate", {
          content: "existing exact enabled",
          topicKey: "strict.duplicate",
        }),
      });
      const exact = await db.memory.create({
        data: {
          userId: owner.userId,
          content: "EXISTING exact，enabled!!!",
          category: "other",
          scope: "GLOBAL",
          verificationMethod: "MANUAL_ENTRY",
          verifiedAt: new Date(),
          topicKey: "strict.exact-other-topic",
        },
      });
      await db.memoryProposal.update({
        where: { id: duplicateProposal.id },
        data: { content: "existing exact enabled" },
      });
      const idempotent = await acceptMemoryProposal(owner.userId, duplicateProposal.id);
      expect(idempotent).toMatchObject({
        success: true,
        finalStatus: "ACCEPTED",
        memoryId: exact.id,
        idempotent: true,
      });

      const disabledProposal = await db.memoryProposal.create({
        data: proposalData(owner, "strict-disabled", {
          content: "disabled exact content",
          topicKey: "strict.disabled",
        }),
      });
      await db.memory.create({
        data: {
          userId: owner.userId,
          content: "disabled exact content",
          category: "other",
          scope: "GLOBAL",
          verificationMethod: "MANUAL_ENTRY",
          verifiedAt: new Date(),
          enabled: false,
        },
      });
      expect(await acceptMemoryProposal(owner.userId, disabledProposal.id)).toMatchObject({
        success: false,
        finalStatus: "PENDING",
        code: "CONFLICT",
      });
    });

    it("keeps a stale UPDATE conflicted while accepting a new target revision", async () => {
      const owner = await seedUser("versioned-update");
      const target = owner.memory!;
      const fingerprintInput = {
        sourceMessageId: owner.message.id,
        action: "UPDATE" as const,
        scope: "GLOBAL" as const,
        targetMemoryId: target.id,
        topicKey: target.topicKey,
        content: "versioned proposal content",
        keywords: ["versioned", "proposal"],
      };
      const suppressionKey = buildMemoryProposalSuppressionKey(fingerprintInput);
      const stale = await db.memoryProposal.create({
        data: proposalData(owner, "versioned-stale", {
          action: "UPDATE",
          targetMemoryId: target.id,
          targetMemoryUpdatedAt: target.updatedAt,
          targetMemoryRevision: target.revision,
          topicKey: target.topicKey,
          content: fingerprintInput.content,
          keywords: fingerprintInput.keywords,
          dedupeKey: buildMemoryProposalDedupeKey({
            ...fingerprintInput,
            targetMemoryRevision: target.revision,
          }),
          suppressionKey,
        }),
      });
      await db.memory.update({
        where: { id: target.id },
        data: { content: "target changed after stale proposal" },
      });
      const latestTarget = await db.memory.findUniqueOrThrow({
        where: { id: target.id },
        select: { updatedAt: true, revision: true },
      });
      const freshDedupeKey = buildMemoryProposalDedupeKey({
        ...fingerprintInput,
        targetMemoryRevision: latestTarget.revision,
      });
      expect(freshDedupeKey).not.toBe(stale.dedupeKey);
      const fresh = await db.memoryProposal.create({
        data: proposalData(owner, "versioned-fresh", {
          action: "UPDATE",
          targetMemoryId: target.id,
          targetMemoryUpdatedAt: latestTarget.updatedAt,
          targetMemoryRevision: latestTarget.revision,
          topicKey: target.topicKey,
          content: fingerprintInput.content,
          keywords: fingerprintInput.keywords,
          dedupeKey: freshDedupeKey,
          suppressionKey,
        }),
      });

      expect(await acceptMemoryProposal(owner.userId, stale.id)).toMatchObject({
        success: false,
        finalStatus: "PENDING",
        code: "CONFLICT",
      });
      expect(await acceptMemoryProposal(owner.userId, fresh.id)).toMatchObject({
        success: true,
        finalStatus: "ACCEPTED",
        memoryId: target.id,
      });
      expect(await db.memory.findUnique({
        where: { id: target.id },
        select: { content: true, revision: true },
      })).toEqual({
        content: fingerprintInput.content,
        revision: latestTarget.revision + 1,
      });
      expect(await db.memoryProposal.findUnique({
        where: { id: stale.id },
        select: { status: true },
      })).toEqual({ status: "PENDING" });
    });

    it("is idempotent under duplicate clicks and rolls back Memory if proposal resolution fails", async () => {
      const owner = await seedUser("race-rollback", false);
      const concurrent = await db.memoryProposal.create({
        data: proposalData(owner, "duplicate-click", {
          content: "duplicate click creates once",
          topicKey: "race.duplicate",
        }),
      });
      const results = await Promise.all([
        acceptMemoryProposal(owner.userId, concurrent.id),
        acceptMemoryProposal(owner.userId, concurrent.id),
      ]);
      expect(results.every((result) => result.success)).toBe(true);
      expect(results.filter((result) => result.stateChanged)).toHaveLength(1);
      expect(await db.memory.count({
        where: { userId: owner.userId, content: "duplicate click creates once" },
      })).toBe(1);

      const rollback = await db.memoryProposal.create({
        data: proposalData(owner, "rollback-injected", {
          content: "must roll back through production service",
          topicKey: "rollback.injected",
        }),
      });
      await db.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION public.fail_test_memory_proposal_accept()
        RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
        BEGIN
          IF NEW.status = 'ACCEPTED' THEN
            RAISE EXCEPTION 'injected proposal acceptance failure';
          END IF;
          RETURN NEW;
        END;
        $$
      `);
      await db.$executeRawUnsafe(`
        CREATE TRIGGER memory_proposals_test_fail_accept
        BEFORE UPDATE ON public.memory_proposals
        FOR EACH ROW EXECUTE FUNCTION public.fail_test_memory_proposal_accept()
      `);
      try {
        expect(await acceptMemoryProposal(owner.userId, rollback.id)).toMatchObject({
          success: false,
          finalStatus: "PENDING",
          code: "FAILED",
        });
      } finally {
        await db.$executeRawUnsafe(`
          DROP TRIGGER IF EXISTS memory_proposals_test_fail_accept
          ON public.memory_proposals
        `);
        await db.$executeRawUnsafe(`
          DROP FUNCTION IF EXISTS public.fail_test_memory_proposal_accept()
        `);
      }
      expect(await db.memory.count({
        where: {
          userId: owner.userId,
          content: "must roll back through production service",
        },
      })).toBe(0);
      expect(await db.memoryProposal.findUnique({
        where: { id: rollback.id },
        select: { status: true, resolvedMemoryId: true, resolvedAt: true },
      })).toEqual({
        status: "PENDING",
        resolvedMemoryId: null,
        resolvedAt: null,
      });
    }, 30_000);

    it("serializes manual CREATE against Proposal CREATE at 299/300 capacity", async () => {
      const owner = await seedUser("capacity-race", false);
      await db.memory.createMany({
        data: Array.from({ length: 299 }, (_, index) => ({
          userId: owner.userId,
          content: `capacity fixture ${index}`,
          category: "other",
          scope: "GLOBAL" as const,
          verificationMethod: "MANUAL_ENTRY" as const,
          verifiedAt: new Date(),
        })),
      });
      const proposal = await db.memoryProposal.create({
        data: proposalData(owner, "capacity-proposal", {
          content: "capacity proposal winner candidate",
          topicKey: "capacity.proposal",
        }),
      });
      const [manual, accepted] = await Promise.allSettled([
        writeTrustedMemoryChange({
          userId: owner.userId,
          action: "CREATE",
          content: "capacity manual winner candidate",
          category: "other",
          scope: "GLOBAL",
          importance: 3,
          keywords: [],
          origin: "MANUAL",
          verificationSource: "MANUAL_CREATE",
          requireMemoryEnabled: false,
        }),
        acceptMemoryProposal(owner.userId, proposal.id),
      ]);

      const manualSucceeded = manual.status === "fulfilled";
      const proposalSucceeded = accepted.status === "fulfilled" && accepted.value.success;
      expect(Number(manualSucceeded) + Number(proposalSucceeded)).toBe(1);
      if (manual.status === "rejected") {
        expect(manual.reason).toBeInstanceOf(TrustedMemoryWriteError);
        expect((manual.reason as TrustedMemoryWriteError).code).toBe("CAPACITY");
      }
      if (accepted.status === "fulfilled" && !accepted.value.success) {
        expect(accepted.value.code).toBe("CAPACITY");
      }
      expect(await db.memory.count({ where: { userId: owner.userId } })).toBe(300);
      expect(await db.memory.count({
        where: {
          userId: owner.userId,
          content: {
            in: [
              "capacity manual winner candidate",
              "capacity proposal winner candidate",
            ],
          },
        },
      })).toBe(1);
    }, 30_000);
  },
);
