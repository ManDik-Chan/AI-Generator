import { describe, expect, it } from "vitest";

import { buildScript, compareSnapshots, normalizeSql } from "./verify-rls-baseline.mjs";

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
const migrated = `CREATE OR REPLACE FUNCTION public.f()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  INSERT INTO "public"."profiles" ("id") VALUES (NEW."id");\n  RAISE EXCEPTION 'Server-managed' USING ERRCODE = '42501';\nEND;\n$function$\n`;
const baseline = `CREATE OR REPLACE FUNCTION public.f()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nbegin\n  insert into public.profiles (id) values (new.id);\n  raise exception 'Server-managed' using errcode = '42501';\nend;\n$function$\n`;
const facts = (fn: string, policy = "policy public.profiles own PERMISSIVE authenticated SELECT using=(id = auth.uid()) check=-") => [
  "rls public.profiles enabled=true forced=false", policy, "table-acl public.profiles authenticated SELECT grantable=false",
  `function f() definition-b64=${b64(fn)}`, "trigger public.profiles protect enabled=O definition-md5=abc",
];
const output = (before: string[], first: string[], second = first, rolledBack = true) =>
  ["==before", ...before, "==after-1", ...first, "==after-2", ...second, ...(rolledBack ? ["==rolled-back"] : [])].join("\n");

describe("normalizeSql applies only PostgreSQL's own equivalences", () => {
  it("folds keyword case, quoted lowercase identifiers and whitespace", () => {
    expect(normalizeSql(migrated)).toBe(normalizeSql(baseline));
  });

  it("keeps string literals, mixed-case quoted identifiers and comments significant", () => {
    expect(normalizeSql("raise exception 'A b'")).not.toBe(normalizeSql("raise exception 'a b'"));
    expect(normalizeSql("select 'it''s  spaced'")).toBe("select 'it''s  spaced'");
    expect(normalizeSql('select "UserId" from t')).not.toBe(normalizeSql("select userid from t"));
    expect(normalizeSql("select 1 -- note")).not.toBe(normalizeSql("select 1"));
    expect(normalizeSql("using (true)")).not.toBe(normalizeSql("using (id = auth.uid())"));
  });
});

describe("compareSnapshots", () => {
  it("accepts an identical catalog and reports lexical-only function differences", () => {
    const result = compareSnapshots(output(facts(migrated), facts(baseline)));
    expect(result.differences).toEqual([]);
    expect(result.lexicalOnly).toEqual(["f()"]);
    expect(result).toMatchObject({ tables: 1, policies: 1, functions: 1, triggers: 1 });
  });

  it("fails on a changed policy, a changed function literal or a non-idempotent second application", () => {
    const loosened = facts(migrated, "policy public.profiles own PERMISSIVE authenticated SELECT using=true check=-");
    expect(compareSnapshots(output(facts(migrated), loosened)).differences.length).toBeGreaterThan(0);
    expect(compareSnapshots(output(facts(migrated), facts(baseline.replace("Server-managed", "server-managed")))).differences.length).toBeGreaterThan(0);
    const drifted = compareSnapshots(output(facts(migrated), facts(baseline), [...facts(baseline), "table-acl public.profiles anon SELECT grantable=false"]));
    expect(drifted.differences).toEqual(["after-2 + table-acl public.profiles anon SELECT grantable=false"]);
  });

  it("refuses an empty snapshot or a transaction that did not reach its rollback", () => {
    expect(() => compareSnapshots(output([], []))).toThrow(/empty or incomplete/);
    expect(() => compareSnapshots(output(facts(migrated), facts(baseline), facts(baseline), false))).toThrow(/rollback/);
  });
});

describe("buildScript", () => {
  it("applies the baseline twice inside one transaction that is rolled back", () => {
    const script = buildScript("drop policy if exists p on t;");
    expect(script.match(/drop policy if exists p on t;/g)).toHaveLength(2);
    const order = ["\\set ON_ERROR_STOP 1", "begin;", "==before", "==after-1", "==after-2", "rollback;", "==rolled-back"].map((marker) => script.indexOf(marker));
    expect(order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1]))).toBe(true);
    expect(script).not.toMatch(/\bcommit\b/i);
  });

  it("rejects a baseline that would end the verification transaction itself", () => {
    expect(() => buildScript("begin;\ncreate table x();\ncommit;")).toThrow(/transaction control/);
    expect(() => buildScript("create function f() returns void language plpgsql as $$ begin end; $$;")).not.toThrow();
  });
});
