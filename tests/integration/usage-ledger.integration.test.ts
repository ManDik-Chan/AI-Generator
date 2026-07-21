import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { createPendingAgentRun } from "@/features/agents/creation";
import { createPendingToolRun } from "@/features/tools/usage";
import { createIntegrationPrisma, integrationDatabaseEnabled } from "@/tests/integration/database";

describe.skipIf(!integrationDatabaseEnabled)("real PostgreSQL usage ledger", () => {
  let db: PrismaClient;
  const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];

  beforeAll(async () => {
    db = createIntegrationPrisma();
    const rows = await db.$queryRaw<Array<{ ledger: string | null }>>`
      SELECT to_regclass('public.usage_ledger')::text AS ledger
    `;
    expect(rows[0]?.ledger).toBe("usage_ledger");
    await db.profile.createMany({
      data: users.map((id, index) => ({ id, email: `${id}@example.test`, displayName: `Ledger ${index}`, role: index === 2 ? "ADMIN" : "USER" })),
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.profile.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });

  it("keeps chat, tool, image, and Agent usage after user-facing history is deleted", async () => {
    const userId = users[0];
    const conversationId = randomUUID();
    const agentConversationId = randomUUID();
    const messageId = randomUUID();
    const toolRunId = randomUUID();
    const imageToolRunId = randomUUID();
    const generatedImageId = randomUUID();
    const agentUserMessageId = randomUUID();
    const agentAssistantMessageId = randomUUID();
    const agentRunId = randomUUID();
    await db.conversation.create({ data: { id: conversationId, userId, title: "deletable" } });
    await db.conversation.create({ data: { id: agentConversationId, userId, title: "agent deletable" } });
    await db.message.create({ data: { id: messageId, conversationId, role: "USER", status: "COMPLETE", content: "charged" } });
    await db.toolRun.create({ data: { id: toolRunId, userId, type: "SUMMARIZE", status: "COMPLETE", options: {}, retainContent: true } });
    await db.toolRun.create({ data: { id: imageToolRunId, userId, type: "IMAGE_GENERATE", status: "COMPLETE", options: {}, retainContent: true } });
    await db.generatedImage.create({
      data: {
        id: generatedImageId,
        userId,
        toolRunId: imageToolRunId,
        kind: "TOOL_GENERATION",
        prompt: "charged",
        provider: "fixture",
        model: "fixture",
        storagePath: `${userId}/${imageToolRunId}/fixture.png`,
        storageBucket: "generated-images",
      },
    });
    await db.message.createMany({ data: [
      { id: agentUserMessageId, conversationId: agentConversationId, role: "USER", status: "COMPLETE", content: "charged agent" },
      { id: agentAssistantMessageId, conversationId: agentConversationId, role: "ASSISTANT", status: "PENDING", content: "" },
    ] });
    await db.agentRun.create({
      data: {
        id: agentRunId,
        userId,
        conversationId: agentConversationId,
        userMessageId: agentUserMessageId,
        assistantMessageId: agentAssistantMessageId,
        mode: "STANDARD",
        plannedWorkerCount: 4,
      },
    });
    await db.usageLedger.createMany({
      data: [
        { userId, capability: "CHAT_MESSAGE", runId: messageId, idempotencyKey: `chat:${messageId}` },
        { userId, capability: "TOOL_SUMMARIZE", runId: toolRunId, idempotencyKey: `tool:${toolRunId}` },
        { userId, capability: "IMAGE_GENERATE", runId: imageToolRunId, idempotencyKey: `image:${imageToolRunId}` },
        { userId, capability: "AGENT_STANDARD", units: 1, runId: agentRunId, idempotencyKey: `agent:${agentRunId}` },
      ],
    });

    await db.conversation.delete({ where: { id: conversationId } });
    await db.toolRun.delete({ where: { id: toolRunId } });
    await db.generatedImage.delete({ where: { id: generatedImageId } });
    await db.agentRun.delete({ where: { id: agentRunId } });

    expect(await db.message.count({ where: { id: messageId } })).toBe(0);
    expect(await db.toolRun.count({ where: { id: toolRunId } })).toBe(0);
    expect(await db.generatedImage.count({ where: { id: generatedImageId } })).toBe(0);
    expect(await db.agentRun.count({ where: { id: agentRunId } })).toBe(0);
    expect(await db.usageLedger.groupBy({
      by: ["capability"],
      where: { userId, runId: { in: [messageId, toolRunId, imageToolRunId, agentRunId] } },
      _sum: { units: true },
      orderBy: { capability: "asc" },
    })).toEqual([
      { capability: "AGENT_STANDARD", _sum: { units: 1 } },
      { capability: "CHAT_MESSAGE", _sum: { units: 1 } },
      { capability: "IMAGE_GENERATE", _sum: { units: 1 } },
      { capability: "TOOL_SUMMARIZE", _sum: { units: 1 } },
    ]);
  });

  it("rolls back a concurrent duplicate Idempotency-Key with no duplicate ToolRun or charge", async () => {
    const userId = users[1];
    const input = {
      userId,
      tool: "SUMMARIZE" as const,
      title: "idempotent",
      inputText: "idempotent",
      options: {},
      retainContent: true,
      dailyLimit: 30,
      idempotencyKey: `same-request-${randomUUID()}`,
    };
    const settled = await Promise.allSettled([createPendingToolRun(input), createPendingToolRun(input)]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await db.usageLedger.count({ where: { userId, capability: "TOOL_SUMMARIZE" } })).toBe(1);
    expect(await db.toolRun.count({ where: { userId, type: "SUMMARIZE" } })).toBe(1);
  });

  it("lets only one of two different concurrent requests pass a daily limit of one", async () => {
    const userId = users[3];
    const base = {
      userId,
      tool: "REWRITE" as const,
      title: "concurrent",
      inputText: "concurrent",
      options: {},
      retainContent: true,
      dailyLimit: 1,
    };
    const settled = await Promise.allSettled([
      createPendingToolRun({ ...base, idempotencyKey: `request-a-${randomUUID()}` }),
      createPendingToolRun({ ...base, idempotencyKey: `request-b-${randomUUID()}` }),
    ]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await db.usageLedger.count({ where: { userId, capability: "TOOL_REWRITE" } })).toBe(1);
    expect(await db.toolRun.count({ where: { userId, type: "REWRITE" } })).toBe(1);
  });

  it("reserves only one AgentRun and one charge for a concurrent duplicate request", async () => {
    const userId = users[4];
    const input = {
      userId,
      content: "idempotent Agent request",
      mode: "STANDARD" as const,
      dailyCredits: 10,
      idempotencyKey: `agent-request-${randomUUID()}`,
    };
    const settled = await Promise.allSettled([createPendingAgentRun(input), createPendingAgentRun(input)]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await db.agentRun.count({ where: { userId } })).toBe(1);
    expect(await db.usageLedger.count({ where: { userId, capability: "AGENT_STANDARD" } })).toBe(1);
  });

  it("enforces one charge per run across capabilities and records ADMIN usage without limiting it", async () => {
    const userId = users[2];
    const runId = randomUUID();
    await db.usageLedger.create({
      data: { userId, capability: "AGENT_DEEP", units: 2, runId, idempotencyKey: `agent:${runId}` },
    });
    await expect(db.usageLedger.create({
      data: { userId, capability: "CHAT_MESSAGE", units: 1, runId, idempotencyKey: `cross-capability:${runId}` },
    })).rejects.toMatchObject({ code: "P2002" });

    await createPendingToolRun({
      userId,
      tool: "TRANSLATE",
      title: "admin one",
      inputText: "admin one",
      options: {},
      retainContent: true,
      dailyLimit: 0,
      idempotencyKey: `admin-a-${randomUUID()}`,
    });
    await createPendingToolRun({
      userId,
      tool: "TRANSLATE",
      title: "admin two",
      inputText: "admin two",
      options: {},
      retainContent: true,
      dailyLimit: 0,
      idempotencyKey: `admin-b-${randomUUID()}`,
    });
    expect(await db.usageLedger.aggregate({ where: { userId }, _sum: { units: true } }))
      .toEqual({ _sum: { units: 4 } });
  });
});
