import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "prisma/migrations/20260727013753_add_memory_verification/migration.sql",
  "utf8",
);
const revisionMigration = readFileSync(
  "prisma/migrations/20260724120000_add_trusted_memory_proposals/migration.sql",
  "utf8",
);

describe("memory verification database contract", () => {
  it("adds the five verification methods without replacing origin", () => {
    expect(schema).toContain("enum MemoryVerificationMethod");
    for (const method of [
      "MANUAL_ENTRY",
      "EXPLICIT_REQUEST",
      "PROPOSAL_ACCEPTANCE",
      "MANUAL_REVIEW",
      "LEGACY_UNREVIEWED",
    ]) {
      expect(schema).toContain(method);
    }
    expect(schema).toContain("enum MemoryOrigin");
    expect(schema).toMatch(/verificationMethod\s+MemoryVerificationMethod/);
    expect(schema).toMatch(/verifiedAt\s+DateTime\?/);
  });

  it("uses an explicit transactional migration and the required backfill", () => {
    expect(migration.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(migration.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(migration).toContain('"origin" = \'MANUAL\'');
    expect(migration).toContain("'MANUAL_ENTRY'");
    expect(migration).toContain('"origin" = \'CHAT_MESSAGE\'');
    expect(migration).toContain("'EXPLICIT_REQUEST'");
    expect(migration).toContain("latest_accepted_proposal");
    expect(migration).toContain("'PROPOSAL_ACCEPTANCE'");
    expect(migration).toContain("'LEGACY_UNREVIEWED'");
  });

  it("enforces timestamp equivalence and one useful owner filter index", () => {
    expect(migration).toContain('"memories_verification_timestamp_check"');
    expect(migration).toContain(
      '("verification_method" = \'LEGACY_UNREVIEWED\')',
    );
    expect(migration).toContain('= ("verified_at" IS NULL)');
    expect(migration).toContain(
      '"memories_user_id_verification_method_updated_at_idx"',
    );
  });

  it("does not add verification-only changes to revision semantics or rewrite RLS", () => {
    const functionBody = revisionMigration.match(
      /CREATE OR REPLACE FUNCTION "public"\."bump_memory_revision"\(\)([\s\S]+?)CREATE TRIGGER/,
    )?.[1] ?? "";
    expect(functionBody).not.toContain("verification_method");
    expect(functionBody).not.toContain("verified_at");
    expect(migration).not.toContain("CREATE POLICY");
    expect(migration).not.toContain("DROP POLICY");
  });
});
