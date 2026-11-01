/*
 * Registry read-only console adapter.
 *
 * It shares `execute` / `replay` with the ConsoleAdapter seam (../adapter.ts) only to refuse them:
 * there is no internal Registry HTTP write route yet, and this mode must never fall back to the
 * in-browser mock engine or pretend a command succeeded. Both methods reject without touching the
 * network. Reads go through the GET-only client and the stores in ./store.
 */
import type { ConsoleAdapter } from "@/features/developer-console/adapter";
import { createRegistryReadClient, type RegistryReadClient, type RegistryReadClientOptions } from "@/features/developer-console/registry/client";
import { createOverviewStore, createProjectStore, type OverviewStore, type ProjectStore } from "@/features/developer-console/registry/store";

export class RegistryWritesUnavailableError extends Error {
  readonly code = "READ_ONLY" as const;
  constructor(readonly action: string) {
    super("The Registry console mode is read-only; no write command is sent.");
    this.name = "RegistryWritesUnavailableError";
  }
}

export interface RegistryReadAdapter extends Pick<ConsoleAdapter, "execute" | "replay"> {
  readonly source: "registry";
  readonly readOnly: true;
  /** Persona switching and simulated environments exist only on the mock. */
  readonly tools: null;
  readonly client: RegistryReadClient;
  overview(): OverviewStore;
  project(projectId: string): ProjectStore;
}

const MAX_PROJECT_STORES = 20;

export function createRegistryReadAdapter(options: RegistryReadClientOptions): RegistryReadAdapter {
  const client = createRegistryReadClient(options);
  const now = options.now ?? Date.now;
  let overview: OverviewStore | null = null;
  const projects = new Map<string, ProjectStore>();
  return {
    source: "registry",
    readOnly: true,
    tools: null,
    client,
    overview: () => (overview ??= createOverviewStore(client, { now })),
    project(projectId) {
      const key = projectId.toLowerCase();
      let store = projects.get(key);
      if (!store) {
        if (projects.size >= MAX_PROJECT_STORES) projects.delete(projects.keys().next().value!);
        store = createProjectStore(client, projectId, { now });
        projects.set(key, store);
      }
      return store;
    },
    execute: (command) => Promise.reject(new RegistryWritesUnavailableError(command.action)),
    replay: () => Promise.reject(new RegistryWritesUnavailableError("REPLAY")),
  };
}
