import { describe, expect, it } from "vitest";

import { getBlockedWorkers, getRunnableWorkers, runWorkerPool } from "@/features/agents/worker-pool";

describe("Agent Worker pool", () => {
  it("runs independent tasks with a strict concurrency maximum and preserves result slots", async () => {
    let active = 0;
    let maximum = 0;
    const completion: number[] = [];
    const tasks = [30, 5, 15, 1].map((delay, index) => async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      completion.push(index);
      active -= 1;
      return index;
    });
    const results = await runWorkerPool(tasks, 2);
    expect(maximum).toBe(2);
    expect(completion).not.toEqual([0, 1, 2, 3]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled", "fulfilled", "fulfilled"]);
  });

  it("waits for dependencies and blocks downstream failures deterministically", () => {
    const queued = [
      { key: "root", status: "QUEUED" as const, dependsOnKeys: [] },
      { key: "child", status: "QUEUED" as const, dependsOnKeys: ["root"] },
    ];
    expect(getRunnableWorkers(queued).map((worker) => worker.key)).toEqual(["root"]);
    expect(getRunnableWorkers([{ ...queued[0], status: "COMPLETE" as const }, queued[1]]).map((worker) => worker.key)).toEqual(["child"]);
    expect(getBlockedWorkers([{ ...queued[0], status: "ERROR" as const }, queued[1]]).map((worker) => worker.key)).toEqual(["child"]);
  });
});
