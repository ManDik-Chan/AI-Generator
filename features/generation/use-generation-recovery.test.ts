import { describe, expect, it, vi } from "vitest";

import { createRecoveryCoordinator, createSingleFlight, RecoveryStopError, type RecoveryPhase } from "@/features/generation/use-generation-recovery";

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

describe("generation recovery terminal synchronization", () => {
  function setup(
    statuses: string[],
    onSnapshot: (snapshot: { status: string }, signal: AbortSignal) => void | Promise<void> = vi.fn(async () => undefined),
  ) {
    const scheduled: Array<() => void> = [];
    const phases: RecoveryPhase[] = [];
    const settled = vi.fn();
    const fetchSnapshot = vi.fn(async () => ({ status: statuses.shift() ?? "COMPLETE" }));
    const coordinator = createRecoveryCoordinator({
      fetchSnapshot,
      onSnapshot,
      onSettled: settled,
      onPhase: (phase) => phases.push(phase),
      schedule: (_delay, task) => scheduled.push(task),
      cancelSchedule: vi.fn(),
    });
    return { coordinator, fetchSnapshot, onSnapshot, phases, scheduled, settled };
  }

  it("polls PENDING, awaits one terminal hydration, then settles and stops", async () => {
    const terminalFetch = vi.fn(async () => undefined);
    const onSnapshot = vi.fn(async (snapshot: { status: string }) => {
      if (snapshot.status !== "PENDING") await terminalFetch();
    });
    const recovery = setup(["PENDING", "COMPLETE"], onSnapshot);

    await recovery.coordinator.check();
    expect(recovery.settled).not.toHaveBeenCalled();
    expect(recovery.scheduled).toHaveLength(1);
    recovery.scheduled.shift()?.();
    await vi.waitFor(() => expect(recovery.settled).toHaveBeenCalledOnce());

    expect(recovery.fetchSnapshot).toHaveBeenCalledTimes(2);
    expect(terminalFetch).toHaveBeenCalledOnce();
    await recovery.coordinator.check();
    expect(recovery.fetchSnapshot).toHaveBeenCalledTimes(2);
  });

  it("keeps the recovery record and retries cached terminal hydration with bounded backoff", async () => {
    const onSnapshot = vi.fn()
      .mockRejectedValueOnce(new Error("terminal unavailable"))
      .mockResolvedValueOnce(undefined);
    const recovery = setup(["COMPLETE"], onSnapshot);

    await recovery.coordinator.check();
    expect(recovery.settled).not.toHaveBeenCalled();
    expect(recovery.fetchSnapshot).toHaveBeenCalledOnce();
    expect(recovery.scheduled).toHaveLength(1);
    recovery.scheduled.shift()?.();
    await vi.waitFor(() => expect(recovery.settled).toHaveBeenCalledOnce());

    expect(recovery.fetchSnapshot).toHaveBeenCalledOnce();
    expect(onSnapshot).toHaveBeenCalledTimes(2);
  });

  it("stops safely on 401/404 semantics", async () => {
    const recovery = setup([]);
    recovery.fetchSnapshot.mockRejectedValueOnce(new RecoveryStopError());
    await recovery.coordinator.check();
    expect(recovery.settled).toHaveBeenCalledOnce();
    expect(recovery.scheduled).toHaveLength(0);
  });

  it("aborts an in-flight terminal sync without settling or publishing later state", async () => {
    let release!: () => void;
    const onSnapshot = vi.fn((_snapshot: { status: string }, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
      release = resolve;
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const recovery = setup(["COMPLETE"], onSnapshot);
    const check = recovery.coordinator.check();
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledOnce());
    recovery.coordinator.dispose();
    release();
    await check;
    expect(recovery.settled).not.toHaveBeenCalled();
    expect(recovery.phases).not.toContain("settled");
  });
});
