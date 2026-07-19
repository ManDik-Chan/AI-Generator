"use client";

import { useEffect, useRef, useState } from "react";

export type RecoveryPhase = "idle" | "checking" | "background" | "settled" | "long-running";

export class RecoveryStopError extends Error {
  constructor() {
    super("Recovery record is no longer available.");
    this.name = "RecoveryStopError";
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function createSingleFlight<T>(task: () => Promise<T>) {
  let inFlight: Promise<T> | undefined;
  return () => {
    if (!inFlight) {
      inFlight = task().finally(() => { inFlight = undefined; });
    }
    return inFlight;
  };
}

interface RecoveryCoordinatorInput<T extends { status: string }> {
  fetchSnapshot(signal: AbortSignal): Promise<T>;
  onSnapshot(snapshot: T, signal: AbortSignal): void | Promise<void>;
  onSettled(): void;
  onPhase(phase: RecoveryPhase): void;
  schedule(delayMs: number, task: () => void): void;
  cancelSchedule(): void;
  now?(): number;
}

export function createRecoveryCoordinator<T extends { status: string }>(input: RecoveryCoordinatorInput<T>) {
  let disposed = false;
  let settled = false;
  let requestController: AbortController | undefined;
  let failures = 0;
  let terminalSnapshot: T | undefined;
  const startedAt = (input.now ?? Date.now)();

  const scheduleRetry = () => {
    failures += 1;
    input.onPhase("background");
    input.schedule(Math.min(30_000, 2_000 * 2 ** Math.min(failures - 1, 4)), () => { void runCheck(); });
  };

  const check = async () => {
    if (disposed || settled) return;
    input.onPhase("checking");
    try {
      requestController = new AbortController();
      const snapshot = terminalSnapshot ?? await input.fetchSnapshot(requestController.signal);
      if (disposed) return;
      if (snapshot.status !== "PENDING") terminalSnapshot = snapshot;
      await input.onSnapshot(snapshot, requestController.signal);
      if (disposed) return;
      failures = 0;
      if (snapshot.status === "PENDING") {
        const longRunning = (input.now ?? Date.now)() - startedAt > 10 * 60_000;
        input.onPhase(longRunning ? "long-running" : "background");
        input.schedule(longRunning ? 10_000 : 2_000, () => { void runCheck(); });
      } else {
        settled = true;
        input.cancelSchedule();
        input.onSettled();
        input.onPhase("settled");
      }
    } catch (error) {
      if (disposed || isAbortError(error)) return;
      if (error instanceof RecoveryStopError) {
        settled = true;
        input.cancelSchedule();
        input.onSettled();
        input.onPhase("settled");
        return;
      }
      scheduleRetry();
    } finally {
      requestController = undefined;
    }
  };
  const runCheck = createSingleFlight(check);

  return {
    check: runCheck,
    cancelScheduled: input.cancelSchedule,
    dispose() {
      disposed = true;
      input.cancelSchedule();
      requestController?.abort();
    },
  };
}

interface UseGenerationRecoveryInput<T extends { status: string }> {
  storageKey?: string;
  persistenceKey?: string;
  readRunId?(): string | undefined;
  writeRunId?(runId?: string): void;
  runId?: string;
  onRunId(runId: string): void;
  statusUrl: string;
  statusSuffix?: string;
  onSnapshot(snapshot: T, context: { signal: AbortSignal }): void | Promise<void>;
  onSettled?(): void;
}

export function useGenerationRecovery<T extends { status: string }>(input: UseGenerationRecoveryInput<T>) {
  const { storageKey, persistenceKey, runId, onRunId, statusUrl, statusSuffix } = input;
  const [phase, setPhase] = useState<RecoveryPhase>("idle");
  const callbackRef = useRef(input.onSnapshot);
  const readRunIdRef = useRef(input.readRunId);
  const writeRunIdRef = useRef(input.writeRunId);
  const settledRef = useRef(input.onSettled);
  callbackRef.current = input.onSnapshot;
  readRunIdRef.current = input.readRunId;
  writeRunIdRef.current = input.writeRunId;
  settledRef.current = input.onSettled;

  useEffect(() => {
    if (runId) {
      if (writeRunIdRef.current) writeRunIdRef.current(runId);
      else if (storageKey) sessionStorage.setItem(storageKey, runId);
    } else {
      const restored = readRunIdRef.current?.() ?? (storageKey ? sessionStorage.getItem(storageKey) ?? undefined : undefined);
      if (restored) onRunId(restored);
    }
  }, [runId, storageKey, persistenceKey, onRunId]);

  useEffect(() => {
    if (!runId) return;
    let timer: number | undefined;
    const cancelSchedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = undefined;
    };
    const coordinator = createRecoveryCoordinator<T>({
      fetchSnapshot: async (signal) => {
        const response = await fetch(`${statusUrl}${runId}${statusSuffix ?? ""}`, { cache: "no-store", signal });
        if (response.status === 401 || response.status === 404) throw new RecoveryStopError();
        if (!response.ok) throw new Error("status unavailable");
        return response.json() as Promise<T>;
      },
      onSnapshot: (snapshot, signal) => callbackRef.current(snapshot, { signal }),
      onSettled: () => {
        if (writeRunIdRef.current) writeRunIdRef.current(undefined);
        else if (storageKey) sessionStorage.removeItem(storageKey);
        settledRef.current?.();
      },
      onPhase: setPhase,
      cancelSchedule,
      schedule: (delayMs, task) => {
        if (document.visibilityState === "hidden") return;
        cancelSchedule();
        timer = window.setTimeout(() => { timer = undefined; task(); }, delayMs);
      },
    });

    const resume = () => {
      if (document.visibilityState === "hidden") {
        coordinator.cancelScheduled();
        setPhase("background");
        return;
      }
      void coordinator.check();
    };
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    void coordinator.check();
    return () => {
      coordinator.dispose();
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [runId, storageKey, persistenceKey, statusSuffix, statusUrl]);

  return phase;
}
