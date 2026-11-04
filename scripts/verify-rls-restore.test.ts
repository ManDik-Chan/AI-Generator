import { describe, expect, it } from "vitest";

import { KNOWN_VARIANTS, STRUCTURE_SQL, compareRestore, isKnownVariant, parseSnapshot } from "./verify-rls-restore.mjs";

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
const pinned = (name: string) => {
  const variant = KNOWN_VARIANTS.get(name);
  if (variant?.rule !== "pinned") throw new Error(`${name} is not pinned`);
  return variant;
};
const counters = pinned("constraint public.agent_runs.agent_runs_counters_check");
const documentation = pinned("constraint public.project_documentation.project_documentation_shape");
const migratedFunction = "CREATE OR REPLACE FUNCTION public.handle_new_auth_user()\nAS $function$\nBEGIN\n  RETURN NEW;\nEND;\n$function$\n";
const baselineFunction = "CREATE OR REPLACE FUNCTION public.handle_new_auth_user()\nAS $function$\nbegin\n  return new;\nend;\n$function$\n";

const snapshot = ({
  fn = migratedFunction,
  check = counters.migrated,
  extra = [] as string[],
  trigger = true,
} = {}) => parseSnapshot([
  "rls public.projects enabled=true forced=false",
  "table-acl public.projects authenticated SELECT grantable=false",
  ...(trigger ? ["trigger auth.users users_protect_platform_owner enabled=O definition-md5=abc"] : []),
  `function handle_new_auth_user() definition-b64=${b64(fn)}`,
  `constraint public.agent_runs.agent_runs_counters_check type=c validated=true definition-b64=${b64(check)}`,
  "data public.projects rows=0 md5=-",
  ...extra,
].join("\n"));

describe("parseSnapshot", () => {
  it("keys functions by signature and constraints by name, keeping their attributes", () => {
    const parsed = snapshot();
    expect([...parsed.definitions.keys()]).toEqual([
      "function handle_new_auth_user()",
      "constraint public.agent_runs.agent_runs_counters_check",
    ]);
    expect(parsed.definitions.get("constraint public.agent_runs.agent_runs_counters_check")).toEqual({ attributes: "type=c validated=true", source: counters.migrated });
    expect(parsed.facts.has("data public.projects rows=0 md5=-")).toBe(true);
  });

  it("refuses a duplicated identity instead of silently overwriting it", () => {
    const line = `function f() definition-b64=${b64("x")}`;
    expect(() => parseSnapshot(`${line}\n${line}`)).toThrow(/Duplicate/);
  });
});

describe("compareRestore", () => {
  it("accepts only the named known variants and reports them", () => {
    const result = compareRestore(snapshot(), snapshot({ fn: baselineFunction, check: counters.restored }));
    expect(result.differences).toEqual([]);
    expect(result.variants).toEqual([
      "constraint public.agent_runs.agent_runs_counters_check (pinned)",
      "function handle_new_auth_user() (sql)",
    ]);
  });

  it("reports every restore gap when variants are not allowed", () => {
    const result = compareRestore(snapshot(), snapshot({ check: counters.restored, trigger: false, extra: ["table-acl public.projects anon TRUNCATE grantable=false"] }), { allowVariants: false });
    expect(result.differences).toEqual([
      "+ table-acl public.projects anon TRUNCATE grantable=false",
      "- trigger auth.users users_protect_platform_owner enabled=O definition-md5=abc",
      expect.stringMatching(/^~ constraint public\.agent_runs\.agent_runs_counters_check /),
    ]);
  });

  it("fails on a widened grant, a missing trigger, changed data or a constraint outside the pinned pair", () => {
    expect(compareRestore(snapshot(), snapshot({ extra: ["table-acl public.projects anon SELECT grantable=false"] })).differences).toHaveLength(1);
    expect(compareRestore(snapshot(), snapshot({ trigger: false })).differences).toHaveLength(1);
    expect(compareRestore(snapshot(), snapshot({ extra: ["data public.projects rows=1 md5=ff"] })).differences).toHaveLength(1);
    const loosened = counters.restored.replace("provider_call_count <= 8", "provider_call_count <= 9");
    expect(compareRestore(snapshot(), snapshot({ check: loosened })).differences).toHaveLength(1);
    expect(compareRestore(snapshot(), snapshot({ fn: baselineFunction.replace("return new", "return old") })).differences).toHaveLength(1);
  });
});

describe("isKnownVariant", () => {
  it("does not apply a variant to any other object", () => {
    expect(isKnownVariant("constraint public.agent_runs.other_check", counters.migrated, counters.restored)).toBe(false);
    expect(isKnownVariant("function other()", migratedFunction, baselineFunction)).toBe(false);
  });

  it("accepts a pinned constraint only for its exact migrated -> restored pair, in that direction", () => {
    const name = "constraint public.project_documentation.project_documentation_shape";
    expect(isKnownVariant(name, documentation.migrated, documentation.restored)).toBe(true);
    expect(isKnownVariant(name, documentation.restored, documentation.migrated)).toBe(false);
    expect(isKnownVariant(name, documentation.migrated, documentation.restored.replace("'en'", "'fr'"))).toBe(false);
  });
});

describe("STRUCTURE_SQL", () => {
  it("fingerprints data in the application, storage and auth tables a restore must reproduce", () => {
    expect(STRUCTURE_SQL).toMatch(/\\gexec\s*$/);
    for (const fragment of ["'registry_private'", "'buckets','objects'", "'users','identities'", "pg_get_constraintdef", "pg_default_acl"]) {
      expect(STRUCTURE_SQL).toContain(fragment);
    }
  });
});
