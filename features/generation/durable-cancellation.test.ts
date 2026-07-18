import { afterEach, describe, expect, it, vi } from "vitest";

import { createDurableCancellationController } from "@/features/generation/durable-cancellation";

describe("durable cancellation controller", () => {
  afterEach(() => vi.useRealTimers());

  it("aborts a Provider signal after the persisted state stops being PENDING", async () => {
    vi.useFakeTimers();
    const isPending = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const cancellation = await createDurableCancellationController({ isPending, intervalMs: 250, taskType: "AGENT", taskId: "run-1" });

    expect(cancellation.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(250);
    expect(cancellation.signal.aborted).toBe(true);
    expect(isPending).toHaveBeenCalledTimes(2);
    cancellation.dispose();
  });

  it("checks durable state before Provider work starts", async () => {
    const cancellation = await createDurableCancellationController({ isPending: async () => false, taskType: "TEST", taskId: "run" });
    expect(cancellation.signal.aborted).toBe(true);
    cancellation.dispose();
  });

  it("does not cancel when a polling query fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cancellation = await createDurableCancellationController({ isPending: async () => { throw new Error("database unavailable"); }, taskType: "TEST", taskId: "run" });
    expect(cancellation.signal.aborted).toBe(false);
    expect(warn).toHaveBeenCalledWith("durable_cancellation_check_failed", expect.objectContaining({ taskType: "TEST", taskId: "run", errorCode: "Error" }));
    cancellation.dispose();
    warn.mockRestore();
  });
});
