import { describe, expect, it, vi } from "vitest";

import { createSingleFlight } from "@/features/generation/use-generation-recovery";

describe("generation recovery single-flight", () => {
  it("coalesces concurrent timer/focus/pageshow checks into one request", async () => {
    let resolve!: () => void;
    const task = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }))
      .mockResolvedValue(undefined);
    const check = createSingleFlight(task);

    const timer = check();
    const focus = check();
    const pageshow = check();
    expect(task).toHaveBeenCalledOnce();
    expect(timer).toBe(focus);
    expect(focus).toBe(pageshow);

    resolve();
    await timer;
    await check();
    expect(task).toHaveBeenCalledTimes(2);
  });
});
