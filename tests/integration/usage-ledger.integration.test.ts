import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { createIntegrationPrisma, integrationDatabaseEnabled } from "@/tests/integration/database";

describe.skipIf(!integrationDatabaseEnabled)("real PostgreSQL usage ledger", () => {
  let db: PrismaClient;
  const users = [randomUUID(), randomUUID(), randomUUID()];

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

  it("keeps chat and tool usage after user-facing history is deleted", async () => {
    const userId = users[0];
    const conversationId = randomUUID();
    const messageId = randomUUID();
    const toolRunId = randomUUID();
    await db.conversation.create({ data: { id: conversationId, userId, title: "deletable" } });
    await db.message.create({ data: { id: messageId, conversationId, role: "USER", status: "COMPLETE", content: "charged" } });
    await db.toolRun.create({ data: { id: toolRunId, userId, type: "SUMMARIZE", status: "COMPLETE", options: {}, retainContent: true } });
    await db.usageLedger.createMany({
      data: [
        { userId, capability: "CHAT_MESSAGE", runId: messageId, idempotencyKey: `chat:${messageId}` },
        { userId, capability: "TOOL_SUMMARIZE", runId: toolRunId, idempotencyKey: `tool:${toolRunId}` },
      ],
    });

    await db.conversation.delete({ where: { id: conversationId } });
    await db.toolRun.delete({ where: { id: toolRunId } });

    expect(await db.message.count({ where: { id: messageId } })).toBe(0);
    expect(await db.toolRun.count({ where: { id: toolRunId } })).toBe(0);
    expect(await db.usageLedger.groupBy({
      by: ["capability"],
      where: { userId, runId: { in: [messageId, toolRunId] } },
      _sum: { units: true },
      orderBy: { capability: "asc" },
    })).toEqual([
      { capability: "CHAT_MESSAGE", _sum: { units: 1 } },
      { capability: "TOOL_SUMMARIZE", _sum: { units: 1 } },
    ]);
  });

  it("lets only one concurrent Serializable reservation pass a limit of one", async () => {
    const userId = users[1];
    let arrivals = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => { release = resolve; });
    const reserve = (runId: string) => db.$transaction(async (tx) => {
      const aggregate = await tx.usageLedger.aggregate({
        where: { userId, capability: "IMAGE_ANALYZE" },
        _sum: { units: true },
      });
      if ((aggregate._sum.units ?? 0) >= 1) throw new Error("DAILY_LIMIT");
      arrivals += 1;
      if (arrivals === 2) release();
      await bothRead;
      await tx.usageLedger.create({
        data: { userId, capability: "IMAGE_ANALYZE", runId, idempotencyKey: `concurrent:${runId}` },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const settled = await Promise.allSettled([reserve(randomUUID()), reserve(randomUUID())]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await db.usageLedger.count({ where: { userId, capability: "IMAGE_ANALYZE" } })).toBe(1);
  });

  it("enforces one charge per run and records ADMIN usage", async () => {
    const userId = users[2];
    const runId = randomUUID();
    await db.usageLedger.create({
      data: { userId, capability: "AGENT_DEEP", units: 2, runId, idempotencyKey: `agent:${runId}` },
    });
    await expect(db.usageLedger.create({
      data: { userId, capability: "AGENT_DEEP", units: 2, runId, idempotencyKey: `agent-duplicate:${runId}` },
    })).rejects.toMatchObject({ code: "P2002" });
    expect(await db.usageLedger.aggregate({ where: { userId, capability: "AGENT_DEEP" }, _sum: { units: true } }))
      .toEqual({ _sum: { units: 2 } });
  });
});
