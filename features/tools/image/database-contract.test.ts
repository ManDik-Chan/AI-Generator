import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const schema = readFileSync("prisma/schema.prisma", "utf8"); const migration = readFileSync("prisma/migrations/20260713220000_add_tool_assets/migration.sql", "utf8"); const rls = readFileSync("prisma/rls.sql", "utf8");
describe("ToolAsset database contract", () => {
  it("uses an independent owned upload asset model with cascade and retention", () => { const generatedImage = schema.slice(schema.indexOf("model GeneratedImage"), schema.indexOf("model ModelConfig")); expect(schema).toContain("model ToolAsset"); expect(schema).toContain("toolRun ToolRun"); expect(schema).toContain("expiresAt"); expect(generatedImage).toContain("kind          GeneratedImageKind"); expect(generatedImage).toContain("toolRunId"); });
  it("adds a new migration without changing Phase 6A1", () => { expect(migration).toContain("IMAGE_ANALYZE"); expect(migration).toContain("tool_assets"); expect(migration).toContain("ON DELETE CASCADE"); });
  it("makes ToolAsset browser access read-only and owner-scoped", () => { expect(rls).toContain('alter table public.tool_assets enable row level security'); expect(rls).toContain('create policy "tool_assets_select_own"'); expect(rls).toContain('drop policy if exists "tool_assets_insert_own_run"'); expect(rls).not.toContain('create policy "tool_assets_insert_own_run"'); });
});
