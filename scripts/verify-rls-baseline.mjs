/*
 * Verifies that prisma/rls.sql — the repeatable disaster-recovery baseline — leaves a database
 * migrated by the versioned Prisma migrations exactly as it found it, and is idempotent.
 *
 * Inside one transaction on the guarded disposable database it records a catalog snapshot, applies
 * the baseline twice, records the snapshot after each application, and then rolls back. Nothing is
 * committed, so later acceptance steps see the untouched migrated database. Any difference in RLS
 * flags, policies, table/column/function privileges, function definitions or triggers fails.
 *
 * Usage (after `prisma migrate deploy` on the disposable target):
 *   node scripts/verify-rls-baseline.mjs
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertDisposableTarget } from "./disposable-supabase.mjs";

const grantee = (column) => `case when ${column}=0 then 'PUBLIC' else pg_get_userbyid(${column}) end`;

/** One sorted line per security-relevant catalog fact in public (and the auth.users trigger). */
export const SNAPSHOT_SQL = `
select line from (
  select 'rls '||n.nspname||'.'||c.relname||' enabled='||c.relrowsecurity||' forced='||c.relforcerowsecurity as line
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')
  union all
  select 'policy '||schemaname||'.'||tablename||' '||policyname||' '||permissive||' '||array_to_string(roles,',')||' '||cmd
      ||' using='||coalesce(qual,'-')||' check='||coalesce(with_check,'-')
    from pg_policies where schemaname='public'
  union all
  select 'table-acl '||n.nspname||'.'||c.relname||' '||${grantee("a.grantee")}||' '||a.privilege_type||' grantable='||a.is_grantable
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname='public' and c.relkind in ('r','p','v','m')
  union all
  select 'column-acl '||n.nspname||'.'||c.relname||'.'||t.attname||' '||${grantee("a.grantee")}||' '||a.privilege_type||' grantable='||a.is_grantable
    from pg_attribute t join pg_class c on c.oid=t.attrelid join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(t.attacl) a
    where n.nspname='public' and t.attnum>0 and not t.attisdropped and t.attacl is not null
  union all
  select 'function '||p.oid::regprocedure::text||' definition-b64='||translate(encode(convert_to(pg_get_functiondef(p.oid),'UTF8'),'base64'),E'\\n','')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
  union all
  select 'function-acl '||p.oid::regprocedure::text||' '||${grantee("a.grantee")}||' '||a.privilege_type
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname='public' and p.prokind='f'
  union all
  select 'trigger '||n.nspname||'.'||c.relname||' '||t.tgname||' enabled='||t.tgenabled::text||' definition-md5='||md5(pg_get_triggerdef(t.oid))
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and c.relname='users'))
) facts order by line;`;

export function buildScript(baseline) {
  if (/^\s*(begin|commit|rollback|end)\s*;/im.test(baseline.replace(/\$\$[\s\S]*?\$\$/g, ""))) {
    throw new Error("The baseline must not contain its own transaction control; it is applied inside a rolled-back transaction.");
  }
  return [
    "\\set ON_ERROR_STOP 1", "\\pset format unaligned", "\\pset tuples_only on",
    "begin;", "\\echo ==before", SNAPSHOT_SQL,
    baseline, "\\echo ==after-1", SNAPSHOT_SQL,
    baseline, "\\echo ==after-2", SNAPSHOT_SQL,
    "rollback;", "\\echo ==rolled-back",
  ].join("\n");
}

/**
 * Function source is stored as written, so the migrations' `NEW."id"` / `BEGIN` and the baseline's
 * `new.id` / `begin` differ as text but not as SQL. This applies only PostgreSQL's own rules:
 * keywords and unquoted identifiers are case-insensitive, a quoted all-lowercase identifier equals
 * the unquoted one, and whitespace between tokens is insignificant. String literals, quoted
 * identifiers containing other characters, comments and every other token are kept, so any other
 * change still counts as a difference.
 */
export function normalizeSql(source) {
  let out = "", index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "'") {
      let end = index + 1;
      while (end < source.length && !(source[end] === "'" && source[end + 1] !== "'")) end += source[end] === "'" ? 2 : 1;
      out += source.slice(index, end + 1);
      index = end + 1;
    } else if (char === '"') {
      const end = source.indexOf('"', index + 1);
      const name = source.slice(index + 1, end < 0 ? source.length : end);
      out += /^[a-z_][a-z0-9_$]*$/.test(name) ? name : `"${name}"`;
      index = end < 0 ? source.length : end + 1;
    } else if (/\s/.test(char)) {
      while (index < source.length && /\s/.test(source[index])) index++;
      out += " ";
    } else {
      out += char.toLowerCase();
      index++;
    }
  }
  return out.trim();
}

const digest = (text) => createHash("sha256").update(text).digest("hex");

/** Replaces each function's raw definition with the digest of its normalized source. */
function canonicalLine(line, lexical) {
  const match = /^(function \S+) definition-b64=(\S*)$/.exec(line);
  if (!match) return line;
  const raw = Buffer.from(match[2], "base64").toString("utf8");
  lexical.set(match[1], digest(raw));
  return `${match[1]} definition-sha256=${digest(normalizeSql(raw))}`;
}

export function compareSnapshots(output) {
  const sections = {};
  let current = null;
  for (const line of output.split(/\r?\n/)) {
    const marker = /^==(before|after-1|after-2|rolled-back)$/.exec(line);
    if (marker) { current = marker[1]; sections[current] = []; continue; }
    if (current && line.trim()) sections[current].push(line);
  }
  if (!sections["rolled-back"]) throw new Error("The verification transaction did not reach its rollback.");
  const raw = { before: new Map(), "after-1": new Map(), "after-2": new Map() };
  const before = (sections.before ?? []).map((line) => canonicalLine(line, raw.before));
  if (!before.some((line) => line.startsWith("policy ")) || !before.some((line) => line.startsWith("rls public."))) {
    throw new Error("Snapshot is empty or incomplete; refusing to accept an unverified baseline.");
  }
  const differences = [];
  for (const stage of ["after-1", "after-2"]) {
    const afterLines = (sections[stage] ?? []).map((line) => canonicalLine(line, raw[stage]));
    const after = new Set(afterLines), base = new Set(before);
    for (const line of before) if (!after.has(line)) differences.push(`${stage} - ${line}`);
    for (const line of afterLines) if (!base.has(line)) differences.push(`${stage} + ${line}`);
  }
  const lexicalOnly = [...raw.before].filter(([name, hash]) => raw["after-1"].get(name) !== hash).map(([name]) => name.replace(/^function /, ""));
  const count = (prefix) => before.filter((line) => line.startsWith(prefix)).length;
  return { differences, lexicalOnly, facts: before.length, policies: count("policy "), tables: count("rls "), functions: count("function "), triggers: count("trigger ") };
}

export function main() {
  const target = assertDisposableTarget(process.env);
  const baseline = readFileSync(resolve("prisma/rls.sql"), "utf8");
  const result = spawnSync("docker", ["exec", "-i", `supabase_db_${target.project}`, "psql", "-q", "-X", "-U", "postgres", "-d", "postgres"], {
    input: buildScript(baseline), encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Baseline verification transaction failed (psql exit ${result.status}).`);
  }
  const summary = compareSnapshots(result.stdout);
  if (summary.differences.length) {
    console.error(summary.differences.slice(0, 80).join("\n"));
    throw new Error(`prisma/rls.sql changes ${summary.differences.length} catalog facts of the migrated database.`);
  }
  console.info("Verified disaster-recovery RLS baseline equals migrations and is idempotent (rolled back)", {
    facts: summary.facts, tables: summary.tables, policies: summary.policies, functions: summary.functions, triggers: summary.triggers,
    lexicalOnlyFunctionDifferences: summary.lexicalOnly,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
