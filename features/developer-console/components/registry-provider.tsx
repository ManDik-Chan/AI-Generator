"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { createRegistryReadAdapter, type RegistryReadAdapter } from "@/features/developer-console/registry/adapter";
import type { OverviewSnapshot, ProjectSnapshot, ProjectStore, OverviewStore } from "@/features/developer-console/registry/store";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase/browser";

const RegistryContext = createContext<RegistryReadAdapter | null>(null);

/** Reads that are newer than this are reused when a screen mounts again. */
const REUSE_MS = 30_000;

/**
 * Reads the signed-in user's current access token from the existing Supabase browser session.
 * The token is returned to the read client for one request; it is not cached or stored here.
 */
async function currentAccessToken(): Promise<string | null> {
  const { data } = await createSupabaseBrowserClient().auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * One read-only Registry adapter per console visit. This provider is never nested inside the mock
 * ConsoleProvider: the Registry routes cannot reach the mock engine, and no mock state exists there.
 */
export function RegistryConsoleProvider({ children, adapter: injected }: { children: ReactNode; adapter?: RegistryReadAdapter }) {
  const [adapter] = useState(() => injected ?? createRegistryReadAdapter({
    fetch: (input, init) => globalThis.fetch(input, init),
    getAccessToken: currentAccessToken,
  }));
  return <RegistryContext.Provider value={adapter}>{children}</RegistryContext.Provider>;
}

export function useRegistryAdapter() {
  const adapter = useContext(RegistryContext);
  if (!adapter) throw new Error("useRegistryAdapter must be used inside <RegistryConsoleProvider>");
  return adapter;
}

function useStore<S>(store: { subscribe(listener: () => void): () => void; getSnapshot(): S; ensureFresh(ms: number): Promise<void> }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.ensureFresh(REUSE_MS); }, [store]);
  return snapshot;
}

export function useRegistryOverview(): { snapshot: OverviewSnapshot; store: OverviewStore } {
  const store = useRegistryAdapter().overview();
  return { snapshot: useStore(store), store };
}

export function useRegistryProject(projectId: string): { snapshot: ProjectSnapshot; store: ProjectStore } {
  const store = useRegistryAdapter().project(projectId);
  return { snapshot: useStore(store), store };
}

/** Wall-clock time that ticks every second, for deadlines on real data. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
