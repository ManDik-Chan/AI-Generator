import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function seedProposalCrudFixtures(
  db: PrismaClient,
  userId: string,
  namespace: string,
) {
  const fixture = `Playwright memory ${namespace}`;
  const now = new Date();
  await db.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({
      data: {
        userId,
        title: `${namespace} proposal source`,
        messages: {
          create: {
            role: "USER",
            content: `${namespace} proposal source`,
            status: "COMPLETE",
          },
        },
      },
      include: { messages: { select: { id: true } } },
    });
    const sourceMessageId = conversation.messages[0]!.id;
    const common = {
      userId,
      status: "PENDING" as const,
      category: "preference",
      scope: "GLOBAL" as const,
      importance: 4,
      confidence: 0.96,
      reasonCode: "preference",
      sourceConversationId: conversation.id,
      sourceMessageId,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    };
    await tx.memoryProposal.createMany({
      data: ["accept", "edit", "reject"].map((caseName) => ({
        ...common,
        action: "CREATE" as const,
        content: `${fixture} ${caseName} CREATE`,
        topicKey: `e2e.${namespace}.${caseName}`,
        keywords: ["E2E", caseName],
        dedupeKey: digest(`${namespace}:${caseName}`),
        suppressionKey: digest(`${namespace}:${caseName}:suppression`),
      })),
    });

    const updateTarget = await tx.memory.create({
      data: {
        userId,
        content: `${fixture} current UPDATE`,
        category: "preference",
        scope: "GLOBAL",
        verificationMethod: "MANUAL_ENTRY",
        verifiedAt: now,
        importance: 3,
        topicKey: `e2e.${namespace}.update`,
      },
      select: { id: true, updatedAt: true, revision: true },
    });
    await tx.memoryProposal.create({
      data: {
        ...common,
        action: "UPDATE",
        targetMemoryId: updateTarget.id,
        targetMemoryUpdatedAt: updateTarget.updatedAt,
        targetMemoryRevision: updateTarget.revision,
        content: `${fixture} accepted UPDATE`,
        topicKey: `e2e.${namespace}.update`,
        keywords: ["E2E", "update"],
        dedupeKey: digest(`${namespace}:update`),
        suppressionKey: digest(`${namespace}:update:suppression`),
      },
    });

    const conflictTarget = await tx.memory.create({
      data: {
        userId,
        content: `${fixture} current CONFLICT`,
        category: "preference",
        scope: "GLOBAL",
        verificationMethod: "MANUAL_ENTRY",
        verifiedAt: now,
        importance: 3,
        topicKey: `e2e.${namespace}.conflict`,
      },
      select: { id: true, updatedAt: true, revision: true },
    });
    await tx.memoryProposal.create({
      data: {
        ...common,
        action: "UPDATE",
        targetMemoryId: conflictTarget.id,
        targetMemoryUpdatedAt: conflictTarget.updatedAt,
        targetMemoryRevision: conflictTarget.revision,
        content: `${fixture} proposed CONFLICT`,
        topicKey: `e2e.${namespace}.conflict`,
        keywords: ["E2E", "conflict"],
        dedupeKey: digest(`${namespace}:conflict`),
        suppressionKey: digest(`${namespace}:conflict:suppression`),
      },
    });
    await tx.memory.update({
      where: { id: conflictTarget.id },
      data: { content: `${fixture} current CONFLICT changed after proposal` },
    });
  });
  return { fixture };
}

export async function seedProposalExtractionTargets(
  db: PrismaClient,
  userId: string,
  token: string,
) {
  const now = new Date();
  await db.memory.createMany({
    data: [
      {
        userId,
        content: `E2E update target ${token}`,
        category: "preference",
        scope: "GLOBAL",
        verificationMethod: "MANUAL_ENTRY",
        verifiedAt: now,
        importance: 3,
        topicKey: `e2e.chat.${token}.update`,
      },
      {
        userId,
        content: `E2E conflict target ${token}`,
        category: "preference",
        scope: "GLOBAL",
        verificationMethod: "MANUAL_ENTRY",
        verifiedAt: now,
        importance: 3,
        topicKey: `e2e.chat.${token}.conflict`,
      },
    ],
  });
}
