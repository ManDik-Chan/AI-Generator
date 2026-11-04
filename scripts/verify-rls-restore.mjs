/*
 * Disposable-only proof that a Supabase logical backup taken after all Prisma migrations can be
 * restored onto a fresh instance and, after prisma/rls.sql, has the same security-relevant catalog
 * as a clean `prisma migrate deploy`.
 *
 * 1. reset the guarded disposable stack, `prisma migrate deploy`, insert synthetic accounts
 *    (one platform OWNER) and record catalog + data snapshot A;
 * 2. `supabase db dump` roles / schema / data (the production backup runbook's exact flags) into a
 *    temporary directory outside the repository;
 * 3. reset again and restore with `psql --single-transaction` in Supabase's documented order;
 * 4. record snapshot B0 (restore only), apply prisma/rls.sql, record B1, apply it again, record B2;
 * 5. require A = B1 except the known semantic-equivalent text variants below, B1 = B2 exactly, the
 *    platform OWNER triggers to reject a ban/role change, and no pending Prisma migration.
 *
 * It destroys and recreates the disposable database twice and leaves it in the restored state.
 * Usage: node scripts/run-local-security-stage.mjs rls-restore <isolated-workdir>
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertDisposableTarget, bindDisposableLoopback } from "./disposable-supabase.mjs";
import { SNAPSHOT_SQL, countFacts, normalizeSql } from "./verify-rls-baseline.mjs";

const require = createRequire(import.meta.url);
const APP = "('public','registry_private')";

/** Structure and data facts that a restore must also reproduce (not changed by rls.sql). */
export const STRUCTURE_SQL = `
select line from (
  select 'schema '||n.nspname||' owner='||pg_get_userbyid(n.nspowner) as line from pg_namespace n where n.nspname in ${APP}
  union all
  select 'relation '||n.nspname||'.'||c.relname||' kind='||c.relkind::text||' owner='||pg_get_userbyid(c.relowner)||' options='||coalesce(array_to_string(c.reloptions,','),'-')
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${APP} and c.relkind in ('r','p','v','m','S','f')
  union all
  select 'column '||n.nspname||'.'||c.relname||'.'||a.attname||' type='||format_type(a.atttypid,a.atttypmod)||' notnull='||a.attnotnull
      ||' default-md5='||coalesce(md5(pg_get_expr(d.adbin,d.adrelid)),'-')
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where n.nspname in ${APP} and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
  union all
  select 'constraint '||n.nspname||'.'||c.relname||'.'||k.conname||' type='||k.contype::text||' validated='||k.convalidated
      ||' definition-b64='||translate(encode(convert_to(pg_get_constraintdef(k.oid),'UTF8'),'base64'),E'\\n','')
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${APP}
  union all
  select 'index '||n.nspname||'.'||i.relname||' definition-md5='||md5(pg_get_indexdef(i.oid))
    from pg_index x join pg_class i on i.oid=x.indexrelid join pg_namespace n on n.oid=i.relnamespace where n.nspname in ${APP}
  union all
  select 'function-owner '||p.oid::regprocedure::text||' owner='||pg_get_userbyid(p.proowner)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ${APP}
  union all
  select 'type '||n.nspname||'.'||t.typname||' kind='||t.typtype::text||' labels='||coalesce((select string_agg(e.enumlabel,',' order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid),'-')
    from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ${APP} and t.typtype in ('e','d')
  union all
  select 'default-acl '||pg_get_userbyid(d.defaclrole)||' '||coalesce(d.defaclnamespace::regnamespace::text,'-')||' '||d.defaclobjtype::text||' '||coalesce(d.defaclacl::text,'-')
    from pg_default_acl d
  union all
  select 'extension '||e.extname||' schema='||e.extnamespace::regnamespace::text||' version='||e.extversion from pg_extension e
) facts order by line;
select format($q$select 'data %s.%s rows='||count(*)||' md5='||coalesce(md5(string_agg(t::text, E'\\n' order by t::text)),'-') from %I.%I t$q$,
    n.nspname, c.relname, n.nspname, c.relname)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and (n.nspname in ${APP} or (n.nspname='storage' and c.relname in ('buckets','objects'))
    or (n.nspname='auth' and c.relname in ('users','identities')))
  order by 1 \\gexec`;

/**
 * Text that PostgreSQL stores differently after a dump/restore or after prisma/rls.sql recreates a
 * function, but that is the same SQL. Each entry is limited to one named object; any other
 * difference fails.
 *  - `sql`: rls.sql writes `begin … new.id` where the migration wrote `BEGIN … NEW."id"`
 *    (keyword case, quoted lowercase identifiers, whitespace — see normalizeSql).
 *  - `pinned`: pg_dump emits these CHECK constraints in deparsed form, and PostgreSQL deparses the
 *    re-parsed expression differently. Only the exact migrated -> restored pair is accepted:
 *    `a BETWEEN 0 AND b` expands to `(a >= 0) AND (a <= b)` and one redundant AND grouping is
 *    flattened; `language IN ('zh','en')` on a varchar column moves the `::text` cast from the
 *    array to each element. A change to either constraint fails until it is reviewed here.
 */
export const KNOWN_VARIANTS = new Map([
  ["function handle_new_auth_user()", { rule: "sql" }],
  ["function protect_profile_system_fields()", { rule: "sql" }],
  ["constraint public.agent_runs.agent_runs_counters_check", {
    rule: "pinned",
    migrated: `CHECK ((((completed_worker_count >= 0) AND (completed_worker_count <= planned_worker_count)) AND ((successful_worker_count >= 0) AND (successful_worker_count <= completed_worker_count)) AND (provider_call_count >= 0) AND (((mode = 'STANDARD'::"AgentRunMode") AND (provider_call_count <= 6)) OR ((mode = 'DEEP'::"AgentRunMode") AND (provider_call_count <= 8)))))`,
    restored: `CHECK (((completed_worker_count >= 0) AND (completed_worker_count <= planned_worker_count) AND ((successful_worker_count >= 0) AND (successful_worker_count <= completed_worker_count)) AND (provider_call_count >= 0) AND (((mode = 'STANDARD'::"AgentRunMode") AND (provider_call_count <= 6)) OR ((mode = 'DEEP'::"AgentRunMode") AND (provider_call_count <= 8)))))`,
  }],
  ["constraint public.project_documentation.project_documentation_shape", {
    rule: "pinned",
    migrated: `CHECK ((((draft_id IS NULL) <> (version_id IS NULL)) AND ((language)::text = ANY ((ARRAY['zh'::character varying, 'en'::character varying])::text[])) AND (length(TRIM(BOTH FROM title)) > 0) AND ((content_hash)::text ~ '^[a-f0-9]{64}$'::text)))`,
    restored: `CHECK ((((draft_id IS NULL) <> (version_id IS NULL)) AND ((language)::text = ANY (ARRAY[('zh'::character varying)::text, ('en'::character varying)::text])) AND (length(TRIM(BOTH FROM title)) > 0) AND ((content_hash)::text ~ '^[a-f0-9]{64}$'::text)))`,
  }],
]);

/** Whether `actual` is an accepted equivalent of `expected` for the named object. */
export function isKnownVariant(identity, expected, actual) {
  const variant = KNOWN_VARIANTS.get(identity);
  if (variant?.rule === "sql") return normalizeSql(expected) === normalizeSql(actual);
  if (variant?.rule === "pinned") return expected === variant.migrated && actual === variant.restored;
  return false;
}

/**
 * Splits snapshot output into definition facts (`function <signature>` and
 * `constraint <schema.table.name> <attributes>`, keyed by identity, with decoded source) and plain facts.
 */
export function parseSnapshot(output) {
  const definitions = new Map(), facts = new Set();
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^((function|constraint) .*) definition-b64=(\S*)$/.exec(line);
    if (!match) { facts.add(line); continue; }
    const [identity, attributes] = match[2] === "function" ? [match[1], ""]
      : [match[1].split(" ").slice(0, 2).join(" "), match[1].split(" ").slice(2).join(" ")];
    assert(!definitions.has(identity), `Duplicate catalog identity ${identity}`);
    definitions.set(identity, { attributes, source: Buffer.from(match[3], "base64").toString("utf8") });
  }
  return { definitions, facts };
}

const describe = (identity, entry) => `${identity} ${entry.attributes} source-sha256=${createHash("sha256").update(entry.source).digest("hex")}`;

/** Compares an expected (migrated) and an actual (restored) snapshot. */
export function compareRestore(expected, actual, { allowVariants = true } = {}) {
  const differences = [], variants = [];
  for (const fact of expected.facts) if (!actual.facts.has(fact)) differences.push(`- ${fact}`);
  for (const fact of actual.facts) if (!expected.facts.has(fact)) differences.push(`+ ${fact}`);
  for (const [identity, want] of expected.definitions) {
    const got = actual.definitions.get(identity);
    if (!got) { differences.push(`- ${describe(identity, want)}`); continue; }
    if (got.attributes === want.attributes && got.source === want.source) continue;
    if (allowVariants && got.attributes === want.attributes && isKnownVariant(identity, want.source, got.source)) {
      variants.push(`${identity} (${KNOWN_VARIANTS.get(identity).rule})`);
    }
    else differences.push(`~ ${identity} expected ${want.attributes} ${JSON.stringify(want.source)} actual ${got.attributes} ${JSON.stringify(got.source)}`);
  }
  for (const [identity, got] of actual.definitions) if (!expected.definitions.has(identity)) differences.push(`+ ${describe(identity, got)}`);
  return { differences: differences.sort(), variants: variants.sort() };
}

function run(command, args, label, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    // Disposable synthetic database only; still print only the tail, never the environment.
    const tail = `${result.stderr ?? ""}`.trim().split(/\r?\n/).slice(-15).join("\n");
    throw new Error(`${label} failed (exit ${result.status ?? result.error?.message}).${tail ? `\n${tail}` : ""}`);
  }
  return result.stdout ?? "";
}

export async function main() {
  const target = assertDisposableTarget(process.env);
  const container = `supabase_db_${target.project}`;
  const cli = join(process.cwd(), "node_modules/supabase/dist/supabase.js");
  const prisma = require.resolve("prisma/build/index.js");
  const baseline = readFileSync(resolve("prisma/rls.sql"), "utf8");
  const psql = (input, label, args = []) => {
    assertDisposableTarget(process.env);
    return run("docker", ["exec", "-i", container, "psql", "-q", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", ...args], label, { input });
  };
  const reset = async () => {
    assertDisposableTarget(process.env);
    run(process.execPath, [cli, "db", "reset", "--local", "--no-seed", "--workdir", target.workdir], "Disposable database reset");
    await bindDisposableLoopback(target.workdir);
    assertDisposableTarget(process.env);
  };
  const snapshot = () => parseSnapshot(psql(`\\pset format unaligned\n\\pset tuples_only on\n${SNAPSHOT_SQL}\n${STRUCTURE_SQL}\n`, "Catalog snapshot", ["-A", "-t"]));
  const applyBaseline = () => psql(baseline, "prisma/rls.sql", ["--single-transaction"]);
  const owner = "00000000-0000-4000-8000-00000000a001", member = "00000000-0000-4000-8000-00000000a002";
  // Both statements must fail with 42501; anything else (including success) aborts psql.
  const probeOwnerProtection = (label) => psql(`
do $$ begin
  update auth.users set banned_until = now() + interval '1 day' where id = '${owner}';
  raise exception 'auth.users OWNER ban was not rejected';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.profiles set role = 'USER' where id = '${owner}';
  raise exception 'profiles OWNER demotion was not rejected';
exception when insufficient_privilege then null; end $$;`, label);

  const scratch = mkdtempSync(join(tmpdir(), "aig-rls-restore-"));
  const inContainer = `/tmp/${scratch.split(/[\\/]/).pop()}`;
  try {
    await reset();
    run(process.execPath, [prisma, "migrate", "deploy"], "prisma migrate deploy", { env: process.env });
    psql(`
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '${owner}', 'authenticated', 'authenticated', 'owner@restore.test', '', '{}', '{"display_name":"Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '${member}', 'authenticated', 'authenticated', 'member@restore.test', '', '{}', '{}', now(), now());
update public.profiles set role = 'OWNER' where id = '${owner}';`, "Synthetic accounts");
    probeOwnerProtection("OWNER protection on the migrated database");
    const migrated = snapshot();

    const files = { roles: join(scratch, "roles.sql"), schema: join(scratch, "schema.sql"), data: join(scratch, "data.sql") };
    const dump = (file, flags) => run(process.execPath, [cli, "db", "dump", "--db-url", process.env.TEST_DATABASE_URL, "-f", file, ...flags], `supabase db dump ${flags.join(" ") || "(schema)"}`);
    dump(files.roles, ["--role-only"]);
    dump(files.schema, []);
    dump(files.data, ["--use-copy", "--data-only", "-x", "storage.buckets_vectors", "-x", "storage.vector_indexes"]);

    await reset();
    run("docker", ["cp", scratch, `${container}:${inContainer}`], "Copy dump into the disposable database container");
    psql("", "Restore (psql --single-transaction)", ["--single-transaction",
      "-f", `${inContainer}/roles.sql`, "-f", `${inContainer}/schema.sql`,
      "-c", "SET session_replication_role = replica", "-f", `${inContainer}/data.sql`]);
    const restoredOnly = snapshot();
    applyBaseline();
    const restored = snapshot();
    applyBaseline();
    const reapplied = snapshot();
    let ownerProtected = true;
    try { probeOwnerProtection("OWNER protection on the restored database"); } catch (error) { ownerProtected = false; console.error(error.message); }
    const pending = run(process.execPath, [prisma, "migrate", "status"], "prisma migrate status", { env: process.env });
    assert.match(pending, /Database schema is up to date/, "The restored database must have no pending Prisma migration.");

    const gap = compareRestore(migrated, restoredOnly, { allowVariants: false });
    const parity = compareRestore(migrated, restored);
    const idempotent = compareRestore(restored, reapplied, { allowVariants: false });
    const securityFacts = [...migrated.facts].filter((line) => !/^(schema|relation|column|index|function-owner|type|default-acl|extension|data) /.test(line))
      .concat([...migrated.definitions.keys()].filter((key) => key.startsWith("function ")));
    const summary = {
      project: target.project,
      migratedFacts: migrated.facts.size + migrated.definitions.size,
      securityCatalog: countFacts(securityFacts),
      dataTables: [...migrated.facts].filter((line) => line.startsWith("data ")).length,
      restoreWithoutBaseline: { differences: gap.differences.length, sample: gap.differences.slice(0, 12) },
      restoreWithBaseline: { differences: parity.differences.length, knownEquivalentVariants: parity.variants },
      secondBaselineApplication: { differences: idempotent.differences.length },
      restoredOwnerProtection: ownerProtected,
    };
    mkdirSync(resolve("test-results"), { recursive: true });
    writeFileSync(resolve("test-results/rls-restore-summary.json"), JSON.stringify({
      ...summary, restoreWithoutBaseline: { differences: gap.differences }, restoreWithBaseline: { ...summary.restoreWithBaseline, details: parity.differences },
    }, null, 2) + "\n");
    if (parity.differences.length || idempotent.differences.length || !ownerProtected) {
      console.error([...parity.differences.map((line) => `restore ${line}`), ...idempotent.differences.map((line) => `reapply ${line}`)].slice(0, 120).join("\n"));
      throw new Error(`Restored catalog differs from the migrated catalog in ${parity.differences.length} facts (${idempotent.differences.length} after a second baseline application); restored OWNER protection ${ownerProtected ? "holds" : "FAILED"}.`);
    }
    console.info("Verified dump -> reset -> restore -> prisma/rls.sql reproduces the migrated catalog", summary);
  } finally {
    spawnSync("docker", ["exec", container, "rm", "-rf", inContainer], { windowsHide: true });
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
