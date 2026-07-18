import { describe, expect, it, vi } from "vitest";

import { appendAgentEvents } from "@/features/agents/events";

function eventTransaction(input: { latest?: number; delayMs?: number } = {}) {
  const wait = async () => {
    if (input.delayMs) await new Promise((resolve) => setTimeout(resolve, input.delayMs));
  };
  const transaction = {
    $queryRaw: vi.fn(async () => { await wait(); return [{ id: "run-1" }]; }),
    agentEvent: {
      findFirst: vi.fn(async () => { await wait(); return input.latest ? { sequence: input.latest } : null; }),
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => { await wait(); return { count: data.length }; }),
    },
  };
  return transaction;
}

describe("Agent event batch persistence", () => {
  it("locks once, reads the sequence once, and inserts an ordered batch once", async () => {
    const transaction = eventTransaction({ latest: 7 });
    const count = await appendAgentEvents(transaction as never, {
      userId: "user-1",
      runId: "run-1",
      events: [
        { type: "PLAN_CREATED", summaryText: "plan" },
        { type: "WORKERS_CREATED", summaryText: "workers" },
        { type: "WORKER_QUEUED", workerKey: "worker-a", summaryText: "queued" },
      ],
    });

    expect(count).toBe(3);
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(transaction.agentEvent.findFirst).toHaveBeenCalledOnce();
    expect(transaction.agentEvent.createMany).toHaveBeenCalledOnce();
    expect(transaction.agentEvent.createMany.mock.calls[0][0].data).toMatchObject([
      { sequence: 8, type: "PLAN_CREATED" },
      { sequence: 9, type: "WORKERS_CREATED" },
      { sequence: 10, type: "WORKER_QUEUED", workerKey: "worker-a" },
    ]);
  });

  it("stays well below the five-second transaction timeout under artificial database delay", async () => {
    const transaction = eventTransaction({ delayMs: 100 });
    const startedAt = performance.now();
    await appendAgentEvents(transaction as never, {
      userId: "user-1",
      runId: "run-1",
      events: Array.from({ length: 8 }, (_, index) => ({
        type: "WORKER_QUEUED" as const,
        workerKey: `worker-${index}`,
      })),
    });
    expect(performance.now() - startedAt).toBeLessThan(1_500);
    expect(transaction.$queryRaw.mock.calls.length + transaction.agentEvent.findFirst.mock.calls.length + transaction.agentEvent.createMany.mock.calls.length).toBe(3);
  });

  it("serializes concurrent batches into unique monotonic sequences", async () => {
    const rows: Array<{ sequence: number }> = [];
    let releasePrevious = Promise.resolve();

    const transaction = async (work: (client: unknown) => Promise<void>) => {
      let release!: () => void;
      const previous = releasePrevious;
      releasePrevious = new Promise<void>((resolve) => { release = resolve; });
      const client = {
        $queryRaw: async () => { await previous; return [{ id: "run-1" }]; },
        agentEvent: {
          findFirst: async () => rows.length ? { sequence: Math.max(...rows.map((row) => row.sequence)) } : null,
          createMany: async ({ data }: { data: Array<{ sequence: number }> }) => { rows.push(...data); return { count: data.length }; },
        },
      };
      try {
        await work(client);
      } finally {
        release();
      }
    };

    await Promise.all([
      transaction(async (client) => { await appendAgentEvents(client as never, { userId: "user-1", runId: "run-1", events: [{ type: "PLAN_CREATED" }, { type: "WORKERS_CREATED" }] }); }),
      transaction(async (client) => { await appendAgentEvents(client as never, { userId: "user-1", runId: "run-1", events: [{ type: "WORKER_QUEUED" }, { type: "WORKER_QUEUED" }] }); }),
    ]);

    expect(rows.map((row) => row.sequence)).toEqual([1, 2, 3, 4]);
    expect(new Set(rows.map((row) => row.sequence)).size).toBe(rows.length);
  });
});
