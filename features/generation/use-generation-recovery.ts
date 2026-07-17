"use client";

import { useEffect, useRef, useState } from "react";

export type RecoveryPhase = "idle" | "checking" | "background" | "settled" | "long-running";

interface UseGenerationRecoveryInput<T extends { status: string }> {
  storageKey: string;
  runId?: string;
  onRunId(runId: string): void;
  statusUrl: string;
  statusSuffix?: string;
  onSnapshot(snapshot: T): void;
}

export function useGenerationRecovery<T extends { status: string }>(input: UseGenerationRecoveryInput<T>) {
  const { storageKey, runId, onRunId, statusUrl, statusSuffix } = input;
  const [phase, setPhase] = useState<RecoveryPhase>("idle");
  const callbackRef = useRef(input.onSnapshot);
  callbackRef.current = input.onSnapshot;

  useEffect(() => {
    if (runId) sessionStorage.setItem(storageKey, runId);
    else {
      const restored = sessionStorage.getItem(storageKey);
      if (restored) onRunId(restored);
    }
  }, [runId, storageKey, onRunId]);

  useEffect(() => {
    if (!runId) return;
    let disposed = false;
    let timer: number | undefined;
    const startedAt = Date.now();

    const check = async () => {
      if (disposed || document.visibilityState === "hidden") return;
      if (Date.now() - startedAt > 30 * 60_000) {
        setPhase("long-running");
        return;
      }
      setPhase("checking");
      try {
        const response = await fetch(`${statusUrl}${runId}${statusSuffix ?? ""}`, { cache: "no-store" });
        if (!response.ok) throw new Error("status unavailable");
        const snapshot = await response.json() as T;
        if (disposed) return;
        callbackRef.current(snapshot);
        if (snapshot.status === "PENDING") {
          setPhase(Date.now() - startedAt > 10 * 60_000 ? "long-running" : "background");
          timer = window.setTimeout(check, 1500);
        } else {
          sessionStorage.removeItem(storageKey);
          setPhase("settled");
        }
      } catch {
        if (!disposed) {
          setPhase("background");
          timer = window.setTimeout(check, 2000);
        }
      }
    };

    const resume = () => { if (document.visibilityState !== "hidden") void check(); };
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    void check();
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [runId, storageKey, statusSuffix, statusUrl]);

  return phase;
}
