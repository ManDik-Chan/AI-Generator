/*
 * Registry write mode of the developer console: exactly two commands, creating a project and saving
 * a complete draft, sent to the P1-C2 internal write API with the signed-in user's Bearer token.
 *
 * It sits next to the read adapter, never inside the mock ConsoleProvider, and has no fallback: a
 * closed write switch, a missing qualification or an unreachable server is shown as such. The generic
 * ConsoleAdapter command seam of the read adapter (review, seal, release, assets) stays refused.
 */
import type { RegistryReadAdapter } from "@/features/developer-console/registry/adapter";
import { createProjectCreateStore, type CreateStore } from "@/features/developer-console/registry/create-store";
import { createDraftEditorStore, type DraftEditorStore } from "@/features/developer-console/registry/draft-editor";
import { createRegistryWriteClient, type RegistryWriteClient, type RegistryWriteClientOptions } from "@/features/developer-console/registry/write-client";

export interface RegistryWriteAdapter {
  readonly source: "registry";
  readonly client: RegistryWriteClient;
  creator(): CreateStore;
  editor(projectId: string): DraftEditorStore;
}

const MAX_EDITORS = 20;

export function createRegistryWriteAdapter(read: RegistryReadAdapter, options: RegistryWriteClientOptions): RegistryWriteAdapter {
  const client = createRegistryWriteClient(options);
  const now = options.now ?? Date.now;
  let creator: CreateStore | null = null;
  const editors = new Map<string, DraftEditorStore>();
  return {
    source: "registry",
    client,
    creator: () => (creator ??= createProjectCreateStore(client, { now, onCreated: () => void read.overview().refresh() })),
    editor(projectId) {
      const key = projectId.toLowerCase();
      let store = editors.get(key);
      if (!store) {
        // Editors with unsaved work are never evicted; only clean ones make room.
        if (editors.size >= MAX_EDITORS) {
          for (const [id, editor] of editors) {
            const s = editor.getSnapshot();
            if (!s.dirty && !s.pending) { editors.delete(id); break; }
          }
        }
        store = createDraftEditorStore(read.client, client, key, { now, onSaved: () => read.project(key).invalidate() });
        editors.set(key, store);
      }
      return store;
    },
  };
}
