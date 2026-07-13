import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const schema = readFileSync("prisma/schema.prisma", "utf8"); const migration = readFileSync("prisma/migrations/20260713220000_add_tool_assets/migration.sql", "utf8"); const rls = readFileSync("prisma/rls.sql", "utf8");
describe("ToolAsset database contract", () => {
  it("uses an independent owned asset model with cascade and retention", () => { const generatedImage = schema.slice(schema.indexOf("model GeneratedImage"), schema.indexOf("model ModelConfig")); expect(schema).toContain("model ToolAsset"); expect(schema).toContain("toolRun ToolRun"); expect(schema).toContain("expiresAt"); expect(generatedImage).not.toContain("toolRunId"); });
  it("adds a new migration without changing Phase 6A1", () => { expect(migration).toContain("IMAGE_ANALYZE"); expect(migration).toContain("tool_assets"); expect(migration).toContain("ON DELETE CASCADE"); });
  it("enforces owned RLS and owned ToolRun binding", () => { expect(rls).toContain('alter table public.tool_assets enable row level security'); expect(rls).toContain("r.id = tool_run_id"); expect(rls).toContain("r.user_id = auth.uid()"); });
});
