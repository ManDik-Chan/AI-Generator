import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260713010000_add_memory_foundation/migration.sql", "utf8");
const rls = readFileSync("prisma/rls.sql", "utf8");

describe("memory database contract", () => {
  it("defines the scope, origin, master switch and nullable source relation", () => {
    expect(schema).toContain("enum MemoryScope");
    expect(schema).toContain("enum MemoryOrigin");
    expect(schema).toMatch(/memoryEnabled\s+Boolean\s+@default\(true\)/);
    expect(schema).toMatch(/sourceMessage\s+Message\?\s+@relation\("MemorySourceMessage"/);
    expect(schema).toContain("onDelete: SetNull");
  });

  it("backfills existing rows and enforces importance and scope checks", () => {
    expect(migration).toContain('"scope" = \'GLOBAL\'');
    expect(migration).toContain('"origin" = \'MANUAL\'');
    expect(migration).toContain('CHECK ("importance" BETWEEN 1 AND 5)');
    expect(migration).toContain("memories_scope_persona_check");
  });

  it("hardens insert and update RLS for every associated owner", () => {
    expect(rls).toContain('policy "memories_insert_own_relations"');
    expect(rls).toContain('policy "memories_update_own_relations"');
    expect(rls).toContain("p.user_id = auth.uid()");
    expect(rls).toContain("c.user_id = auth.uid()");
    expect(rls).toContain("m.conversation_id = source_conversation_id");
  });

  it("makes every policy creation structurally repeatable", () => {
    const creates = [...rls.matchAll(/create policy "([^"]+)" on public\.([a-z_]+)/g)];
    expect(creates.length).toBeGreaterThan(0);
    for (const [, policy, table] of creates) {
      expect(rls).toContain(`drop policy if exists "${policy}" on public.${table};`);
    }
    expect(rls).toContain("drop trigger if exists on_auth_user_created on auth.users;");
  });
});
