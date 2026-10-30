// Targeted B1 migration proof. No .env, remote URLs or unlabelled containers.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, basename } from "node:path";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableTarget, bindDisposableLoopback } from "./disposable-supabase.mjs";

const root = process.cwd(), target = assertDisposableTarget();
const name = "20261028135224_project_registry_foundation";
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
const temporary = mkdtempSync(join(tmpdir(), "aig-registry-migrations-"));
try {
  await reset();
  const schema = join(temporary, "prisma/schema.prisma");
  mkdirSync(join(temporary, "prisma"));
  cpSync("prisma/schema.prisma", schema);
  cpSync("prisma/migrations", join(temporary, "prisma/migrations"), { recursive: true,
    filter: source => !source.includes(name) });
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
    const sql = readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8");
    assert(/^BEGIN;/m.test(sql) && /COMMIT;\s*$/.test(sql));
    const failed = spawnSync("docker", ["exec", "-i", `supabase_db_${target.project}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
      input: sql.replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;\n"), encoding: "utf8", windowsHide: true,
    });
    assert.notEqual(failed.status, 0); assert(failed.stderr.includes("division by zero"));
    const [rolledBack] = await db.$queryRaw`SELECT to_regclass('public.projects') IS NULL AND to_regnamespace('registry_private') IS NULL AS absent`;
    assert(rolledBack.absent); assert.deepEqual(await snapshot(db), before);
    run([cli, "migrate", "deploy"]);
    assert.deepEqual(await snapshot(db), before);
    console.info(`Registry incremental + injected transaction rollback passed; legacy snapshot=${createHash("sha256").update(JSON.stringify(before)).digest("hex")}`);
  } finally { await db.$disconnect(); }
  await reset();
  run([cli, "migrate", "deploy"]); run([cli, "migrate", "deploy"]);
  const clean = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const [row] = await clean.$queryRaw`SELECT count(*)::int AS count FROM pg_class WHERE relnamespace='public'::regnamespace
      AND relname IN ('projects','project_drafts','project_versions','project_releases','project_assets','project_documentation','project_memberships','publication_reviews') AND relrowsecurity`;
    assert.equal(row.count, 8);
    const [migration] = await clean.$queryRaw`SELECT checksum,finished_at FROM public._prisma_migrations WHERE migration_name=${name}`;
    assert(migration.finished_at); assert.equal(migration.checksum, createHash("sha256").update(readFileSync(join("prisma/migrations",name,"migration.sql"))).digest("hex"));
    console.info("Registry clean install + repeat deploy + eight RLS tables + checksum passed");
  } finally { await clean.$disconnect(); }
} finally {
  const path = resolve(temporary), parent = resolve(tmpdir());
  assert(relative(parent,path) && !relative(parent,path).startsWith("..") && basename(path).startsWith("aig-registry-migrations-"));
  rmSync(path, { recursive: true, force: true });
}
