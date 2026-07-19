"use client";

import { useEffect, useRef, useState } from "react";

export type RecoveryPhase = "idle" | "checking" | "background" | "settled" | "long-running";

export function createSingleFlight<T>(task: () => Promise<T>) {
  let inFlight: Promise<T> | undefined;
  return () => {
    if (!inFlight) {
      inFlight = task().finally(() => { inFlight = undefined; });
    }
    return inFlight;
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
  onSnapshot(snapshot: T): void;
}

export function useGenerationRecovery<T extends { status: string }>(input: UseGenerationRecoveryInput<T>) {
  const { storageKey, persistenceKey, runId, onRunId, statusUrl, statusSuffix } = input;
  const [phase, setPhase] = useState<RecoveryPhase>("idle");
  const callbackRef = useRef(input.onSnapshot);
  const readRunIdRef = useRef(input.readRunId);
  const writeRunIdRef = useRef(input.writeRunId);
  callbackRef.current = input.onSnapshot;
  readRunIdRef.current = input.readRunId;
  writeRunIdRef.current = input.writeRunId;

  useEffect(() => {
    if (runId) {
      if (writeRunIdRef.current) writeRunIdRef.current(runId);
      else if (storageKey) sessionStorage.setItem(storageKey, runId);
    }
    else {
      const restored = readRunIdRef.current?.() ?? (storageKey ? sessionStorage.getItem(storageKey) ?? undefined : undefined);
      if (restored) onRunId(restored);
    }
  }, [runId, storageKey, persistenceKey, onRunId]);

  useEffect(() => {
    if (!runId) return;
    let disposed = false;
    let timer: number | undefined;
    let requestController: AbortController | undefined;
    let failures = 0;
    const startedAt = Date.now();

    const schedule = (delayMs: number) => {
      if (disposed || document.visibilityState === "hidden") return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = undefined; void runCheck(); }, delayMs);
    };

    const check = async () => {
      if (disposed || document.visibilityState === "hidden") return;
      setPhase("checking");
      try {
        requestController = new AbortController();
        const response = await fetch(`${statusUrl}${runId}${statusSuffix ?? ""}`, { cache: "no-store", signal: requestController.signal });
        if (response.status === 401 || response.status === 404) {
          if (writeRunIdRef.current) writeRunIdRef.current(undefined);
          else if (storageKey) sessionStorage.removeItem(storageKey);
          setPhase("settled");
          return;
        }
        if (!response.ok) throw new Error("status unavailable");
        const snapshot = await response.json() as T;
        if (disposed) return;
        failures = 0;
        callbackRef.current(snapshot);
        if (snapshot.status === "PENDING") {
          const longRunning = Date.now() - startedAt > 10 * 60_000;
          setPhase(longRunning ? "long-running" : "background");
          schedule(longRunning ? 10_000 : 2_000);
        } else {
          if (writeRunIdRef.current) writeRunIdRef.current(undefined);
          else if (storageKey) sessionStorage.removeItem(storageKey);
          setPhase("settled");
        }
      } catch (error) {
        if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) {
          failures += 1;
          setPhase("background");
          schedule(Math.min(30_000, 2_000 * 2 ** Math.min(failures - 1, 4)));
        }
      } finally {
        requestController = undefined;
      }
    };
    const runCheck = createSingleFlight(check);

    const resume = () => {
      if (document.visibilityState === "hidden") {
        if (timer) window.clearTimeout(timer);
        timer = undefined;
        setPhase("background");
        return;
      }
      schedule(0);
    };
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    void runCheck();
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
      requestController?.abort();
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [runId, storageKey, persistenceKey, statusSuffix, statusUrl]);

  return phase;
}
