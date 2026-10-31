// Registry migration proof. No .env, remote URLs or unlabelled containers.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, basename } from "node:path";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableTarget, bindDisposableLoopback } from "./disposable-supabase.mjs";

const root = process.cwd(), target = assertDisposableTarget();
const name = "20261028135224_project_registry_foundation";
const lastB1Migration = "20261030120001_registry_sealing_qualification";
const lastB2aMigration = "20261030174407_registry_draft_review_commands";
const migrationsRoot = join(root, "prisma/migrations");
const migrations = readdirSync(migrationsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const boundary = migrations.indexOf(name);
assert(boundary >= 0, "Registry foundation migration is required");
assert.equal(new Set(migrations.map(migration => migration.split("_")[0])).size, migrations.length, "Duplicate migration timestamp");
const mainPrefix = migrations.slice(0, boundary), registrySuffix = migrations.slice(boundary);
const require = createRequire(import.meta.url), cli = require.resolve("prisma/build/index.js");
const supabase = join(root, "node_modules/supabase/dist/supabase.js");
function run(args) {
  const result = spawnSync(process.execPath, args, { env: process.env, cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, "Migration process failed; credential-bearing output suppressed");
}
async function reset() {
  assertDisposableTarget();
  run([supabase, "db", "reset", "--local", "--no-seed", "--workdir", target.workdir]);
  await bindDisposableLoopback(target.workdir);
}
async function snapshot(db) {
  const tables = await db.$queryRaw`SELECT schemaname,tablename FROM pg_tables
    WHERE schemaname IN ('public','registry_private') AND tablename<>'_prisma_migrations' ORDER BY schemaname,tablename`;
  const data = [];
  for (const { schemaname,tablename } of tables) {
    assert(/^[a-z_]+$/.test(schemaname) && /^[a-z_]+$/.test(tablename));
    const relation = `${schemaname}.${tablename}`;
    // Additive B2-B provenance columns must not change any preexisting bytes.
    // Compare every old column, then assert those new columns stay NULL below.
    const row = relation === "public.project_releases" ? "(to_jsonb(t)-'authorization_id'-'published_by')" : "to_jsonb(t)";
    data.push(...await db.$queryRawUnsafe(`SELECT '${relation}' AS name,count(*)::int AS count,md5(string_agg(${row}::text,E'\n' ORDER BY ${row}::text)) AS digest FROM ${relation} t`));
  }
  return data;
}
async function assertPreservedData(db, before) {
  const names = new Set(before.map(row => row.name));
  assert.deepEqual((await snapshot(db)).filter(row => names.has(row.name)), before);
}
async function seedB1Registry(db) {
  // Data-preservation fixtures only, not authentication evidence. Real Auth
  // issuance/JWT/session/RLS behavior is exercised by the integration suites.
  // All writes use the inspected disposable database, with no other API target.
  await db.$transaction(async tx => {
    const owner = randomUUID(), reviewer = randomUUID(), digest = "a".repeat(64);
    for (const subject of [owner,reviewer]) {
      await tx.$executeRaw`INSERT INTO auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        VALUES(${subject}::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',
          ${`${subject}@example.test`},'{}'::jsonb,'{}'::jsonb,statement_timestamp(),statement_timestamp())`;
      await tx.$executeRaw`INSERT INTO registry_private.internal_operators(subject_id,active,can_create,expires_at)
        VALUES(${subject}::uuid,true,true,statement_timestamp()+interval '1 hour')`;
    }
    const project = await tx.project.create({ data: { slug: `migration-${randomUUID()}`, ownerId: owner } });
    await tx.projectMembership.create({ data: { projectId: project.id, subjectId: reviewer, roles: ["REVIEWER"] } });
    const draft = await tx.projectDraft.create({ data: { projectId: project.id, updatedBy: owner } });
    const asset = await tx.projectAsset.create({ data: { projectId: project.id, sourceDigest: digest, mime: "text/markdown", size: 10,
      dataClass: "CURATED", storageRef: `private/${randomUUID()}`, provenance: {}, rightsRef: "migration-fixture" } });
    await tx.projectAsset.update({ where: { id: asset.id }, data: { state: "VALIDATED", deliveryDigest: digest } });
    await tx.projectAsset.update({ where: { id: asset.id }, data: { state: "APPROVED" } });
    await tx.projectDocumentation.create({ data: { projectId: project.id, draftId: draft.id, title: "preserve draft document",
      language: "en", assetId: asset.id, contentHash: digest } });
    const submitted = await tx.projectDraft.update({ where: { id: draft.id }, data: { state: "IN_REVIEW" } });
    const current = await tx.project.findUniqueOrThrow({ where: { id: project.id } });
    const review = await tx.publicationReview.create({ data: { projectId: project.id, draftId: draft.id, draftRevision: submitted.revision,
      authzEpoch: current.authzEpoch, snapshotHash: digest, visibility: "PRIVATE", assetDigestSet: [], submitterId: owner,
      policyRevision: 1, expiresAt: new Date(Date.now()+3600000) } });
    await tx.publicationReview.update({ where: { id: review.id }, data: { decision: "APPROVED", reviewerId: reviewer, decidedAt: new Date() } });
    const version = await tx.projectVersion.create({ data: { projectId: project.id, version: "1.0.0", snapshot: {}, contentHash: digest, reviewId: review.id } });
    await tx.projectDocumentation.create({ data: { projectId: project.id, versionId: version.id, title: "preserve sealed document",
      language: "en", assetId: asset.id, contentHash: digest } });
    const release = await tx.projectRelease.create({ data: { projectId: project.id, versionId: version.id, contentHash: digest,
      visibilityAtApproval: "PRIVATE", publishedAt: new Date() }, select: { id: true } });
    await tx.project.update({ where: { id: project.id }, data: { currentReleaseId: release.id } });
  });
  console.info("Seeded all eight B1 entities plus qualification/Auth subjects before the B2 upgrade");
}
async function seedB2aProtocol(db) {
  const [fixture] = await db.$queryRaw`SELECT p.id AS project_id,p.owner_id,d.id AS draft_id,d.revision,r.id AS review_id,p.authz_epoch
    FROM public.projects p JOIN public.project_drafts d ON d.project_id=p.id
      JOIN public.publication_reviews r ON r.draft_id=d.id ORDER BY p.id LIMIT 1`;
  assert(fixture, "Preserved B1 fixture required for B2-A upgrade proof");
  await db.$executeRaw`INSERT INTO registry_private.operator_actions(subject_id,action,active,expires_at)
    VALUES(${fixture.owner_id}::uuid,'READ_DRAFT',true,clock_timestamp()+interval '1 hour')`;
  await db.$executeRaw`INSERT INTO registry_private.command_receipts(project_id,actor_id,idempotency_key,action,body_hash,expected_revision,authz_epoch,result)
    VALUES(${fixture.project_id}::uuid,${fixture.owner_id}::uuid,'migration-preserve-b2a','EDIT_DRAFT',${"b".repeat(64)},${fixture.revision},${fixture.authz_epoch},'{"fixture":"preserve-b2a"}'::jsonb)`;
  await db.$executeRaw`INSERT INTO registry_private.review_invalidations(review_id,project_id,actor_id,reason)
    VALUES(${fixture.review_id}::uuid,${fixture.project_id}::uuid,${fixture.owner_id}::uuid,'WITHDRAWN')`;
  console.info("Seeded B2-A action, immutable receipt and review invalidation before B2-B upgrade");
}
async function catalogSnapshot(db) {
  // Preserve existing ACLs, RLS/policies, constraints, types, routines and
  // triggers as well as legacy data when any Registry transaction fails.
  const [result] = await db.$queryRaw`
    SELECT jsonb_agg(c ORDER BY c.kind,c.name,c.definition) AS catalog FROM (
      SELECT 'schema' AS kind,nspname AS name,coalesce(nspacl::text,'') AS definition
        FROM pg_namespace WHERE nspname IN ('public','registry_private')
      UNION ALL
      SELECT 'relation',n.nspname||'.'||c.relname,
        jsonb_build_object('kind',c.relkind,'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity)::text
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','registry_private')
      UNION ALL
      SELECT 'constraint',conrelid::regclass::text||'.'||conname,pg_get_constraintdef(c.oid)||':'||convalidated::text
        FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
        WHERE n.nspname IN ('public','registry_private')
      UNION ALL
      SELECT 'policy',schemaname||'.'||tablename||'.'||policyname,
        jsonb_build_object('roles',roles,'cmd',cmd,'qual',qual,'check',with_check,'permissive',permissive)::text
        FROM pg_policies WHERE schemaname IN ('public','registry_private')
      UNION ALL
      SELECT 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
        pg_get_functiondef(p.oid)||':'||coalesce(p.proacl::text,'')
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','registry_private') AND p.prokind IN ('f','p')
      UNION ALL
      SELECT 'trigger',t.tgrelid::regclass::text||'.'||t.tgname,pg_get_triggerdef(t.oid)
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','registry_private') AND NOT t.tgisinternal
      UNION ALL
      SELECT 'enum',n.nspname||'.'||t.typname,string_agg(e.enumlabel,',' ORDER BY e.enumsortorder)
        FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
        WHERE n.nspname IN ('public','registry_private') GROUP BY n.nspname,t.typname
    ) c`;
  return result.catalog;
}
async function verifyMigrations(db, expected) {
  const applied = await db.$queryRaw`SELECT migration_name,checksum,finished_at,rolled_back_at
    FROM public._prisma_migrations ORDER BY migration_name`;
  assert.deepEqual(applied.map(migration => migration.migration_name), expected);
  for (const migration of applied) {
    assert(migration.finished_at && !migration.rolled_back_at, "Every migration must be applied exactly once");
    assert.equal(migration.checksum, createHash("sha256").update(readFileSync(join(migrationsRoot,migration.migration_name,"migration.sql"))).digest("hex"));
  }
}
const temporary = mkdtempSync(join(tmpdir(), "aig-registry-migrations-"));
try {
  await reset();
  const schema = join(temporary, "prisma/schema.prisma");
  mkdirSync(join(temporary, "prisma"));
  cpSync("prisma/schema.prisma", schema);
  cpSync("prisma/migrations", join(temporary, "prisma/migrations"), { recursive: true,
    filter: source => {
      const entry = relative(migrationsRoot, resolve(source)).split(/[\\/]/)[0];
      return !entry || entry === "migration_lock.toml" || mainPrefix.includes(entry);
    } });
  run([cli, "migrate", "deploy", "--schema", schema]);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const userId = randomUUID();
    await db.profile.create({ data: { id: userId, email: `${userId}@example.test` } });
    const persona = await db.persona.create({ data: { userId, name: "historical", personality: "fixture", systemPrompt: "fixture" } });
    const conversation = await db.conversation.create({ data: { userId, personaId: persona.id, title: "historical" } });
    await db.message.create({ data: { conversationId: conversation.id, role: "USER", content: "preserve historical chat" } });
    await db.toolRun.create({ data: { userId, type: "SUMMARIZE", options: {}, outputText: "historical output" } });
    await db.memory.create({ data: { userId, content: "historical memory", category: "fixture", verificationMethod: "MANUAL_ENTRY", verifiedAt: new Date() } });
    await verifyMigrations(db, mainPrefix);
    const expected = [...mainPrefix];
    let seededB1 = false, seededB2a = false;
    for (const migration of registrySuffix) {
      if (migration > lastB1Migration && !seededB1) {
        await seedB1Registry(db);
        seededB1 = true;
      }
      if (migration > lastB2aMigration && !seededB2a) {
        await seedB2aProtocol(db); seededB2a = true;
      }
      const before = await snapshot(db);
      const beforeCatalog = await catalogSnapshot(db);
      const sql = readFileSync(join(migrationsRoot, migration, "migration.sql"), "utf8");
      assert(/^BEGIN;/m.test(sql) && /COMMIT;\s*$/.test(sql), "Registry migrations must be explicitly transactional");
      const failed = spawnSync("docker", ["exec", "-i", `supabase_db_${target.project}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
        input: sql.replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;\n"), encoding: "utf8", windowsHide: true,
      });
      assert.notEqual(failed.status, 0); assert(failed.stderr.includes("division by zero"));
      assert.deepEqual(await catalogSnapshot(db), beforeCatalog, "Failed Registry migration changed schema or permissions");
      await assertPreservedData(db, before);
      await verifyMigrations(db, expected);
      cpSync(join(migrationsRoot,migration), join(temporary,"prisma/migrations",migration), { recursive: true });
      run([cli, "migrate", "deploy", "--schema", schema]);
      expected.push(migration);
      await verifyMigrations(db, expected);
      await assertPreservedData(db, before);
      if (migration > lastB2aMigration) {
        const [legacy] = await db.$queryRaw`SELECT count(*)::int AS count FROM public.project_releases
          WHERE authorization_id IS NOT NULL OR published_by IS NOT NULL`;
        assert.equal(legacy.count,0,"B2-B must not fabricate fresh authorization for legacy Release rows");
      }
      console.info(`Registry incremental + injected transaction rollback passed: ${migration}`);
      console.info(`Preserved prefix data snapshot: ${createHash("sha256").update(JSON.stringify(before)).digest("hex")}`);
    }
  } finally { await db.$disconnect(); }
  await reset();
  run([cli, "migrate", "deploy"]); run([cli, "migrate", "deploy"]);
  const clean = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const [row] = await clean.$queryRaw`SELECT count(*)::int AS count FROM pg_class WHERE relnamespace='public'::regnamespace
      AND relname IN ('projects','project_drafts','project_versions','project_releases','project_assets','project_documentation','project_memberships','publication_reviews') AND relrowsecurity`;
    assert.equal(row.count, 8);
    const [privateTables] = await clean.$queryRaw`SELECT count(*)::int AS count FROM pg_class
      WHERE relnamespace='registry_private'::regnamespace
        AND relname IN ('operator_actions','command_receipts','review_invalidations','release_requests','release_approvals','release_withdrawals','release_receipts') AND relrowsecurity
        AND NOT has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE')
        AND NOT has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE')
        AND NOT has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE')`;
    assert.equal(privateTables.count, 7, "Private command tables must have RLS and no client privileges");
    const [seedless] = await clean.$queryRaw`SELECT
      (SELECT count(*) FROM registry_private.operator_actions)+
      (SELECT count(*) FROM registry_private.command_receipts)+
      (SELECT count(*) FROM registry_private.review_invalidations)+
      (SELECT count(*) FROM registry_private.release_requests)+
      (SELECT count(*) FROM registry_private.release_approvals)+
      (SELECT count(*) FROM registry_private.release_withdrawals)+
      (SELECT count(*) FROM registry_private.release_receipts) AS count`;
    assert.equal(seedless.count, 0n, "Command tables must not provision privileges or records on install");
    await verifyMigrations(clean, migrations);
    console.info(`Registry clean install + repeat deploy + eight RLS tables + all ${migrations.length} migration checksums passed`);
  } finally { await clean.$disconnect(); }
} finally {
  const path = resolve(temporary), parent = resolve(tmpdir());
  assert(relative(parent,path) && !relative(parent,path).startsWith("..") && basename(path).startsWith("aig-registry-migrations-"));
  rmSync(path, { recursive: true, force: true });
}
