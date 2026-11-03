/*
 * Draft editing for one Registry project. Framework-free; React subscribes through
 * useSyncExternalStore.
 *
 * Two copies of the payload are kept apart:
 * - `base`: the latest draft the server confirmed, by a read or by a save response, with its ETag.
 * - `working`: what the user is editing, held only in this page's memory. Nothing is written to
 *   localStorage, sessionStorage, IndexedDB or any server other than the Registry itself.
 *
 * Rules:
 * - Every save is one logical operation with a new idempotency key, the exact serialized body and
 *   If-Match = base ETag (the draft head's ETag for the first save of an uninitialized draft).
 * - An uncertain outcome keeps that attempt. The store re-reads the draft once to verify it; the user
 *   can resend the identical attempt or abandon it. It is never shown as saved until confirmed.
 * - 412, and any reload that finds a different draft while there are unsaved edits, opens a conflict.
 *   Nothing is overwritten until the user chooses: keep their edits on top of the server version (the
 *   next save then targets the new ETag) or take the server version.
 * - FORBIDDEN, NOT_FOUND, AUTH_REQUIRED and DISABLED lock saving with the server's answer and keep
 *   the working copy. The project read is refreshed so access reflects the server's latest decision.
 * - A replayed success is followed by a head read before its revision is treated as the latest.
 */
import { MANIFEST_SCHEMA_VERSION } from "@/features/platform/manifest";
import type { DraftHeadRead, PayloadView, ProjectReadDTO, ReadError } from "@/features/developer-console/registry/contract";
import type { ReadResult, RegistryReadClient } from "@/features/developer-console/registry/client";
import { payloadIssues, samePayload, type UnknownReason, type WriteError } from "@/features/developer-console/registry/write-contract";
import { newIdempotencyKey, type DraftAttempt, type RegistryWriteClient } from "@/features/developer-console/registry/write-client";

export type DraftState = DraftHeadRead["state"];

export interface ServerDraft {
  draftId: string;
  etag: string;
  revision: number;
  state: DraftState;
  /** null: the draft exists but has never been initialized with content. */
  payload: PayloadView | null;
  /** Server JCS hash; only reads return it. */
  contentHash: string | null;
  confirmedAt: number;
  via: "read" | "save" | "verify";
}

export interface PendingSave {
  phase: "sending" | "unknown" | "verifying";
  attempt: DraftAttempt;
  /** The payload the attempt carries, parsed once. */
  payload: PayloadView;
  sends: number;
  reason: UnknownReason | null;
  /** Result of the last verification read while uncertain. */
  verification: "unchanged" | "unreadable" | null;
}

export type LastOutcome =
  | { kind: "saved"; at: number; revision: number; replayed: boolean; verified: boolean }
  | { kind: "rejected"; at: number; error: WriteError };

export interface DraftConflict {
  /** The draft now on the server; null if it could not be read. */
  remote: ServerDraft | null;
  readError: ReadError | null;
  cause: "precondition" | "changed-on-reload" | "after-unknown";
  at: number;
}

export interface EditorSnapshot {
  projectId: string;
  loading: boolean;
  loadError: ReadError | null;
  loadedAt: number | null;
  project: ProjectReadDTO | null;
  projectError: ReadError | null;
  base: ServerDraft | null;
  working: PayloadView | null;
  /** The working copy differs from what the server confirmed. */
  dirty: boolean;
  pending: PendingSave | null;
  last: LastOutcome | null;
  conflict: DraftConflict | null;
  /** A write answer that stops saving until the next successful read. */
  lock: (WriteError & { at: number }) | null;
  blockedUntil: number | null;
}

export interface DraftEditorStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): EditorSnapshot;
  /** Reads project, draft head and draft. Never discards unsaved edits. */
  load(): Promise<void>;
  ensureLoaded(): Promise<void>;
  edit(next: PayloadView): void;
  /** Working copy back to the confirmed server version (or the empty template). */
  discard(): void;
  save(): Promise<void>;
  retry(): Promise<void>;
  verify(): Promise<void>;
  abandon(): void;
  resolveConflict(choice: "keep-mine" | "take-remote"): void;
}

const LOCKING = new Set<WriteError["code"]>(["FORBIDDEN", "NOT_FOUND", "AUTH_REQUIRED", "DISABLED"]);
const REVOKING_READ = new Set<ReadError["code"]>(["FORBIDDEN", "NOT_FOUND", "AUTH_REQUIRED", "DISABLED"]);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Starting content for an uninitialized draft. The summary is left empty on purpose: it must be written. */
export function draftTemplate(projectId: string, slug: string): PayloadView {
  return {
    manifest: {
      schemaVersion: MANIFEST_SCHEMA_VERSION, projectId, slug, version: "0.1.0", name: slug, summary: "", category: "software",
      visibility: "PRIVATE", integration: { mode: "SHOWCASE" }, capabilities: ["documentation.read"], researchClaims: [],
    },
    presentation: { schemaVersion: MANIFEST_SCHEMA_VERSION, projectId, version: "0.1.0", title: slug, sections: [] },
    documentation: [],
  } as unknown as PayloadView;
}

export function createDraftEditorStore(read: RegistryReadClient, write: RegistryWriteClient, projectId: string,
  { now = Date.now, onSaved }: { now?: () => number; onSaved?: () => void } = {}): DraftEditorStore {
  let snapshot: EditorSnapshot = {
    projectId, loading: false, loadError: null, loadedAt: null, project: null, projectError: null, base: null, working: null,
    dirty: false, pending: null, last: null, conflict: null, lock: null, blockedUntil: null,
  };
  /** The template the working copy started from, for an uninitialized draft. */
  let template: PayloadView | null = null;
  const listeners = new Set<() => void>();

  const reference = (state: EditorSnapshot) => state.base?.payload ?? template;
  const isDirty = (state: EditorSnapshot) => state.working !== null && (reference(state) === null || !samePayload(state.working, reference(state)));
  const update = (change: (current: EditorSnapshot) => EditorSnapshot) => {
    const next = change(snapshot);
    snapshot = { ...next, dirty: isDirty(next), blockedUntil: write.blockedUntil() };
    listeners.forEach((listener) => listener());
  };

  const slug = () => snapshot.project?.slug ?? snapshot.base?.payload?.manifest.slug ?? null;
  const fromHead = (head: DraftHeadRead, etag: string, via: ServerDraft["via"]): ServerDraft =>
    ({ draftId: head.id, etag, revision: head.revision, state: head.state, payload: null, contentHash: null, confirmedAt: now(), via });

  /** Reads the server's current draft: the head, and the full draft when it has content. */
  async function readRemote(via: ServerDraft["via"]): Promise<ReadResult<ServerDraft>> {
    const head = await read.draftHead(projectId);
    if (!head.ok) return head;
    if (head.data.contentHash === null) return { ok: true, data: fromHead(head.data, head.etag!, via), etag: head.etag };
    const draft = await read.draft(projectId);
    if (!draft.ok) return draft;
    const { id, revision, state, payload, contentHash } = draft.data;
    return { ok: true, data: { draftId: id, etag: draft.etag!, revision, state, payload, contentHash, confirmedAt: now(), via }, etag: draft.etag };
  }

  async function readProject() {
    const result = await read.project(projectId);
    update((s) => result.ok
      ? { ...s, project: result.data, projectError: null }
      : { ...s, project: REVOKING_READ.has(result.error.code) ? null : s.project, projectError: result.error });
  }

  /** Takes a freshly read server draft without losing unsaved edits. */
  function adopt(remote: ServerDraft) {
    update((s) => {
      const startFrom = (draft: ServerDraft) => {
        if (draft.payload) return clone(draft.payload);
        const name = s.project?.slug ?? null;
        if (!name) return null;
        template = draftTemplate(projectId, name);
        return clone(template);
      };
      if (!s.base) return { ...s, base: remote, working: s.working ?? startFrom(remote) };
      if (remote.etag === s.base.etag) return { ...s, base: { ...s.base, contentHash: remote.contentHash ?? s.base.contentHash, confirmedAt: remote.confirmedAt } };
      if (!s.dirty) return { ...s, base: remote, working: startFrom(remote), conflict: null };
      if (remote.payload && s.working && samePayload(remote.payload, s.working)) return { ...s, base: remote };
      return { ...s, conflict: { remote, readError: null, cause: "changed-on-reload", at: now() } };
    });
  }

  async function load() {
    if (snapshot.loading) return;
    update((s) => ({ ...s, loading: true, loadError: null }));
    await readProject();
    const remote = await readRemote("read");
    if (!remote.ok) {
      update((s) => ({ ...s, loading: false, loadError: remote.error, loadedAt: now() }));
      return;
    }
    adopt(remote.data);
    update((s) => ({ ...s, loading: false, loadedAt: now(), lock: null }));
  }

  async function openConflict(cause: DraftConflict["cause"]) {
    const remote = await readRemote("read");
    update((s) => ({
      ...s,
      conflict: remote.ok
        ? (s.working && remote.data.payload && samePayload(remote.data.payload, s.working) ? null : { remote: remote.data, readError: null, cause, at: now() })
        : { remote: null, readError: remote.error, cause, at: now() },
      base: remote.ok && s.working && remote.data.payload && samePayload(remote.data.payload, s.working) ? remote.data : s.base,
    }));
  }

  async function verify() {
    const pending = snapshot.pending;
    if (!pending || pending.phase === "sending") return;
    update((s) => ({ ...s, pending: { ...pending, phase: "verifying" } }));
    const head = await read.draftHead(projectId);
    if (!head.ok) {
      update((s) => ({ ...s, pending: { ...pending, phase: "unknown", verification: "unreadable" } }));
      return;
    }
    if (head.etag === pending.attempt.ifMatch) {
      // The draft is still the version the attempt targeted: not applied yet, or still in flight.
      update((s) => ({ ...s, pending: { ...pending, phase: "unknown", verification: "unchanged" } }));
      return;
    }
    const remote = await readRemote("verify");
    if (!remote.ok) {
      update((s) => ({ ...s, pending: { ...pending, phase: "unknown", verification: "unreadable" } }));
      return;
    }
    if (remote.data.payload && samePayload(remote.data.payload, pending.payload)) {
      update((s) => ({ ...s, base: remote.data, pending: null, conflict: null, last: { kind: "saved", at: now(), revision: remote.data.revision, replayed: false, verified: true } }));
      onSaved?.();
      return;
    }
    // The draft changed to something else: either this attempt was overwritten or never applied.
    update((s) => ({ ...s, pending: null, conflict: { remote: remote.data, readError: null, cause: "after-unknown", at: now() } }));
  }

  async function send() {
    const pending = snapshot.pending!;
    update((s) => ({ ...s, pending: { ...pending, phase: "sending", sends: pending.sends + 1, verification: null } }));
    const outcome = await write.saveDraft(pending.attempt);
    if (outcome.kind === "ok") {
      const { data, etag, replayed } = outcome;
      update((s) => ({
        ...s, pending: null, lock: null, conflict: null,
        base: { draftId: data.id, etag: etag!, revision: data.revision, state: data.state, payload: data.payload, contentHash: null, confirmedAt: now(), via: "save" },
        last: { kind: "saved", at: now(), revision: data.revision, replayed, verified: !replayed },
      }));
      onSaved?.();
      if (replayed) {
        // A replay returns the original result; check whether the draft has moved on since.
        const head = await read.draftHead(projectId);
        if (head.ok && head.etag !== snapshot.base?.etag) {
          const remote = await readRemote("read");
          if (remote.ok) adopt(remote.data);
        } else if (head.ok) {
          update((s) => (s.last?.kind === "saved" ? { ...s, last: { ...s.last, verified: true } } : s));
        }
      }
      return;
    }
    if (outcome.kind === "unknown") {
      update((s) => ({ ...s, pending: s.pending ? { ...s.pending, phase: "unknown", reason: outcome.reason, verification: null } : s.pending }));
      await verify();
      return;
    }
    const { error } = outcome;
    update((s) => ({
      ...s, pending: null, last: { kind: "rejected", at: now(), error },
      lock: LOCKING.has(error.code) ? { ...error, at: now() } : s.lock,
    }));
    if (error.code === "PRECONDITION_FAILED") await openConflict("precondition");
    else if (error.code === "CONFLICT" || error.code === "REPLAY_STALE" || error.code === "IDEMPOTENCY_CONFLICT") {
      await readProject();
      const remote = await readRemote("read");
      if (remote.ok) adopt(remote.data);
    } else if (error.code === "FORBIDDEN" || error.code === "NOT_FOUND") await readProject();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: () => snapshot,
    load,
    async ensureLoaded() {
      if (snapshot.loadedAt === null && !snapshot.loading) await load();
    },
    edit(next) {
      update((s) => ({ ...s, working: next }));
    },
    discard() {
      if (snapshot.pending?.phase === "sending" || snapshot.pending?.phase === "verifying") return;
      update((s) => ({ ...s, working: s.base?.payload ? clone(s.base.payload) : template ? clone(template) : s.working, conflict: null }));
    },
    async save() {
      const s = snapshot;
      if (!s.base || !s.working || s.pending || s.conflict || s.lock || write.blockedUntil() !== null) return;
      const name = slug();
      if (!name || payloadIssues(s.working, { projectId, slug: name }).length) return;
      const payload = clone(s.working);
      snapshot = { ...s, pending: { phase: "sending", attempt: { key: newIdempotencyKey("draft"), body: JSON.stringify(payload), ifMatch: s.base.etag, projectId }, payload, sends: 0, reason: null, verification: null } };
      await send();
    },
    async retry() {
      if (snapshot.pending?.phase !== "unknown") return;
      await send();
    },
    verify,
    abandon() {
      if (snapshot.pending?.phase !== "unknown") return;
      update((s) => ({ ...s, pending: null }));
    },
    resolveConflict(choice) {
      const conflict = snapshot.conflict;
      if (!conflict?.remote) return;
      const remote = conflict.remote;
      update((s) => {
        if (choice === "keep-mine") return { ...s, base: remote, conflict: null };
        const working = remote.payload ? clone(remote.payload) : template ? clone(template) : s.working;
        return { ...s, base: remote, working, conflict: null };
      });
    },
  };
}
