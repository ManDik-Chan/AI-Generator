import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  planning: vi.fn(),
  workerPool: vi.fn(),
  runtimeContext: vi.fn(),
  reserveLeader: vi.fn(),
  finishRun: vi.fn(),
  pending: vi.fn(),
  terminalState: vi.fn(),
  partial: vi.fn(),
  cancellation: undefined as AbortController | undefined,
  dispose: vi.fn(),
}));

vi.mock("@/features/agents/planning-service", () => ({ runAgentPlanningPhase: mocks.planning }));
vi.mock("@/features/agents/worker-pool", () => ({ runAgentWorkerPool: mocks.workerPool }));
vi.mock("@/features/agents/runtime-context", () => ({ loadAgentRuntimeContext: mocks.runtimeContext }));
vi.mock("@/features/agents/events", () => ({ reserveLeaderProviderCall: mocks.reserveLeader }));
vi.mock("@/features/agents/run-state", () => ({
  finishAgentRun: mocks.finishRun,
  getAgentRunTerminalState: mocks.terminalState,
  isAgentRunPending: mocks.pending,
  persistAgentAssistantPartial: mocks.partial,
}));
vi.mock("@/features/generation/durable-cancellation", () => ({
  createDurableCancellationController: async () => ({ signal: mocks.cancellation!.signal, dispose: mocks.dispose }),
}));
vi.mock("@/lib/database/prisma", () => ({ prisma: { memory: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } } }));

import { runAgentService } from "@/features/agents/service";
import type { AgentGenerationConfig, AiProvider } from "@/lib/ai/types";

const config: AgentGenerationConfig = {
  plannerModel: "planner", workerModel: "worker", leaderModel: "leader", temperature: 0.4,
  plannerMaxOutputTokens: 1000, workerMaxOutputTokens: 1600, leaderMaxOutputTokens: 3000,
  requestTimeoutMs: 120_000, totalTimeoutMs: 285_000, dailyCredits: 6,
  plannerModelSource: "agent-planner", workerModelSource: "agent-worker", leaderModelSource: "agent-leader",
};
const plan = {
  overview: "trusted plan",
  workers: ["a", "b", "c", "d"].map((key) => ({
    key, name: key, title: key, objective: key, expectedDeliverable: key, priority: "MEDIUM" as const, dependsOn: [],
  })),
};
const worker = (key: string, status: "COMPLETE" | "ERROR") => ({
  id: key, agentRunId: "run", userId: "user", key, position: 0, name: key, title: key,
  objective: key, expectedDeliverable: key, priority: "MEDIUM" as const, status, dependsOnKeys: [],
  workSummary: status === "COMPLETE" ? "summary" : null, findings: [], assumptions: [], risks: [], recommendations: [],
  finalDeliverable: status === "COMPLETE" ? "deliverable" : null, structured: status === "COMPLETE",
  providerCallCount: 1, errorCode: status === "ERROR" ? "WORKER_ERROR" : null,
  startedAt: new Date(), completedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
});

describe("Agent orchestration service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cancellation = new AbortController();
    mocks.runtimeContext.mockResolvedValue({
      userProblem: "problem", mode: "STANDARD", conversationId: "conversation", userMessageId: "message",
      conversationSummary: "context", personaSummary: "persona", memorySummary: "memory", selectedMemoryIds: [],
    });
    mocks.planning.mockResolvedValue({ plan, fallback: false });
    mocks.pending.mockResolvedValue(true);
    mocks.terminalState.mockResolvedValue({ status: "PENDING", errorCode: null });
    mocks.reserveLeader.mockResolvedValue(true);
    mocks.finishRun.mockResolvedValue(true);
    mocks.partial.mockResolvedValue(true);
  });

  it("uses exactly one Leader call after at least two successful Workers and persists its final Message", async () => {
    mocks.workerPool.mockResolvedValue([worker("a", "COMPLETE"), worker("b", "COMPLETE"), worker("c", "ERROR"), worker("d", "ERROR")]);
    const streamText = vi.fn((request: Parameters<AiProvider["streamText"]>[0]) => {
      void request;
      return { async *[Symbol.asyncIterator]() { yield "safe final answer"; } };
    });
    const send = vi.fn(() => true);
    await runAgentService({ userId: "user", runId: "run", provider: { streamText } satisfies AiProvider, config, send });
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(streamText.mock.calls[0]?.[0].model).toBe("leader");
    expect(mocks.reserveLeader).toHaveBeenCalledTimes(1);
    expect(mocks.finishRun).toHaveBeenCalledWith(expect.objectContaining({ status: "COMPLETE", content: "safe final answer" }));
    expect(send).toHaveBeenCalledWith("synthesis_started", expect.objectContaining({ successfulWorkers: 2 }));
    expect(send).toHaveBeenCalledWith("done", expect.objectContaining({ status: "COMPLETE" }));
  });

  it("does not reserve or call Leader when fewer than two Workers succeed", async () => {
    mocks.workerPool.mockResolvedValue([worker("a", "COMPLETE"), worker("b", "ERROR"), worker("c", "ERROR"), worker("d", "ERROR")]);
    const streamText = vi.fn();
    const send = vi.fn(() => true);
    await runAgentService({ userId: "user", runId: "run", provider: { streamText } as unknown as AiProvider, config, send });
    expect(mocks.reserveLeader).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
    expect(mocks.finishRun).toHaveBeenCalledWith(expect.objectContaining({ status: "ERROR", errorCode: "INSUFFICIENT_WORKERS" }));
  });

  it("records the overall deadline as TIMEOUT without starting Leader", async () => {
    mocks.workerPool.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return [worker("a", "ERROR"), worker("b", "ERROR")];
    });
    const streamText = vi.fn();
    await runAgentService({ userId: "user", runId: "run", provider: { streamText } as unknown as AiProvider, config: { ...config, totalTimeoutMs: 5 }, send: vi.fn(() => true) });
    expect(streamText).not.toHaveBeenCalled();
    expect(mocks.finishRun).toHaveBeenCalledWith(expect.objectContaining({ status: "ERROR", errorCode: "TIMEOUT", timeout: true }));
  });

  it("does not report cancellation when terminal persistence fails", async () => {
    mocks.workerPool.mockResolvedValue([worker("a", "COMPLETE"), worker("b", "ERROR")]);
    mocks.finishRun.mockRejectedValue(new Error("database unavailable"));
    mocks.terminalState.mockResolvedValue({ status: "PENDING", errorCode: null });
    const send = vi.fn(() => true);

    await runAgentService({ userId: "user", runId: "run", provider: { streamText: vi.fn() } as unknown as AiProvider, config, send });

    expect(send).toHaveBeenCalledWith("error", expect.objectContaining({ code: "PERSISTENCE_ERROR" }));
    expect(send).not.toHaveBeenCalledWith("cancelled", expect.anything());
  });
});
