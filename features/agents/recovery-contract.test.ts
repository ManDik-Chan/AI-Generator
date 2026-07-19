import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const statusRoute = readFileSync(join(root, "app/api/agents/[agentRunId]/status/route.ts"), "utf8");
const cancelRoute = readFileSync(join(root, "app/api/agents/[agentRunId]/cancel/route.ts"), "utf8");
const query = readFileSync(join(root, "features/agents/queries.ts"), "utf8");
const service = readFileSync(join(root, "features/agents/service.ts"), "utf8");
const observer = readFileSync(join(root, "features/generation/sse-observer.ts"), "utf8");

describe("Agent recovery and lifecycle contracts", () => {
  it("keeps status, cancellation, Worker, Event and Message queries owner scoped", () => {
    expect(statusRoute).toContain("getOwnedAgentRunStatus(userId");
    expect(cancelRoute).toContain("cancelAgentRun(userId");
    expect(query).toContain("where: { id: runId, userId }");
    expect(query).toContain("workers:");
    expect(query).toContain("events:");
    expect(query).toContain("assistantMessage:");
    expect(statusRoute).not.toContain("getAgentDailyCreditLimit");
    expect(query).not.toContain("systemPrompt");
  });

  it("treats SSE as an observer and registers work independently of request abort", () => {
    expect(observer).toContain("requestSignal?.addEventListener(\"abort\", detach");
    expect(observer).not.toContain("requestSignal?.addEventListener(\"abort\", () => controller.abort");
    expect(service).toContain("createDurableCancellationController");
    expect(service).toContain("persistAgentAssistantPartial");
  });

  it("never invokes Leader with fewer than two successful Workers", () => {
    expect(service).toMatch(/successful\.length < 2[\s\S]+INSUFFICIENT_WORKERS[\s\S]+reserveLeaderProviderCall/);
  });
});
