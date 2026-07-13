import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260713190000_add_tool_runs/migration.sql", "utf8");
const rls = readFileSync("prisma/rls.sql", "utf8");
describe("ToolRun database and RLS contract", () => {
  it("defines statuses, ownership, cascade and indexes", () => { expect(schema).toContain("enum ToolRunStatus"); expect(schema).toContain("status        ToolRunStatus @default(PENDING)"); expect(schema).toContain("onDelete: Cascade"); expect(schema).toContain("@@index([userId, type, createdAt(sort: Desc)])"); });
  it("enforces content lengths and privacy retention in the migration", () => { expect(migration).toContain("tool_runs_input_length_check"); expect(migration).toContain("<= 20000"); expect(migration).toContain("<= 40000"); expect(migration).toContain("tool_runs_retention_check"); });
  it("provides repeatable per-operation RLS policies", () => { for (const action of ["select", "insert", "update", "delete"]) { expect(rls).toContain(`drop policy if exists "tool_runs_${action}_own"`); expect(rls).toContain(`create policy "tool_runs_${action}_own"`); } expect(rls.match(/user_id = auth\.uid\(\)/g)?.length).toBeGreaterThan(4); });
  it("does not modify an older deployed migration", () => expect(readFileSync("prisma/migrations/20260713150000_add_memory_embeddings/migration.sql", "utf8")).not.toContain("tool_runs"));
});
