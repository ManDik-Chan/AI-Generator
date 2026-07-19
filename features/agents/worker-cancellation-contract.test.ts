import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const state = readFileSync("features/agents/worker-state.ts", "utf8");
const route = readFileSync("app/api/agents/[agentRunId]/workers/[workerKey]/cancel/route.ts", "utf8");

describe("single Agent Worker cancellation", () => {
  it("is owner-scoped, idempotent and does not cancel the run or other Workers", () => {
    const start = state.indexOf("export async function cancelAgentWorker");
    const end = state.indexOf("export function countProviderCalls", start);
    const implementation = state.slice(start, end);
    expect(implementation).toContain("agentRunId: runId, userId, key: workerKey");
    expect(implementation).toContain('status: { in: ["QUEUED", "RUNNING"] }');
    expect(implementation).toContain("WORKER_CANCELLED");
    expect(implementation).not.toContain("agentRun.updateMany({\n      where: { id: runId, userId, status: \"PENDING\" },\n      data: { status: \"CANCELLED\"");
  });

  it("derives ownership from the Supabase server session and returns 404 for foreign IDs", () => {
    expect(route).toContain("createSupabaseServerClient");
    expect(route).toContain("cancelAgentWorker(userId, agentRunId, workerKey)");
    expect(route).toContain("status: 404");
    expect(route).not.toContain("request.json");
  });
});
