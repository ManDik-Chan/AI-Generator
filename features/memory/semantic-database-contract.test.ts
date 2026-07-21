import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pgvector memory contract", () => {
  const migration = readFileSync("prisma/migrations/20260713150000_add_memory_embeddings/migration.sql", "utf8");
  const rls = readFileSync("prisma/rls.sql", "utf8");
  const repository = readFileSync("features/memory/embedding-repository.ts", "utf8");
  const schema = readFileSync("prisma/schema.prisma", "utf8");

  it("creates a separate fixed-dimension vector table without an ANN index", () => {
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions");
    expect(migration).toContain('"embedding" extensions.vector(512) NOT NULL');
    expect(migration).toContain('CHECK ("dimensions" = 512)');
    expect(migration).toContain("ON DELETE CASCADE");
    expect(migration).not.toMatch(/HNSW|IVFFLAT/i);
    expect(schema).toContain('model MemoryEmbedding');
    expect(schema).toContain('embedding   Unsupported("vector(512)")');
    expect(schema).toContain('memory Memory  @relation(fields: [memoryId], references: [id], onDelete: Cascade)');
  });

  it("contains a repeatable read-only owner RLS policy", () => {
    expect(rls).toContain('drop policy if exists "memory_embeddings_select_own"');
    expect(rls).toContain('create policy "memory_embeddings_select_own"');
    expect(rls).not.toContain('create policy "memory_embeddings_insert_own_memory"');
    expect(rls).not.toContain('create policy "memory_embeddings_update_own_memory"');
    expect(rls).not.toContain('create policy "memory_embeddings_delete_own"');
    expect(migration).toContain('"memory_embeddings_user_id_model_dimensions_idx"');
  });

  it("uses parameterized cosine SQL with owner/persona/model/dimension/threshold/limit filters and never selects vectors", () => {
    expect(repository).toContain("me.embedding <=> ${vectorLiteral(queryEmbedding)}::extensions.vector");
    expect(repository).toContain("m.user_id = ${input.userId}::uuid");
    expect(repository).toContain("m.enabled = true");
    expect(repository).toContain("me.model = ${input.model}");
    expect(repository).toContain("me.dimensions = ${input.dimensions}");
    expect(repository).toContain(">= ${threshold}");
    expect(repository).toContain("LIMIT ${limit}");
    expect(repository).not.toMatch(/SELECT[^;]+me\.embedding\s*(,|FROM)/);
  });

  it("does not modify deployed migrations", () => {
    expect(readFileSync("prisma/migrations/20260713010000_add_memory_foundation/migration.sql", "utf8").length).toBeGreaterThan(0);
    expect(readFileSync("prisma/migrations/20260713110000_add_memory_governance/migration.sql", "utf8").length).toBeGreaterThan(0);
  });

  it("schedules lifecycle sync only for content lifecycle actions and automatic extraction", () => {
    const actions = readFileSync("features/memory/actions.ts", "utf8");
    const route = readFileSync("app/api/chat/route.ts", "utf8");
    expect(actions.match(/syncMemoryEmbeddingSafely/g)?.length).toBeGreaterThanOrEqual(4);
    expect(actions).toContain("if (enabled) after(() => syncMemoryEmbeddingSafely");
    expect(route).toContain("syncMemoryEmbeddingsForSourceMessage(user.id, userMessageId)");
    expect(actions.slice(actions.indexOf("setMemoryPinnedAction"), actions.indexOf("deleteMemoryAction"))).not.toContain("syncMemoryEmbeddingSafely");
  });
});
