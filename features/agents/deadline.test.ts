import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentRunDeadline } from "@/features/agents/deadline";

describe("Agent run deadline", () => {
  afterEach(() => vi.useRealTimers());

  it("marks the hard deadline as a timeout", async () => {
    vi.useFakeTimers();
    const cancellation = new AbortController();
    const deadline = createAgentRunDeadline(cancellation.signal, 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.didTimeout()).toBe(true);
    deadline.dispose();
  });

  it("keeps explicit cancellation distinct from timeout", () => {
    const cancellation = new AbortController();
    const deadline = createAgentRunDeadline(cancellation.signal, 10_000);
    cancellation.abort();
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.didTimeout()).toBe(false);
    deadline.dispose();
  });
});
