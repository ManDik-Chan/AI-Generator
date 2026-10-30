// Targeted B1 migration proof. No .env, remote URLs or unlabelled containers.
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
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations'
    AND tablename NOT IN ('projects','project_drafts','project_versions','project_releases','project_assets','project_documentation','project_memberships','publication_reviews') ORDER BY tablename`;
  const data = [];
  for (const { tablename } of tables) {
    assert(/^[a-z_]+$/.test(tablename));
    data.push(...await db.$queryRawUnsafe(`SELECT '${tablename}' AS name,count(*)::int AS count,md5(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text)) AS digest FROM public.${tablename} t`));
  }
  return data;
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
    const before = await snapshot(db);
    await verifyMigrations(db, mainPrefix);
    const expected = [...mainPrefix];
    for (const migration of registrySuffix) {
      const beforeCatalog = await catalogSnapshot(db);
      const sql = readFileSync(join(migrationsRoot, migration, "migration.sql"), "utf8");
      assert(/^BEGIN;/m.test(sql) && /COMMIT;\s*$/.test(sql), "Registry migrations must be explicitly transactional");
      const failed = spawnSync("docker", ["exec", "-i", `supabase_db_${target.project}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
        input: sql.replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;\n"), encoding: "utf8", windowsHide: true,
      });
      assert.notEqual(failed.status, 0); assert(failed.stderr.includes("division by zero"));
      assert.deepEqual(await catalogSnapshot(db), beforeCatalog, "Failed Registry migration changed schema or permissions");
      assert.deepEqual(await snapshot(db), before);
      await verifyMigrations(db, expected);
      cpSync(join(migrationsRoot,migration), join(temporary,"prisma/migrations",migration), { recursive: true });
      run([cli, "migrate", "deploy", "--schema", schema]);
      expected.push(migration);
      await verifyMigrations(db, expected);
      assert.deepEqual(await snapshot(db), before);
      console.info(`Registry incremental + injected transaction rollback passed: ${migration}`);
    }
    console.info(`Legacy snapshot unchanged: ${createHash("sha256").update(JSON.stringify(before)).digest("hex")}`);
  } finally { await db.$disconnect(); }
  await reset();
  run([cli, "migrate", "deploy"]); run([cli, "migrate", "deploy"]);
  const clean = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const [row] = await clean.$queryRaw`SELECT count(*)::int AS count FROM pg_class WHERE relnamespace='public'::regnamespace
      AND relname IN ('projects','project_drafts','project_versions','project_releases','project_assets','project_documentation','project_memberships','publication_reviews') AND relrowsecurity`;
    assert.equal(row.count, 8);
    await verifyMigrations(clean, migrations);
    console.info(`Registry clean install + repeat deploy + eight RLS tables + all ${migrations.length} migration checksums passed`);
  } finally { await clean.$disconnect(); }
} finally {
  const path = resolve(temporary), parent = resolve(tmpdir());
  assert(relative(parent,path) && !relative(parent,path).startsWith("..") && basename(path).startsWith("aig-registry-migrations-"));
  rmSync(path, { recursive: true, force: true });
}
