"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { createRegistryReadAdapter, type RegistryReadAdapter } from "@/features/developer-console/registry/adapter";
import type { CreateSnapshot, CreateStore } from "@/features/developer-console/registry/create-store";
import type { DraftEditorStore, EditorSnapshot } from "@/features/developer-console/registry/draft-editor";
import type { OverviewSnapshot, ProjectSnapshot, ProjectStore, OverviewStore } from "@/features/developer-console/registry/store";
import { createRegistryWriteAdapter, type RegistryWriteAdapter } from "@/features/developer-console/registry/write-adapter";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase/browser";

const RegistryContext = createContext<RegistryReadAdapter | null>(null);
const RegistryWriteContext = createContext<RegistryWriteAdapter | null>(null);

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
 * One Registry read adapter and one write adapter per console visit; the write adapter holds unsaved
 * drafts in memory for as long as this layout stays mounted. This provider is never nested inside the mock
 * ConsoleProvider: the Registry routes cannot reach the mock engine, and no mock state exists there.
 */
export function RegistryConsoleProvider({ children, adapter: injected, writer: injectedWriter }: { children: ReactNode; adapter?: RegistryReadAdapter; writer?: RegistryWriteAdapter }) {
  const [adapters] = useState(() => {
    const options = { fetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init), getAccessToken: currentAccessToken };
    const read = injected ?? createRegistryReadAdapter(options);
    return { read, write: injectedWriter ?? createRegistryWriteAdapter(read, options) };
  });
  return (
    <RegistryContext.Provider value={adapters.read}>
      <RegistryWriteContext.Provider value={adapters.write}>{children}</RegistryWriteContext.Provider>
    </RegistryContext.Provider>
  );
}

export function useRegistryWriter() {
  const writer = useContext(RegistryWriteContext);
  if (!writer) throw new Error("useRegistryWriter must be used inside <RegistryConsoleProvider>");
  return writer;
}

export function useRegistryCreate(): { snapshot: CreateSnapshot; store: CreateStore } {
  const store = useRegistryWriter().creator();
  return { snapshot: useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot), store };
}

export function useDraftEditor(projectId: string): { snapshot: EditorSnapshot; store: DraftEditorStore } {
  const store = useRegistryWriter().editor(projectId);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.ensureLoaded(); }, [store]);
  return { snapshot, store };
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
