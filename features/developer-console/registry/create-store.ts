/*
 * State of "create a Registry project" for one console visit. Framework-free.
 *
 * - Creation eligibility (`can_create`) is not exposed by any read endpoint, so the console cannot
 *   know it in advance. The server decides on submit. After FORBIDDEN or DISABLED the store keeps a
 *   sticky `denied` outcome for the rest of the visit and the UI stops offering the form.
 * - Each submit is one logical operation with a new key. An uncertain outcome keeps the attempt; the
 *   only way forward is to resend the identical attempt (a replay returns the original project) or to
 *   abandon it explicitly. The slug cannot be changed while an attempt is uncertain.
 */
import type { WriteError, UnknownReason, CreatedProject } from "@/features/developer-console/registry/write-contract";
import { SLUG_PATTERN } from "@/features/developer-console/registry/write-contract";
import { newIdempotencyKey, type RegistryWriteClient, type WriteAttempt } from "@/features/developer-console/registry/write-client";

export type CreatePhase = "idle" | "sending" | "unknown" | "created" | "rejected";

export interface CreateSnapshot {
  phase: CreatePhase;
  /** The attempt in flight or awaiting resolution; null once it is settled. */
  attempt: (WriteAttempt & { slug: string }) | null;
  /** How many times the current attempt was sent. */
  sends: number;
  unknownReason: UnknownReason | null;
  created: (CreatedProject & { replayed: boolean; at: number }) | null;
  error: WriteError | null;
  /** FORBIDDEN or DISABLED from the server: no further create is offered in this visit. */
  denied: (WriteError & { at: number }) | null;
  blockedUntil: number | null;
}

export interface CreateStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): CreateSnapshot;
  submit(slug: string): Promise<void>;
  /** Resends the uncertain attempt unchanged. */
  retry(): Promise<void>;
  /** Drops an uncertain attempt; the next submit uses a new key. */
  abandon(): void;
  /** Back to an empty form after a settled result. */
  reset(): void;
}

export function createProjectCreateStore(client: RegistryWriteClient, { now = Date.now, onCreated }: { now?: () => number; onCreated?: (project: CreatedProject) => void } = {}): CreateStore {
  let snapshot: CreateSnapshot = { phase: "idle", attempt: null, sends: 0, unknownReason: null, created: null, error: null, denied: null, blockedUntil: null };
  const listeners = new Set<() => void>();
  const update = (change: Partial<CreateSnapshot>) => {
    snapshot = { ...snapshot, ...change, blockedUntil: client.blockedUntil() };
    listeners.forEach((listener) => listener());
  };

  async function send() {
    const attempt = snapshot.attempt!;
    update({ phase: "sending", sends: snapshot.sends + 1, error: null });
    const outcome = await client.createProject(attempt);
    if (outcome.kind === "ok") {
      update({ phase: "created", attempt: null, sends: 0, unknownReason: null, created: { ...outcome.data, replayed: outcome.replayed, at: now() } });
      onCreated?.(outcome.data);
      return;
    }
    if (outcome.kind === "unknown") {
      update({ phase: "unknown", unknownReason: outcome.reason });
      return;
    }
    const { error } = outcome;
    const denied = error.code === "FORBIDDEN" || error.code === "DISABLED" ? { ...error, at: now() } : snapshot.denied;
    // A definite refusal settles the operation; its key is not reused.
    update({ phase: "rejected", attempt: null, sends: 0, unknownReason: null, error, denied });
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: () => snapshot,
    async submit(slug) {
      if (snapshot.denied || snapshot.phase === "sending" || snapshot.phase === "unknown") return;
      if (!SLUG_PATTERN.test(slug)) {
        update({ phase: "rejected", error: { code: "INVALID_INPUT", status: 0 } });
        return;
      }
      snapshot = { ...snapshot, attempt: { key: newIdempotencyKey("create"), body: JSON.stringify({ slug }), slug }, sends: 0, created: null };
      await send();
    },
    async retry() {
      if (snapshot.phase !== "unknown" || !snapshot.attempt) return;
      await send();
    },
    abandon() {
      if (snapshot.phase !== "unknown") return;
      update({ phase: "idle", attempt: null, sends: 0, unknownReason: null });
    },
    reset() {
      if (snapshot.phase === "sending" || snapshot.phase === "unknown") return;
      update({ phase: "idle", attempt: null, sends: 0, unknownReason: null, created: null, error: null });
    },
  };
}
