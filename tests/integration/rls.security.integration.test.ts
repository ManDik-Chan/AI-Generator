import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Prisma, type PrismaClient } from "@prisma/client";

import { createIntegrationPrisma, integrationDatabaseEnabled } from "@/tests/integration/database";

const supabaseUrl = process.env.SUPABASE_TEST_URL?.trim();
const anonKey = process.env.SUPABASE_TEST_ANON_KEY?.trim();
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY?.trim();
const supabaseRlsEnabled = Boolean(integrationDatabaseEnabled && supabaseUrl && anonKey && serviceRoleKey);

if (process.env.REQUIRE_SECURITY_TEST_DATABASE === "true" && !supabaseRlsEnabled) {
  throw new Error("Security acceptance requires an isolated local Supabase URL, anon key, and service-role key; real JWT/PostgREST RLS tests cannot be skipped.");
}

type Fixture = {
  persona: string;
  conversation: string;
  message: string;
  toolRun: string;
  toolAsset: string;
  generationRun: string;
  brainstormWorker: string;
  agentRun: string;
  agentWorker: string;
  agentEvent: string;
  memory: string;
  memoryEmbedding: string;
  generatedImage: string;
  usageLedger: string;
};

const runtimeTables = [
  "messages",
  "tool_runs",
  "tool_assets",
  "generation_runs",
  "brainstorm_workers",
  "agent_runs",
  "agent_workers",
  "agent_events",
  "generated_images",
  "memory_embeddings",
  "usage_ledger",
] as const;

describe.skipIf(!supabaseRlsEnabled)("real Supabase JWT and PostgREST RLS attacks", () => {
  let db: PrismaClient;
  let service: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let anonClient: SupabaseClient;
  const password = `A!${randomUUID()}z9`;
  const users = {
    a: { id: "", email: `rls-a-${randomUUID()}@example.test` },
    b: { id: "", email: `rls-b-${randomUUID()}@example.test` },
    admin: { id: "", email: `rls-admin-${randomUUID()}@example.test` },
  };
  let a: Fixture;
  let b: Fixture;

  const client = () => createClient(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  async function createAuthenticatedUser(email: string) {
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    expect(created.data.user?.id).toBeTruthy();
    const signedInClient = client();
    const signedIn = await signedInClient.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.session?.access_token).toBeTruthy();
    return { id: created.data.user!.id, client: signedInClient };
  }

  async function seedFixture(userId: string, suffix: string): Promise<Fixture> {
    const persona = await db.persona.create({
      data: { userId, name: `Persona ${suffix}`, personality: "test", systemPrompt: "test" },
      select: { id: true },
    });
    const conversation = await db.conversation.create({
      data: { userId, personaId: persona.id, title: `Conversation ${suffix}` },
      select: { id: true },
    });
    const message = await db.message.create({
      data: { conversationId: conversation.id, role: "USER", status: "COMPLETE", content: suffix },
      select: { id: true },
    });
    const assistantMessage = await db.message.create({
      data: { conversationId: conversation.id, role: "ASSISTANT", status: "PENDING", content: "" },
      select: { id: true },
    });
    const agentUserMessage = await db.message.create({
      data: { conversationId: conversation.id, role: "USER", status: "COMPLETE", content: `agent ${suffix}` },
      select: { id: true },
    });
    const toolRun = await db.toolRun.create({
      data: { userId, type: "BRAINSTORM", status: "PENDING", options: {}, retainContent: true },
      select: { id: true },
    });
    const toolAsset = await db.toolAsset.create({
      data: {
        userId,
        toolRunId: toolRun.id,
        storagePath: `${userId}/${toolRun.id}/fixture.png`,
        mimeType: "image/png",
        sizeBytes: 68,
        width: 1,
        height: 1,
        sha256: "0".repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      },
      select: { id: true },
    });
    const generationRun = await db.generationRun.create({
      data: { userId, personaId: persona.id, type: "PERSONA_DRAFT", status: "PENDING", input: {}, expiresAt: new Date(Date.now() + 60_000) },
      select: { id: true },
    });
    const brainstormWorker = await db.brainstormWorker.create({
      data: { userId, toolRunId: toolRun.id, role: "ANALYST", position: 0, status: "PENDING" },
      select: { id: true },
    });
    const agentRun = await db.agentRun.create({
      data: {
        userId,
        conversationId: conversation.id,
        userMessageId: agentUserMessage.id,
        assistantMessageId: assistantMessage.id,
        mode: "STANDARD",
        plannedWorkerCount: 4,
      },
      select: { id: true },
    });
    const agentWorker = await db.agentWorker.create({
      data: {
        userId,
        agentRunId: agentRun.id,
        key: "worker-1",
        position: 0,
        name: "Worker",
        title: "Fixture",
        objective: "Fixture objective",
        expectedDeliverable: "Fixture deliverable",
        priority: "HIGH",
      },
      select: { id: true },
    });
    const agentEvent = await db.agentEvent.create({
      data: { userId, agentRunId: agentRun.id, sequence: 1, type: "RUN_CREATED" },
      select: { id: true },
    });
    const memory = await db.memory.create({
      data: { userId, content: `Memory ${suffix}`, category: "fixture", scope: "GLOBAL" },
      select: { id: true },
    });
    await db.$executeRaw(Prisma.sql`
      INSERT INTO public.memory_embeddings
        (memory_id, user_id, model, dimensions, content_hash, embedding, created_at, updated_at)
      VALUES
        (${memory.id}::uuid, ${userId}::uuid, 'fixture', 512, ${"1".repeat(64)},
         array_fill(0::real, ARRAY[512])::extensions.vector, now(), now())
    `);
    const generatedImage = await db.generatedImage.create({
      data: {
        userId,
        toolRunId: toolRun.id,
        kind: "TOOL_GENERATION",
        prompt: "fixture",
        provider: "fixture",
        model: "fixture",
        storagePath: `${userId}/${toolRun.id}/generated.png`,
        storageBucket: "generated-images",
      },
      select: { id: true },
    });
    const usageLedger = await db.usageLedger.create({
      data: { userId, capability: "CHAT_MESSAGE", runId: message.id, idempotencyKey: `fixture:${message.id}` },
      select: { id: true },
    });
    return {
      persona: persona.id,
      conversation: conversation.id,
      message: message.id,
      toolRun: toolRun.id,
      toolAsset: toolAsset.id,
      generationRun: generationRun.id,
      brainstormWorker: brainstormWorker.id,
      agentRun: agentRun.id,
      agentWorker: agentWorker.id,
      agentEvent: agentEvent.id,
      memory: memory.id,
      memoryEmbedding: memory.id,
      generatedImage: generatedImage.id,
      usageLedger: usageLedger.id,
    };
  }

  beforeAll(async () => {
    db = createIntegrationPrisma();
    service = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    anonClient = client();
    const createdA = await createAuthenticatedUser(users.a.email);
    const createdB = await createAuthenticatedUser(users.b.email);
    const createdAdmin = await createAuthenticatedUser(users.admin.email);
    users.a.id = createdA.id;
    users.b.id = createdB.id;
    users.admin.id = createdAdmin.id;
    userAClient = createdA.client;
    userBClient = createdB.client;
    adminClient = createdAdmin.client;
    await db.profile.update({ where: { id: users.admin.id }, data: { role: "ADMIN" } });
    a = await seedFixture(users.a.id, "A");
    b = await seedFixture(users.b.id, "B");
  }, 120_000);

  afterAll(async () => {
    if (!service || !db) return;
    for (const user of Object.values(users)) {
      if (user.id) await service.auth.admin.deleteUser(user.id).catch(() => undefined);
    }
    await db.profile.deleteMany({ where: { id: { in: Object.values(users).map((user) => user.id).filter(Boolean) } } });
    await db.$disconnect();
  }, 120_000);

  it("allows only the three approved own-profile columns", async () => {
    const own = await userAClient.from("profiles").select("id,email,role,display_name,avatar_url,memory_enabled").eq("id", users.a.id).single();
    expect(own.error).toBeNull();
    expect(own.data).toMatchObject({ id: users.a.id, email: users.a.email, role: "USER" });

    const allowed = await userAClient.from("profiles").update({
      display_name: "Allowed A",
      avatar_url: "https://example.test/a.png",
      memory_enabled: false,
    }).eq("id", users.a.id).select("display_name,avatar_url,memory_enabled").single();
    expect(allowed.error).toBeNull();
    expect(allowed.data).toEqual({ display_name: "Allowed A", avatar_url: "https://example.test/a.png", memory_enabled: false });

    for (const patch of [
      { role: "ADMIN" },
      { email: `stolen-${randomUUID()}@example.test` },
      { id: randomUUID() },
      { created_at: new Date(0).toISOString() },
      { updated_at: new Date(0).toISOString() },
    ]) {
      const attack = await userAClient.from("profiles").update(patch).eq("id", users.a.id).select();
      expect(attack.error, JSON.stringify(patch)).not.toBeNull();
    }
    expect(await db.profile.findUnique({ where: { id: users.a.id }, select: { role: true, email: true } }))
      .toEqual({ role: "USER", email: users.a.email });
  });

  it("prevents cross-user profile reads and writes for USER and ADMIN JWTs", async () => {
    const readB = await userAClient.from("profiles").select("id").eq("id", users.b.id);
    expect(readB.error).toBeNull();
    expect(readB.data).toEqual([]);
    const writeB = await userAClient.from("profiles").update({ display_name: "stolen" }).eq("id", users.b.id).select();
    expect(writeB.error).toBeNull();
    expect(writeB.data).toEqual([]);
    const adminReadA = await adminClient.from("profiles").select("id").eq("id", users.a.id);
    expect(adminReadA.error).toBeNull();
    expect(adminReadA.data).toEqual([]);
    const userBReadA = await userBClient.from("profiles").select("id").eq("id", users.a.id);
    expect(userBReadA.error).toBeNull();
    expect(userBReadA.data).toEqual([]);
  });

  it("lets authenticated users read only their own server-owned rows", async () => {
    const ids: Record<(typeof runtimeTables)[number], [string, string]> = {
      messages: [a.message, b.message],
      tool_runs: [a.toolRun, b.toolRun],
      tool_assets: [a.toolAsset, b.toolAsset],
      generation_runs: [a.generationRun, b.generationRun],
      brainstorm_workers: [a.brainstormWorker, b.brainstormWorker],
      agent_runs: [a.agentRun, b.agentRun],
      agent_workers: [a.agentWorker, b.agentWorker],
      agent_events: [a.agentEvent, b.agentEvent],
      generated_images: [a.generatedImage, b.generatedImage],
      memory_embeddings: [a.memoryEmbedding, b.memoryEmbedding],
      usage_ledger: [a.usageLedger, b.usageLedger],
    };
    for (const table of runtimeTables) {
      const idColumn = table === "memory_embeddings" ? "memory_id" : "id";
      const own = await userAClient.from(table).select(idColumn).eq(idColumn, ids[table][0]);
      expect(own.error, `${table} own read`).toBeNull();
      expect(own.data, `${table} own read`).toHaveLength(1);
      const foreign = await userAClient.from(table).select(idColumn).eq(idColumn, ids[table][1]);
      expect(foreign.error, `${table} foreign read`).toBeNull();
      expect(foreign.data, `${table} foreign read`).toEqual([]);
    }
  });

  it("rejects INSERT, status forgery, and DELETE on every server-owned table", async () => {
    const ids: Record<(typeof runtimeTables)[number], string> = {
      messages: a.message,
      tool_runs: a.toolRun,
      tool_assets: a.toolAsset,
      generation_runs: a.generationRun,
      brainstorm_workers: a.brainstormWorker,
      agent_runs: a.agentRun,
      agent_workers: a.agentWorker,
      agent_events: a.agentEvent,
      generated_images: a.generatedImage,
      memory_embeddings: a.memoryEmbedding,
      usage_ledger: a.usageLedger,
    };
    const updatePatch: Record<(typeof runtimeTables)[number], Record<string, unknown>> = {
      messages: { status: "COMPLETE", content: "forged AI reply" },
      tool_runs: { status: "COMPLETE" },
      tool_assets: { storage_path: "forged/path" },
      generation_runs: { status: "COMPLETE" },
      brainstorm_workers: { status: "COMPLETE", output_text: "forged" },
      agent_runs: { status: "COMPLETE", phase: "FINISHED" },
      agent_workers: { status: "COMPLETE", final_deliverable: "forged" },
      agent_events: { type: "RUN_COMPLETED" },
      generated_images: { storage_path: "forged/path" },
      memory_embeddings: { model: "forged" },
      usage_ledger: { units: 0 },
    };
    for (const table of runtimeTables) {
      const idColumn = table === "memory_embeddings" ? "memory_id" : "id";
      const inserted = await userAClient.from(table).insert({});
      expect(inserted.error, `${table} INSERT`).not.toBeNull();
      const updated = await userAClient.from(table).update(updatePatch[table]).eq(idColumn, ids[table]);
      expect(updated.error, `${table} UPDATE`).not.toBeNull();
      const deleted = await userAClient.from(table).delete().eq(idColumn, ids[table]);
      expect(deleted.error, `${table} DELETE`).not.toBeNull();
    }
    expect(await db.message.findUnique({ where: { id: a.message }, select: { content: true } })).toEqual({ content: "A" });
    expect(await db.usageLedger.findUnique({ where: { id: a.usageLedger }, select: { units: true } })).toEqual({ units: 1 });
  });

  it("gives anon no profile, runtime-state, or usage-ledger access", async () => {
    for (const table of ["profiles", ...runtimeTables]) {
      const result = await anonClient.from(table).select("*").limit(1);
      expect(result.error, `${table} anon read`).not.toBeNull();
    }
  });
});
