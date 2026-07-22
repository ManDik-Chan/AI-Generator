import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: {} as Record<string, unknown>,
  transaction: vi.fn(),
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { cancelAgentRun, finishAgentRun, reconcileStaleAgentRun } from "@/features/agents/run-state";
import { cancelAgentWorker, finishAgentWorker } from "@/features/agents/worker-state";

function transactionClient(run: { status: "PENDING" | "CANCELLED"; startedAt?: Date; planFallback?: boolean; errorCode?: string | null }) {
  const client = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "run-1" }]),
    agentRun: {
      findFirst: vi.fn().mockResolvedValue({ status: run.status, startedAt: run.startedAt ?? new Date(0), assistantMessageId: "message-1", planFallback: run.planFallback ?? false, errorCode: run.errorCode ?? null }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    agentWorker: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([{ key: "worker-a" }, { key: "worker-b" }]),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      groupBy: vi.fn().mockResolvedValue([
        { status: "TIMEOUT", _count: { _all: 2 } },
        { status: "COMPLETE", _count: { _all: 1 } },
      ]),
    },
    message: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    agentEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
    },
  };
  return client;
}

describe("Agent cancellation and stale reconciliation behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: unknown) => Promise<unknown>) => work(mocks.client));
  });

  it("atomically converges a stale PENDING run, active Workers, Message, and events", async () => {
    const client = transactionClient({ status: "PENDING", startedAt: new Date("2026-01-01T00:00:00Z") });
    mocks.client = client;

    const status = await reconcileStaleAgentRun("user-1", "run-1", new Date("2026-01-01T00:05:00Z"));

    expect(status).toBe("ERROR");
    expect(client.agentWorker.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "TIMEOUT", errorCode: "STALE_RUN" }) }));
    expect(client.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ERROR" }) }));
    expect(client.agentRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ERROR", phase: "FINISHED", errorCode: "STALE_RUN", completedWorkerCount: 3, successfulWorkerCount: 1 }) }));
    expect(client.agentEvent.createMany.mock.calls[0][0].data).toHaveLength(3);
  });

  it("does not reconcile a still-fresh PENDING run", async () => {
    const client = transactionClient({ status: "PENDING", startedAt: new Date("2026-01-01T00:04:59Z") });
    mocks.client = client;

    expect(await reconcileStaleAgentRun("user-1", "run-1", new Date("2026-01-01T00:04:00Z"))).toBe("PENDING");
    expect(client.agentWorker.findMany).not.toHaveBeenCalled();
    expect(client.agentRun.updateMany).not.toHaveBeenCalled();
    expect(client.agentEvent.createMany).not.toHaveBeenCalled();
  });

  it("cancels all active Workers and the Run with one event batch, then stays idempotent", async () => {
    const client = transactionClient({ status: "PENDING" });
    client.agentWorker.findMany.mockResolvedValue(Array.from({ length: 6 }, (_, index) => ({ key: `worker-${index}` })));
    client.agentWorker.groupBy.mockResolvedValue([
      { status: "CANCELLED", _count: { _all: 6 } },
    ]);
    mocks.client = client;

    expect(await cancelAgentRun("user-1", "run-1")).toBe("CANCELLED");
    expect(client.agentRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED", completedWorkerCount: 6, successfulWorkerCount: 0 }) }));
    expect(client.agentEvent.createMany).toHaveBeenCalledOnce();
    expect(client.agentEvent.findFirst).toHaveBeenCalledOnce();
    expect(client.agentEvent.createMany.mock.calls[0][0].data).toHaveLength(7);

    vi.clearAllMocks();
    client.$queryRaw.mockResolvedValue([{ id: "run-1" }]);
    client.agentRun.findFirst.mockResolvedValue({ status: "CANCELLED", assistantMessageId: "message-1" });
    expect(await cancelAgentRun("user-1", "run-1")).toBe("CANCELLED");
    expect(client.agentWorker.updateMany).not.toHaveBeenCalled();
    expect(client.agentEvent.createMany).not.toHaveBeenCalled();
  });

  it("rejects a late Worker result after the parent Run is no longer PENDING", async () => {
    const client = transactionClient({ status: "CANCELLED" });
    client.agentWorker.updateMany.mockResolvedValue({ count: 0 });
    mocks.client = client;

    const finished = await finishAgentWorker({ userId: "user-1", runId: "run-1", workerKey: "worker-a", status: "COMPLETE" });

    expect(finished).toBe(false);
    expect(client.agentRun.updateMany).not.toHaveBeenCalled();
    expect(client.agentEvent.createMany).not.toHaveBeenCalled();
  });

  it("finishes six unfinished Workers with collection updates and one event batch", async () => {
    const client = transactionClient({ status: "PENDING" });
    client.agentWorker.findMany.mockResolvedValue(Array.from({ length: 6 }, (_, index) => ({ key: `worker-${index}`, status: index < 3 ? "RUNNING" : "QUEUED" })));
    client.agentWorker.groupBy.mockResolvedValue([
      { status: "ERROR", _count: { _all: 3 } },
      { status: "BLOCKED", _count: { _all: 3 } },
    ]);
    mocks.client = client;

    expect(await finishAgentRun({ userId: "user-1", runId: "run-1", status: "ERROR", content: "Safe failure", errorCode: "AGENT_ERROR" })).toBe(true);
    expect(client.agentWorker.updateMany).toHaveBeenCalledTimes(2);
    expect(client.agentEvent.findFirst).toHaveBeenCalledOnce();
    expect(client.agentEvent.createMany).toHaveBeenCalledOnce();
    expect(client.agentEvent.createMany.mock.calls[0][0].data).toHaveLength(7);
  });

  it("preserves a safe Planner fallback code when a run completes successfully", async () => {
    const client = transactionClient({ status: "PENDING", planFallback: true, errorCode: "PLAN_INVALID" });
    client.agentWorker.findMany.mockResolvedValue([]);
    client.agentWorker.groupBy.mockResolvedValue([{ status: "COMPLETE", _count: { _all: 4 } }]);
    mocks.client = client;

    expect(await finishAgentRun({ userId: "user-1", runId: "run-1", status: "COMPLETE", content: "Final answer" })).toBe(true);
    expect(client.agentRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "COMPLETE", errorCode: "PLAN_INVALID" }),
    }));
  });

  it("cancels only the requested Worker and records one event", async () => {
    const client = transactionClient({ status: "PENDING" });
    client.agentWorker.findFirst.mockResolvedValue({ status: "RUNNING" });
    client.agentWorker.updateMany.mockResolvedValue({ count: 1 });
    mocks.client = client;

    expect(await cancelAgentWorker("user-1", "run-1", "worker-a")).toBe("CANCELLED");
    expect(client.agentWorker.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ agentRunId: "run-1", userId: "user-1", key: "worker-a" }),
    }));
    expect(client.agentRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { completedWorkerCount: { increment: 1 } } }));
    expect(client.agentEvent.createMany.mock.calls[0][0].data).toHaveLength(1);
  });
});
