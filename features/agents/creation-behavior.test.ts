import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@/lib/database/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { persistAgentPlan } from "@/features/agents/creation";
import type { AgentPlan } from "@/features/agents/types";

function standardPlan(): AgentPlan {
  return {
    overview: "Plan",
    workers: Array.from({ length: 4 }, (_, index) => ({
      key: `worker-${index}`,
      name: `Worker ${index}`,
      title: "Title",
      objective: "Objective",
      expectedDeliverable: "Deliverable",
      priority: "MEDIUM",
      dependsOn: [],
    })),
  };
}

describe("Agent plan transaction behavior", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists a Standard plan in six database statements regardless of Worker count", async () => {
    const calls: string[] = [];
    const delayed = <T>(name: string, value: T) => async () => {
      calls.push(name);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return value;
    };
    const transaction = {
      $queryRaw: vi.fn(delayed("lock", [{ id: "run-1" }])),
      agentRun: {
        findFirst: vi.fn(delayed("run.find", { id: "run-1", plannedWorkerCount: 4, _count: { workers: 0 } })),
        update: vi.fn(delayed("run.update", {})),
      },
      agentWorker: { createMany: vi.fn(delayed("workers.createMany", { count: 4 })) },
      agentEvent: {
        findFirst: vi.fn(delayed("events.latest", null)),
        createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
          calls.push("events.createMany");
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { count: data.length };
        }),
      },
    };
    mocks.transaction.mockImplementation(async (work: (client: unknown) => Promise<unknown>) => work(transaction));

    const startedAt = performance.now();
    const persisted = await persistAgentPlan({ userId: "user-1", runId: "run-1", plan: standardPlan(), fallback: false });

    expect(persisted).toBe(true);
    expect(calls).toEqual(["lock", "run.find", "workers.createMany", "run.update", "events.latest", "events.createMany"]);
    expect(transaction.agentWorker.createMany).toHaveBeenCalledOnce();
    expect(transaction.agentEvent.createMany).toHaveBeenCalledOnce();
    expect(transaction.agentEvent.createMany.mock.calls[0][0].data).toHaveLength(6);
    expect(performance.now() - startedAt).toBeLessThan(1_500);
  });
});
