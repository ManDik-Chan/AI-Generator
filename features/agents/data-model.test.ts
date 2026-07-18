import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260718160000_add_agent_workers/migration.sql", "utf8");
const rls = readFileSync("prisma/rls.sql", "utf8");

describe("Agent data model and ownership contract", () => {
  it("defines AgentRun, AgentWorker and AgentEvent state", () => {
    for (const model of ["model AgentRun", "model AgentWorker", "model AgentEvent"]) {
      expect(schema).toContain(model);
    }
    for (const status of ["QUEUED", "BLOCKED", "RUNNING", "COMPLETE", "ERROR", "CANCELLED", "TIMEOUT"]) {
      expect(schema).toContain(status);
    }
  });

  it("binds run, conversation, messages, workers and events with composite ownership", () => {
    expect(schema).toContain("fields: [conversationId, userId], references: [id, userId]");
    expect(schema).toContain("fields: [userMessageId, conversationId], references: [id, conversationId]");
    expect(schema).toContain("fields: [assistantMessageId, conversationId], references: [id, conversationId]");
    expect(schema.match(/fields: \[agentRunId, userId\], references: \[id, userId\]/g)).toHaveLength(2);
    expect(migration).toContain("agent_runs_validate_messages");
  });

  it("enforces mode, worker, provider-call and event limits in the database", () => {
    expect(migration).toContain("agent_runs_mode_worker_count_check");
    expect(migration).toContain("agent_runs_counters_check");
    expect(migration).toContain("agent_workers_provider_call_count_check");
    expect(migration).toContain("agent_workers_validate_limit");
    expect(migration).toContain('"sequence" BETWEEN 1 AND 96');
  });

  it("allows authenticated clients to select only their own Agent rows", () => {
    for (const table of ["agent_runs", "agent_workers", "agent_events"]) {
      expect(rls).toContain(`create policy "${table}_select_own"`);
      expect(rls).toContain(`drop policy if exists "${table}_insert_own"`);
      expect(rls).toContain(`drop policy if exists "${table}_update_own"`);
      expect(rls).toContain(`drop policy if exists "${table}_delete_own"`);
      expect(rls).not.toContain(`create policy "${table}_insert_own"`);
      expect(rls).not.toContain(`create policy "${table}_update_own"`);
      expect(rls).not.toContain(`create policy "${table}_delete_own"`);
    }
  });
});
