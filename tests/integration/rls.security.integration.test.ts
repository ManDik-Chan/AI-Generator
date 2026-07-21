import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { createIntegrationPrisma, integrationDatabaseEnabled } from "@/tests/integration/database";

const browserReadOnlyTables = [
  "personas",
  "conversations",
  "memories",
  "messages",
  "memory_embeddings",
  "generated_images",
  "tool_runs",
  "tool_assets",
  "generation_runs",
  "brainstorm_workers",
  "agent_runs",
  "agent_workers",
  "agent_events",
  "usage_ledger",
] as const;

describe.skipIf(!integrationDatabaseEnabled)("real PostgreSQL authenticated RLS", () => {
  let db: PrismaClient;
  const userA = randomUUID();
  const userB = randomUUID();
  const conversationA = randomUUID();
  const conversationB = randomUUID();
  const messageA = randomUUID();
  const messageB = randomUUID();
  const toolRunA = randomUUID();
  const toolRunB = randomUUID();
  const personaB = randomUUID();

  async function asAuthenticated<T>(userId: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT
          set_config('request.jwt.claim.sub', ${userId}, true),
          set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)
      `);
      await tx.$executeRawUnsafe("SET LOCAL ROLE authenticated");
      return work(tx);
    });
  }

  beforeAll(async () => {
    db = createIntegrationPrisma();
    const readiness = await db.$queryRaw<Array<{ ledger: string | null; authUid: string | null }>>`
      SELECT to_regclass('public.usage_ledger')::text AS ledger,
             to_regprocedure('auth.uid()')::text AS "authUid"
    `;
    expect(readiness[0]).toEqual({ ledger: "usage_ledger", authUid: "auth.uid()" });

    await db.profile.createMany({
      data: [
        { id: userA, email: `${userA}@example.test`, displayName: "User A", role: "USER" },
        { id: userB, email: `${userB}@example.test`, displayName: "User B", role: "USER" },
      ],
    });
    await db.conversation.createMany({
      data: [
        { id: conversationA, userId: userA, title: "A" },
        { id: conversationB, userId: userB, title: "B" },
      ],
    });
    await db.message.createMany({
      data: [
        { id: messageA, conversationId: conversationA, role: "USER", status: "COMPLETE", content: "A" },
        { id: messageB, conversationId: conversationB, role: "USER", status: "COMPLETE", content: "B" },
      ],
    });
    await db.toolRun.createMany({
      data: [
        { id: toolRunA, userId: userA, type: "SUMMARIZE", status: "PENDING", options: {}, retainContent: true },
        { id: toolRunB, userId: userB, type: "SUMMARIZE", status: "PENDING", options: {}, retainContent: true },
      ],
    });
    await db.usageLedger.createMany({
      data: [
        { userId: userA, capability: "CHAT_MESSAGE", runId: messageA, idempotencyKey: `test:${messageA}` },
        { userId: userB, capability: "CHAT_MESSAGE", runId: messageB, idempotencyKey: `test:${messageB}` },
      ],
    });
    await db.persona.create({
      data: { id: personaB, userId: userB, name: "B Persona", personality: "test", systemPrompt: "test" },
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.profile.deleteMany({ where: { id: { in: [userA, userB] } } });
    await db.$disconnect();
  });

  it("prevents a USER JWT from updating role while allowing approved profile columns", async () => {
    await expect(asAuthenticated(userA, (tx) => tx.$executeRaw(
      Prisma.sql`UPDATE public.profiles SET role = 'ADMIN' WHERE id = ${userA}::uuid`,
    ))).rejects.toThrow();

    expect(await db.profile.findUnique({ where: { id: userA }, select: { role: true } })).toEqual({ role: "USER" });
    await expect(asAuthenticated(userA, (tx) => tx.$executeRaw(
      Prisma.sql`UPDATE public.profiles SET display_name = 'Allowed' WHERE id = ${userA}::uuid`,
    ))).resolves.toBe(1);
  });

  it("gives authenticated users SELECT-only SQL grants on server-owned state", async () => {
    for (const table of browserReadOnlyTables) {
      const [privileges] = await db.$queryRaw<Array<{ select: boolean; insert: boolean; update: boolean; delete: boolean }>>(Prisma.sql`
        SELECT
          has_table_privilege('authenticated', ${`public.${table}`}, 'SELECT') AS "select",
          has_table_privilege('authenticated', ${`public.${table}`}, 'INSERT') AS "insert",
          has_table_privilege('authenticated', ${`public.${table}`}, 'UPDATE') AS "update",
          has_table_privilege('authenticated', ${`public.${table}`}, 'DELETE') AS "delete"
      `);
      expect(privileges, table).toEqual({ select: true, insert: false, update: false, delete: false });
    }
  });

  it("rejects direct Message, ToolRun, and UsageLedger mutation", async () => {
    await expect(asAuthenticated(userA, (tx) => tx.$executeRaw(Prisma.sql`
      INSERT INTO public.messages (id, conversation_id, role, content, status)
      VALUES (${randomUUID()}::uuid, ${conversationA}::uuid, 'ASSISTANT', 'forged', 'COMPLETE')
    `))).rejects.toThrow();
    await expect(asAuthenticated(userA, (tx) => tx.$executeRaw(Prisma.sql`
      UPDATE public.tool_runs SET status = 'COMPLETE' WHERE id = ${toolRunA}::uuid
    `))).rejects.toThrow();
    await expect(asAuthenticated(userA, (tx) => tx.$executeRaw(Prisma.sql`
      DELETE FROM public.usage_ledger WHERE user_id = ${userA}::uuid
    `))).rejects.toThrow();
  });

  it("prevents user A from reading or mutating user B resources", async () => {
    const foreignProfiles = await asAuthenticated(userA, (tx) => tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM public.profiles WHERE id = ${userB}::uuid`,
    ));
    const foreignConversations = await asAuthenticated(userA, (tx) => tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM public.conversations WHERE id = ${conversationB}::uuid`,
    ));
    const foreignMessages = await asAuthenticated(userA, (tx) => tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM public.messages WHERE id = ${messageB}::uuid`,
    ));
    const foreignRuns = await asAuthenticated(userA, (tx) => tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM public.tool_runs WHERE id = ${toolRunB}::uuid`,
    ));
    const foreignUsage = await asAuthenticated(userA, (tx) => tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM public.usage_ledger WHERE user_id = ${userB}::uuid`,
    ));
    expect(foreignProfiles).toEqual([]);
    expect(foreignConversations).toEqual([]);
    expect(foreignMessages).toEqual([]);
    expect(foreignRuns).toEqual([]);
    expect(foreignUsage).toEqual([]);

    await expect(asAuthenticated(userA, (tx) => tx.$executeRaw(
      Prisma.sql`UPDATE public.personas SET name = 'stolen' WHERE id = ${personaB}::uuid`,
    ))).rejects.toThrow();
    await expect(asAuthenticated(userA, (tx) => tx.$executeRaw(
      Prisma.sql`DELETE FROM public.personas WHERE id = ${personaB}::uuid`,
    ))).rejects.toThrow();
    await expect(asAuthenticated(userA, (tx) => tx.$executeRaw(
      Prisma.sql`UPDATE public.profiles SET display_name = 'stolen' WHERE id = ${userB}::uuid`,
    ))).resolves.toBe(0);
    await expect(asAuthenticated(userA, (tx) => tx.$executeRaw(
      Prisma.sql`DELETE FROM public.conversations WHERE id = ${conversationB}::uuid`,
    ))).rejects.toThrow();
  });
});
