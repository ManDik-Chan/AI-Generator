import { describe, expect, it } from "vitest";
import { parseBackfillOptions } from "@/scripts/backfill-memory-embeddings";
import { readFileSync } from "node:fs";

describe("memory embedding backfill arguments", () => {
  it("requires exactly one explicit owner scope", () => {
    expect(() => parseBackfillOptions([])).toThrow("--all");
    expect(() => parseBackfillOptions(["--all", "--user=11111111-1111-4111-8111-111111111111"])).toThrow("--all");
  });

  it("supports safe dry-run and bounded batches", () => {
    expect(parseBackfillOptions(["--user=11111111-1111-4111-8111-111111111111", "--limit=20", "--batch-size=32", "--dry-run"])).toEqual({ all: false, userId: "11111111-1111-4111-8111-111111111111", limit: 20, batchSize: 32, dryRun: true });
    expect(() => parseBackfillOptions(["--all", "--batch-size=33"])).toThrow("1-32");
  });

  it("guards writes during dry-run and reports only counters", () => {
    const source = readFileSync("scripts/backfill-memory-embeddings.ts", "utf8");
    expect(source).toContain("if (!options.dryRun)");
    expect(source).toContain('const counters = { scanned: memories.length, skipped: 0, generated: 0, failed: 0 }');
    expect(source).not.toContain("console.info(memory.content");
  });
});
