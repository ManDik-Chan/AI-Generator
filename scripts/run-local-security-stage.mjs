// Disposable local stack only. Never loads application .env or resets a database.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const root = process.cwd();
const mode = process.argv[2];
if (!["migrate", "registry", "registry-migrations", "integration", "all-real", "metadata", "cleanup", "migrations-clean", "migrations-incremental", "migrations-rollback-all"].includes(mode) || !process.argv[3]) {
  throw new Error("Usage: node scripts/run-local-security-stage.mjs <migrate|integration|all-real|metadata|cleanup> <isolated-workdir>");
}
const isolated = realpathSync(resolve(process.argv[3]));
const config = readFileSync(join(isolated, "supabase/config.toml"), "utf8");
const project = config.match(/^project_id\s*=\s*"(aig-platform-p1-[a-z0-9-]+)"/m)?.[1];
if (!project) throw new Error("An explicit aig-platform-p1-* disposable project is required.");
const ports = {};
for (const [kind, port] of [["db", "5432/tcp"], ["kong", "8000/tcp"]]) {
  const name = `supabase_${kind}_${project}`;
  const container = JSON.parse(execFileSync("docker", ["inspect", name], { encoding: "utf8" }))[0];
  const bindings = container.HostConfig.PortBindings?.[port];
  if (container.Config.Labels?.["com.supabase.cli.project"] !== project || !container.State.Running
    || !bindings?.length || bindings.some((binding) => binding.HostIp !== "127.0.0.1")) {
    throw new Error("Refusing a stopped, unowned or non-loopback test container.");
  }
  ports[kind] = bindings[0].HostPort;
}
const cli = join(root, "node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "--workdir", isolated, "-o", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
}));
if (new URL(status.DB_URL).hostname !== "127.0.0.1" || new URL(status.DB_URL).port !== ports.db
  || new URL(status.API_URL).hostname !== "127.0.0.1" || new URL(status.API_URL).port !== ports.kong
  || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error("CLI status must match the inspected local containers.");
const env = { ...process.env,
  SUPABASE_TEST_WORKDIR: isolated, ALLOW_TEST_DATABASE_RESET: "true",
  AI_TOOL_ASSET_BUCKET: "p1-tool-assets", AI_TOOL_ASSET_LEGACY_BUCKET: "p1-tool-assets", SUPABASE_GENERATED_IMAGE_BUCKET: "p1-generated-images", SUPABASE_PERSONA_AVATAR_BUCKET: "p1-persona-avatars",
  DATABASE_URL: status.DB_URL, DIRECT_URL: status.DB_URL, TEST_DATABASE_URL: status.DB_URL,
  ALLOW_TEST_DATABASE_MUTATIONS: "true", TEST_DATABASE_CONFIRMED_NON_PRODUCTION: "true", REQUIRE_SECURITY_TEST_DATABASE: "true",
  SUPABASE_TEST_URL: status.API_URL, SUPABASE_TEST_ANON_KEY: status.ANON_KEY, SUPABASE_TEST_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
};
mkdirSync(resolve("test-results"), { recursive: true });
if (mode === "metadata") {
  const db = new PrismaClient({ datasourceUrl: status.DB_URL });
  try {
    const migrations = await db.$queryRaw`SELECT migration_name, checksum, finished_at IS NOT NULL AS applied FROM public._prisma_migrations ORDER BY migration_name`;
    for (const migration of migrations) {
      migration.localChecksumMatches = migration.checksum === createHash("sha256").update(readFileSync(join(root, "prisma/migrations", migration.migration_name, "migration.sql"))).digest("hex");
      if (!migration.applied || !migration.localChecksumMatches) throw new Error("Migration metadata/checksum mismatch.");
    }
    const accounts = await db.$queryRaw`SELECT count(*)::int AS count FROM auth.users`;
    const cleanup = await db.$queryRaw`SELECT state,count(*)::int AS count FROM public.asset_deletions GROUP BY state ORDER BY state`;
    const storage = await db.$queryRaw`SELECT b.id,b.public,count(o.id)::int AS objects FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id=b.id WHERE b.id LIKE 'p1-%' GROUP BY b.id,b.public ORDER BY b.id`;
    const boundary = await db.$queryRaw`SELECT (SELECT relrowsecurity FROM pg_class WHERE oid='public.asset_deletions'::regclass) AS cleanup_rls, has_table_privilege('authenticated','public.asset_deletions','SELECT') AS authenticated_select, has_table_privilege('authenticated','public.asset_deletions','INSERT') AS authenticated_insert, has_table_privilege('authenticated','public.asset_deletions','UPDATE') AS authenticated_update, has_table_privilege('authenticated','public.asset_deletions','DELETE') AS authenticated_delete, (SELECT convalidated FROM pg_constraint WHERE conname='tool_assets_run_owner_fkey') AS composite_owner_validated`;
    writeFileSync("test-results/local-stage-metadata.json", JSON.stringify({ project, migrations, remainingSyntheticAccounts: accounts[0].count, cleanup, storage, boundary }, null, 2) + "\n");
    console.info(`Local metadata: ${migrations.length} migrations; ${accounts[0].count} remaining synthetic accounts.`);
  } finally { await db.$disconnect(); }
} else {
  const args = mode === "migrate" ? [require.resolve("prisma/build/index.js"), "migrate", "deploy"]
    : mode === "registry-migrations" ? ["scripts/verify-registry-migrations.mjs"]
    : mode === "registry" ? [join(dirname(require.resolve("vitest/package.json")), "vitest.mjs"), "run", "tests/integration/registry.integration.test.ts", "--reporter=default"]
    : mode.startsWith("migrations-") ? ["scripts/verify-security-migrations.mjs",mode.slice("migrations-".length)]
    : mode === "integration" ? ["scripts/run-security-integration.mjs"]
    : mode === "cleanup" ? ["--conditions=react-server", "--import", "tsx", "scripts/cleanup-tool-assets.ts"]
      : [join(dirname(require.resolve("vitest/package.json")), "vitest.mjs"), "run", "--no-file-parallelism", "--reporter=json", "--outputFile=test-results/local-stage-all-real.json"];
  const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(`test-results/local-stage-${mode}.log`, (result.stdout ?? "") + (result.stderr ?? ""));
  console.info(`Local ${mode}: exit ${result.status ?? "process error"}; raw output retained in ignored test-results.`);
  process.exitCode = result.status ?? 1;
}
