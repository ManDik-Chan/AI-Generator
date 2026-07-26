import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "prisma/migrations/20260724120000_add_trusted_memory_proposals/migration.sql",
  "utf8",
);
const rls = readFileSync("prisma/rls.sql", "utf8");

describe("trusted memory proposal database contract", () => {
  it("uses an independent versioned model with target snapshots and expiry", () => {
    expect(schema).toContain("enum MemoryProposalStatus");
    expect(schema).toContain("enum MemoryProposalAction");
    expect(schema).toContain("model MemoryProposal");
    expect(schema).toMatch(/targetMemoryUpdatedAt\s+DateTime\?/);
    expect(schema).toMatch(/targetMemoryRevision\s+Int\?/);
    expect(schema).toMatch(/resolvedMemoryId\s+String\?/);
    expect(schema).toMatch(/expiresAt\s+DateTime/);
    expect(schema).toContain("@@unique([userId, dedupeKey])");
    expect(migration).toContain('"memory_proposals_action_target_check"');
    expect(migration).toContain('"memory_proposals_expiry_check"');
  });

  it("cascades with Profile and safely nulls deleted sources and memories", () => {
    expect(migration).toMatch(
      /"memory_proposals_user_id_fkey"[\s\S]+ON DELETE CASCADE/,
    );
    expect(migration).toMatch(
      /"memory_proposals_source_conversation_owner_fkey"[\s\S]+ON DELETE SET NULL/,
    );
    expect(migration).toMatch(
      /"memory_proposals_source_message_conversation_fkey"[\s\S]+ON DELETE SET NULL/,
    );
    expect(migration).toMatch(
      /"memory_proposals_target_owner_fkey"[\s\S]+ON DELETE SET NULL \("target_memory_id"\)/,
    );
    expect(migration).toMatch(
      /"memory_proposals_resolved_owner_fkey"[\s\S]+ON DELETE SET NULL \("resolved_memory_id"\)/,
    );
    expect(migration).toContain('"prepare_memory_proposal_memory_delete"');
    expect(migration).toContain('"memories_prepare_memory_proposal_delete"');
  });

  it("enforces same-owner Persona, source, target, and resolution relationships", () => {
    expect(migration).toContain('"memory_proposals_persona_owner_fkey"');
    expect(migration).toContain('"memory_proposals_target_owner_fkey"');
    expect(migration).toContain('"memory_proposals_resolved_owner_fkey"');
    expect(migration).toContain('"memory_proposals_source_conversation_owner_fkey"');
    expect(migration).toContain('"memory_proposals_source_message_conversation_fkey"');
    expect(migration).toContain("memory proposal source is immutable");
    expect(migration).toContain("active complete USER message");
    expect(migration).toContain('"status" = \'CANCELLED\'');
  });

  it("enforces a strict 30-day TTL and one-way terminal state machine", () => {
    expect(migration).toContain("INTERVAL '30 days'");
    expect(migration).toContain("invalid memory proposal status transition");
    expect(migration).toMatch(/"status" = 'ACCEPTED'[\s\S]+resolved_memory_id/);
    expect(migration).toContain('"memory_proposals_resolved_at_check"');
    expect(migration).toContain("target snapshot is immutable");
    expect(migration).toContain("accepted memory proposal requires a resolved memory");
    expect(migration).toContain("memory proposal resolution is immutable");
    expect(migration).toContain('"bump_memory_revision"');
    expect(migration).toContain("memory revision is database controlled");
  });

  it("allows authenticated users to SELECT only their own proposals", () => {
    expect(rls).toContain("alter table public.memory_proposals enable row level security");
    expect(rls).toContain('create policy "memory_proposals_select_own"');
    expect(rls).toContain("for select using (user_id = auth.uid())");
    expect(rls).toContain(
      "grant select on table public.personas, public.conversations, public.memories, public.memory_proposals",
    );
    expect(rls).not.toContain('create policy "memory_proposals_insert_own"');
    expect(rls).not.toContain('create policy "memory_proposals_update_own"');
    expect(rls).not.toContain('create policy "memory_proposals_delete_own"');
  });

  it("keeps proposals outside formal recall and embedding tables", () => {
    const selection = readFileSync("features/memory/selection.ts", "utf8");
    const semantic = readFileSync("features/memory/semantic-retrieval.ts", "utf8");
    const embedding = readFileSync("features/memory/embedding-lifecycle.ts", "utf8");
    expect(selection).not.toContain("MemoryProposal");
    expect(semantic).not.toContain("MemoryProposal");
    expect(embedding).not.toContain("memoryProposal");
    expect(schema).not.toMatch(/model MemoryProposal[\s\S]+MemoryEmbedding\?/);
  });
});
