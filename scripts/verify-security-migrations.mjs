import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
assert(databaseUrl, "A disposable TEST_DATABASE_URL is required.");
assert.equal(process.env.ALLOW_TEST_DATABASE_MUTATIONS, "true", "Mutation safety flag is required.");
assert.equal(process.env.TEST_DATABASE_CONFIRMED_NON_PRODUCTION, "true", "Non-production confirmation is required.");

const commandName = "pnpm";
const useWindowsShell = process.platform === "win32";
const securityMigration = "20260722120000_security_hardening_rls_usage";
const proposalMigration = "20260724120000_add_trusted_memory_proposals";
const runtimeTables = [
  "messages", "memory_proposals", "memory_embeddings", "generated_images", "tool_runs", "tool_assets",
  "generation_runs", "brainstorm_workers", "agent_runs", "agent_workers", "agent_events", "usage_ledger",
];
const rlsTables = ["profiles", "personas", "conversations", "memories", ...runtimeTables];

function safeRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    shell: useWindowsShell,
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${options.label || command} failed with exit code ${result.status ?? "unknown"}; output suppressed because it may contain credentials.`);
  }
}

function resetSupabase() {
  safeRun(
    commandName,
    ["exec", "supabase", "db", "reset", "--no-seed"],
    { label: "Supabase disposable database reset" },
  );
}

function restoreCurrentDatabase() {
  resetSupabase();
  deploy(join(root, "prisma", "schema.prisma"));
}

function makeMigrationTree(filter, mutate) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "ai-generator-migrations-"));
  const temporaryPrisma = join(temporaryRoot, "prisma");
  mkdirSync(temporaryPrisma, { recursive: true });
  cpSync(join(root, "prisma", "schema.prisma"), join(temporaryPrisma, "schema.prisma"), { recursive: false });
  const migrationsSource = join(root, "prisma", "migrations");
  const migrationsTarget = join(temporaryPrisma, "migrations");
  cpSync(migrationsSource, migrationsTarget, {
    recursive: true,
    filter: (source) => {
      if (source === migrationsSource) return true;
      const relative = source.slice(migrationsSource.length + 1).replaceAll("\\", "/");
      const topLevel = relative.split("/")[0];
      return topLevel === "migration_lock.toml" || filter(topLevel);
    },
  });
  mutate?.(temporaryPrisma);
  return { temporaryRoot, schema: join(temporaryPrisma, "schema.prisma") };
}

function deploy(schema) {
  safeRun(commandName, ["exec", "prisma", "migrate", "deploy", "--schema", schema], { label: "Prisma migration deploy" });
}

async function seedOldDatabase(db) {
  const userId = randomUUID();
  const adminId = randomUUID();
  const personaId = randomUUID();
  const conversationId = randomUUID();
  const chatMessageId = randomUUID();
  const agentUserMessageId = randomUUID();
  const agentAssistantMessageId = randomUUID();
  const toolRunId = randomUUID();
  const agentRunId = randomUUID();
  const generationRunId = randomUUID();
  const memoryId = randomUUID();
  const generatedImageId = randomUUID();

  await db.profile.createMany({ data: [
    { id: userId, email: `${userId}@example.test`, displayName: "Synthetic User", role: "USER" },
    { id: adminId, email: `${adminId}@example.test`, displayName: "Synthetic Admin", role: "ADMIN" },
  ] });
  await db.persona.create({ data: { id: personaId, userId, name: "Synthetic Persona", personality: "fixture", systemPrompt: "fixture" } });
  await db.conversation.create({ data: { id: conversationId, userId, personaId, title: "Synthetic Conversation" } });
  await db.message.createMany({ data: [
    { id: chatMessageId, conversationId, role: "USER", status: "COMPLETE", content: "historical chat" },
    { id: agentUserMessageId, conversationId, role: "USER", status: "COMPLETE", content: "historical agent" },
    { id: agentAssistantMessageId, conversationId, role: "ASSISTANT", status: "PENDING", content: "" },
  ] });
  await db.toolRun.create({ data: { id: toolRunId, userId, type: "SUMMARIZE", status: "COMPLETE", options: {}, retainContent: true } });
  await db.agentRun.create({ data: {
    id: agentRunId,
    userId,
    conversationId,
    userMessageId: agentUserMessageId,
    assistantMessageId: agentAssistantMessageId,
    mode: "STANDARD",
    plannedWorkerCount: 4,
  } });
  await db.generationRun.create({ data: {
    id: generationRunId,
    userId,
    personaId,
    type: "PERSONA_DRAFT",
    status: "COMPLETE",
    input: { fixture: true },
    result: { fixture: true },
    expiresAt: new Date(Date.now() + 86_400_000),
  } });
  await db.$executeRawUnsafe(
    `INSERT INTO public.memories
       (id, user_id, persona_id, content, category, scope, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'PERSONA', CURRENT_TIMESTAMP)`,
    memoryId,
    userId,
    personaId,
    "synthetic memory",
    "fixture",
  );
  await db.generatedImage.create({ data: {
    id: generatedImageId,
    userId,
    kind: "PERSONA_AVATAR",
    prompt: "synthetic avatar",
    provider: "fixture",
    model: "fixture",
    storagePath: `${userId}/synthetic.png`,
    storageBucket: "persona-avatars",
  } });

  return {
    ids: { userId, adminId, personaId, conversationId, chatMessageId, agentUserMessageId, agentAssistantMessageId, toolRunId, agentRunId, generationRunId, memoryId, generatedImageId },
    counts: {
      profiles: await db.profile.count(),
      personas: await db.persona.count(),
      conversations: await db.conversation.count(),
      messages: await db.message.count(),
      toolRuns: await db.toolRun.count(),
      agentRuns: await db.agentRun.count(),
      generationRuns: await db.generationRun.count(),
      memories: await db.memory.count(),
      generatedImages: await db.generatedImage.count(),
    },
  };
}

async function verifyCleanDatabase() {
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const rls = await db.$queryRawUnsafe(`
      SELECT relname AS table_name, relrowsecurity AS enabled
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname = ANY($1::text[])
      ORDER BY relname
    `, rlsTables);
    assert.equal(rls.length, rlsTables.length);
    assert(rls.every((row) => row.enabled === true), "Every browser-visible table must have RLS enabled.");

    const policies = await db.$queryRawUnsafe(`
      SELECT tablename, policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = ANY($1::text[])
    `, rlsTables);
    assert.equal(policies.length, rlsTables.length + 1, "Expected one SELECT policy per table and one UPDATE policy for profiles.");
    assert(policies.every((row) => row.cmd === "SELECT" || (row.tablename === "profiles" && row.cmd === "UPDATE")));

    const grants = await db.$queryRawUnsafe(`
      SELECT table_name::text AS table_name,
             array_agg(privilege_type::text ORDER BY privilege_type::text)::text[] AS privileges
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee = 'authenticated' AND table_name = ANY($1::text[])
      GROUP BY table_name
      ORDER BY table_name
    `, runtimeTables);
    assert.equal(grants.length, runtimeTables.length);
    assert(grants.every((row) => row.privileges.length === 1 && row.privileges[0] === "SELECT"));

    const profileUpdates = await db.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.column_privileges
      WHERE table_schema = 'public' AND table_name = 'profiles'
        AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
      ORDER BY column_name
    `);
    assert.deepEqual(profileUpdates.map((row) => row.column_name), ["avatar_url", "display_name", "memory_enabled"]);

    const metadata = await db.$queryRawUnsafe(`
      SELECT
        to_regclass('public.usage_ledger')::text AS ledger,
        to_regclass('public.memory_proposals')::text AS proposals,
        to_regprocedure('public.protect_profile_system_fields()')::text AS profile_guard,
        to_regprocedure('public.validate_memory_proposal()')::text AS proposal_guard,
        to_regprocedure('public.protect_memory_proposal_source_message()')::text AS source_guard,
        to_regprocedure('public.prepare_memory_proposal_memory_delete()')::text AS memory_delete_guard,
        to_regprocedure('public.bump_memory_revision()')::text AS revision_guard,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'public.profiles'::regclass
            AND tgname = 'profiles_protect_system_fields' AND NOT tgisinternal
        ) AS profile_trigger,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'public.memory_proposals'::regclass
            AND tgname = 'memory_proposals_validate' AND NOT tgisinternal
        ) AS proposal_trigger,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'public.messages'::regclass
            AND tgname = 'messages_protect_memory_proposal_source' AND NOT tgisinternal
        ) AS source_trigger,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'public.memories'::regclass
            AND tgname = 'memories_prepare_memory_proposal_delete' AND NOT tgisinternal
        ) AS memory_delete_trigger,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'public.memories'::regclass
            AND tgname = 'memories_bump_revision' AND NOT tgisinternal
        ) AS revision_trigger,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'auth.users'::regclass
            AND tgname = 'on_auth_user_created' AND NOT tgisinternal
        ) AS auth_trigger
    `);
    assert.deepEqual(metadata[0], {
      ledger: "usage_ledger",
      proposals: "memory_proposals",
      profile_guard: "protect_profile_system_fields()",
      proposal_guard: "validate_memory_proposal()",
      source_guard: "protect_memory_proposal_source_message()",
      memory_delete_guard: "prepare_memory_proposal_memory_delete()",
      revision_guard: "bump_memory_revision()",
      profile_trigger: true,
      proposal_trigger: true,
      source_trigger: true,
      memory_delete_trigger: true,
      revision_trigger: true,
      auth_trigger: true,
    });
    const ownershipConstraints = await db.$queryRawUnsafe(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.memory_proposals'::regclass
        AND contype = 'f'
      ORDER BY conname
    `);
    assert.deepEqual(ownershipConstraints.map((row) => row.conname), [
      "memory_proposals_persona_owner_fkey",
      "memory_proposals_resolved_owner_fkey",
      "memory_proposals_source_conversation_owner_fkey",
      "memory_proposals_source_message_conversation_fkey",
      "memory_proposals_target_owner_fkey",
      "memory_proposals_user_id_fkey",
    ]);
    await db.usageLedger.count();
    console.log(`clean_migration_verified rls_tables=${rls.length} policies=${policies.length} runtime_grants=${grants.length}`);
  } finally {
    await db.$disconnect();
  }
}

async function deployWithLockSampling(db) {
  const startedAt = Date.now();
  const child = spawn(commandName, ["exec", "prisma", "migrate", "deploy"], {
    cwd: root,
    env: process.env,
    shell: useWindowsShell,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let firstLockAt;
  let lastLockAt;
  let maxRelationLocks = 0;
  const exit = new Promise((resolveExit) => child.once("exit", (code) => resolveExit(code)));
  while (child.exitCode === null) {
    const rows = await db.$queryRawUnsafe(`
      SELECT count(*)::int AS count
      FROM pg_locks l
      JOIN pg_class c ON c.oid = l.relation
      WHERE c.relnamespace = 'public'::regnamespace
        AND l.pid <> pg_backend_pid()
        AND l.granted
    `);
    const count = rows[0]?.count ?? 0;
    if (count > 0) {
      firstLockAt ??= Date.now();
      lastLockAt = Date.now();
      maxRelationLocks = Math.max(maxRelationLocks, count);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  const code = await exit;
  if (code !== 0) throw new Error("Incremental Prisma migration failed; child output suppressed because it may contain credentials.");
  return {
    durationMs: Date.now() - startedAt,
    observedLockWindowMs: firstLockAt && lastLockAt ? lastLockAt - firstLockAt + 10 : 0,
    maxRelationLocks,
  };
}

async function verifyIncrementalUpgrade() {
  resetSupabase();
  const old = makeMigrationTree((name) => name < securityMigration);
  try {
    // Supabase reset already leaves an empty disposable application schema.
    // Deploying the historical tree exercises the production migration path
    // without a second platform-specific destructive reset.
    deploy(old.schema);
    const db = new PrismaClient({ datasourceUrl: databaseUrl });
    try {
      const fixture = await seedOldDatabase(db);
      const metrics = await deployWithLockSampling(db);
      const counts = {
        profiles: await db.profile.count(),
        personas: await db.persona.count(),
        conversations: await db.conversation.count(),
        messages: await db.message.count(),
        toolRuns: await db.toolRun.count(),
        agentRuns: await db.agentRun.count(),
        generationRuns: await db.generationRun.count(),
        memories: await db.memory.count(),
        generatedImages: await db.generatedImage.count(),
      };
      assert.deepEqual(counts, fixture.counts, "Incremental migration must not lose synthetic history.");
      assert.equal((await db.profile.findUnique({ where: { id: fixture.ids.adminId }, select: { role: true } }))?.role, "ADMIN");
      const usage = await db.usageLedger.groupBy({
        by: ["capability"],
        where: { userId: fixture.ids.userId },
        _sum: { units: true },
      });
      usage.sort((left, right) => left.capability.localeCompare(right.capability));
      assert.deepEqual(usage, [
        { capability: "AGENT_STANDARD", _sum: { units: 1 } },
        { capability: "CHAT_MESSAGE", _sum: { units: 1 } },
        { capability: "TOOL_SUMMARIZE", _sum: { units: 1 } },
      ]);
      console.log(`incremental_migration_verified duration_ms=${metrics.durationMs} observed_lock_window_ms=${metrics.observedLockWindowMs} max_relation_locks=${metrics.maxRelationLocks}`);
    } finally {
      await db.$disconnect();
    }
  } finally {
    rmSync(old.temporaryRoot, { recursive: true, force: true });
  }
}

async function verifyProposalTransactionalRollback(mode) {
  const base = makeMigrationTree((name) => name < proposalMigration);
  const failing = makeMigrationTree(() => true, (temporaryPrisma) => {
    const migrationPath = join(temporaryPrisma, "migrations", proposalMigration, "migration.sql");
    const sql = readFileSync(migrationPath, "utf8");
    assert(sql.includes("COMMIT;"));
    writeFileSync(migrationPath, sql.replace(/COMMIT;\s*$/, "SELECT 1 / 0;\n\nCOMMIT;\n"), "utf8");
  });
  try {
    resetSupabase();
    let fixture;
    if (mode === "incremental") {
      deploy(base.schema);
    }
    const db = new PrismaClient({ datasourceUrl: databaseUrl });
    try {
      if (mode === "incremental") fixture = await seedOldDatabase(db);
      const args = [
        "exec",
        "prisma",
        "migrate",
        "deploy",
        "--schema",
        failing.schema,
      ];
      const failed = spawnSync(commandName, args, {
        cwd: root,
        env: process.env,
        encoding: "utf8",
        shell: useWindowsShell,
        windowsHide: true,
      });
      assert.notEqual(failed.status, 0, "Injected migration failure must fail.");
      const state = await db.$queryRawUnsafe(`
        SELECT
          to_regclass('public.memory_proposals')::text AS proposals,
          to_regtype('public."MemoryProposalStatus"')::text AS proposal_status,
          to_regtype('public."MemoryProposalAction"')::text AS proposal_action,
          to_regprocedure('public.validate_memory_proposal()')::text AS proposal_guard,
          to_regprocedure('public.protect_memory_proposal_source_message()')::text AS source_guard,
          to_regprocedure('public.prepare_memory_proposal_memory_delete()')::text AS memory_delete_guard,
          to_regprocedure('public.bump_memory_revision()')::text AS revision_guard,
          to_regclass('public.usage_ledger')::text AS ledger,
          to_regprocedure('public.protect_profile_system_fields()')::text AS profile_guard,
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'memories'
              AND column_name = 'revision'
          ) AS memory_revision,
          EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgrelid = 'public.memories'::regclass
              AND tgname = 'memories_prepare_memory_proposal_delete'
              AND NOT tgisinternal
          ) AS memory_delete_trigger
      `);
      assert.deepEqual(state[0], {
        proposals: null,
        proposal_status: null,
        proposal_action: null,
        proposal_guard: null,
        source_guard: null,
        memory_delete_guard: null,
        revision_guard: null,
        ledger: "usage_ledger",
        profile_guard: "protect_profile_system_fields()",
        memory_revision: false,
        memory_delete_trigger: false,
      });
      const leakedSecurity = await db.$queryRawUnsafe(`
        SELECT
          count(*) FILTER (WHERE policyname = 'memory_proposals_select_own')::int AS policies,
          count(*) FILTER (WHERE table_name = 'memory_proposals')::int AS grants
        FROM (
          SELECT policyname, NULL::text AS table_name
          FROM pg_policies
          WHERE schemaname = 'public'
          UNION ALL
          SELECT NULL::text, table_name::text
          FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND grantee = 'authenticated'
        ) objects
      `);
      assert.deepEqual(leakedSecurity[0], { policies: 0, grants: 0 });

      const migrationRows = await db.$queryRawUnsafe(`
        SELECT finished_at, rolled_back_at
        FROM public._prisma_migrations
        WHERE migration_name = $1
      `, proposalMigration);
      assert(
        migrationRows.every((row) => row.finished_at === null),
        "Failed Proposal migration must never be recorded as applied.",
      );
      await db.$executeRawUnsafe(`
        DELETE FROM public._prisma_migrations
        WHERE migration_name = $1 AND finished_at IS NULL
      `, proposalMigration);
      const recorded = await db.$queryRawUnsafe(`
        SELECT count(*)::int AS count
        FROM public._prisma_migrations
        WHERE migration_name = $1
      `, proposalMigration);
      assert.equal(recorded[0]?.count, 0);

      if (fixture) {
        assert.equal(await db.profile.count(), fixture.counts.profiles);
        assert.equal(await db.message.count(), fixture.counts.messages);
        assert.equal(
          (await db.profile.findUnique({
            where: { id: fixture.ids.adminId },
            select: { role: true },
          }))?.role,
          "ADMIN",
        );
      }
      console.log(`proposal_migration_failure_rollback_verified mode=${mode} data_loss=0 partial_proposal_objects=0`);
    } finally {
      await db.$disconnect();
    }
  } finally {
    rmSync(base.temporaryRoot, { recursive: true, force: true });
    rmSync(failing.temporaryRoot, { recursive: true, force: true });
    restoreCurrentDatabase();
  }
}

const mode = process.argv[2];
if (mode === "clean") {
  await verifyCleanDatabase();
  await verifyProposalTransactionalRollback("clean");
}
else if (mode === "incremental") {
  await verifyIncrementalUpgrade();
  await verifyProposalTransactionalRollback("incremental");
} else {
  throw new Error("Usage: node scripts/verify-security-migrations.mjs <clean|incremental>");
}
