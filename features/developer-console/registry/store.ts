/*
 * Read-only state for the Registry console mode. Framework-free; React subscribes through
 * useSyncExternalStore.
 *
 * Every section has its own outcome, so a missing READ_RELEASE qualification blocks only the
 * Release sections while Draft reads still load. After AUTH_REQUIRED or DISABLED every section is
 * cleared: nothing read under a session that is no longer valid, or from a switched-off API, stays
 * on screen. After FORBIDDEN or NOT_FOUND the affected section is cleared. Transient failures
 * (409 conflict, 429, 503, network, contract mismatch) keep the last good data, labelled with its
 * read time. Lists restart from the first page on refresh and append exclusive-cursor pages on
 * "load more"; they are kept in server (UUID) order here and ordered for display in view.ts.
 */
import {
  REVOKING_CODES,
  type DraftHeadRead, type DraftRead, type Page, type ProjectReadDTO, type ProjectSummaryDTO, type QualificationDTO, type ReadError,
  type ReleaseHeadRead, type ReleaseRecordDTO, type ReleaseRequestDTO, type ReviewDTO, type VersionRead,
} from "@/features/developer-console/registry/contract";
import { DEFAULT_PAGE_SIZE, type ReadResult, type RegistryReadClient } from "@/features/developer-console/registry/client";

export type SlotStatus = "idle" | "loading" | "ready" | "error";

export interface Slot<T> {
  status: SlotStatus;
  /** Last successful read that may still be shown; null after a revoking error. */
  data: T | null;
  etag: string | null;
  readAt: number | null;
  error: ReadError | null;
  /** The ETag differs from the one returned by the previous successful read. */
  changed: boolean;
}

export interface ListSlot<T> {
  status: SlotStatus;
  items: T[];
  nextCursor: string | null;
  readAt: number | null;
  error: ReadError | null;
  loadingMore: boolean;
  /** Failure of the latest "load more"; the loaded items stay valid. */
  moreError: ReadError | null;
}

export interface ProjectSnapshot {
  projectId: string;
  refreshing: boolean;
  lastRefresh: number | null;
  /** AUTH_REQUIRED or DISABLED: applies to every section. */
  gate: ReadError | null;
  blockedUntil: number | null;
  project: Slot<ProjectReadDTO>;
  draftHead: Slot<DraftHeadRead>;
  draft: Slot<DraftRead>;
  reviews: ListSlot<ReviewDTO>;
  versions: ListSlot<VersionRead>;
  releaseHead: Slot<ReleaseHeadRead>;
  releases: ListSlot<ReleaseRecordDTO>;
  requests: ListSlot<ReleaseRequestDTO>;
}

export interface OverviewSnapshot {
  refreshing: boolean;
  lastRefresh: number | null;
  gate: ReadError | null;
  blockedUntil: number | null;
  qualifications: Slot<QualificationDTO[]>;
  projects: ListSlot<ProjectSummaryDTO>;
}

export interface ReadStore<S, K extends string> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): S;
  refresh(): Promise<void>;
  /** Refreshes only when never read or the last read is older than `maxAgeMs`. */
  ensureFresh(maxAgeMs: number): Promise<void>;
  loadMore(key: K): Promise<void>;
}

export type ProjectListKey = "reviews" | "versions" | "releases" | "requests";
export type ProjectStore = ReadStore<ProjectSnapshot, ProjectListKey>;
export type OverviewStore = ReadStore<OverviewSnapshot, "projects">;

export const isGate = (error: ReadError | null) => error !== null && (error.code === "AUTH_REQUIRED" || error.code === "DISABLED");
const clears = (error: ReadError) => REVOKING_CODES.has(error.code) || error.code === "DRAFT_UNINITIALIZED";

const idleSlot = <T>(): Slot<T> => ({ status: "idle", data: null, etag: null, readAt: null, error: null, changed: false });
const idleList = <T>(): ListSlot<T> => ({ status: "idle", items: [], nextCursor: null, readAt: null, error: null, loadingMore: false, moreError: null });
const loadingSlot = <T>(slot: Slot<T>): Slot<T> => ({ ...slot, status: "loading", error: null });
const loadingList = <T>(slot: ListSlot<T>): ListSlot<T> => ({ ...slot, status: "loading", error: null, loadingMore: false, moreError: null });

function settleSlot<T>(slot: Slot<T>, result: ReadResult<T>, at: number): Slot<T> {
  if (result.ok) {
    return { status: "ready", data: result.data, etag: result.etag, readAt: at, error: null, changed: slot.etag !== null && result.etag !== null && slot.etag !== result.etag };
  }
  return clears(result.error)
    ? { status: "error", data: null, etag: null, readAt: null, error: result.error, changed: false }
    : { ...slot, status: "error", error: result.error };
}

function settleList<T>(slot: ListSlot<T>, result: ReadResult<Page<T>>, at: number): ListSlot<T> {
  if (result.ok) return { ...idleList<T>(), status: "ready", items: result.data.items, nextCursor: result.data.nextCursor, readAt: at };
  return clears(result.error) ? { ...idleList<T>(), status: "error", error: result.error } : { ...slot, status: "error", error: result.error, loadingMore: false };
}

function appendPage<T extends { id: string }>(slot: ListSlot<T>, result: ReadResult<Page<T>>): ListSlot<T> {
  if (!result.ok) {
    return clears(result.error) ? { ...idleList<T>(), status: "error", error: result.error } : { ...slot, loadingMore: false, moreError: result.error };
  }
  const seen = new Set(slot.items.map((item) => item.id));
  return { ...slot, items: [...slot.items, ...result.data.items.filter((item) => !seen.has(item.id))], nextCursor: result.data.nextCursor, loadingMore: false, moreError: null };
}

function clearAll<S extends object>(snapshot: S, error: ReadError): S {
  const next: Record<string, unknown> = { ...(snapshot as Record<string, unknown>) };
  for (const [key, value] of Object.entries(snapshot as Record<string, unknown>)) {
    if (value && typeof value === "object" && "status" in value) {
      next[key] = "items" in value ? { ...idleList(), status: "error", error } : { ...idleSlot(), status: "error", error };
    }
  }
  return next as S;
}

function createBase<S extends { refreshing: boolean; lastRefresh: number | null; gate: ReadError | null; blockedUntil: number | null }>(
  initial: S, client: RegistryReadClient, now: () => number,
) {
  let snapshot = initial;
  let generation = 0;
  const listeners = new Set<() => void>();
  const update = (change: (current: S) => S) => {
    snapshot = { ...change(snapshot), blockedUntil: client.blockedUntil() };
    listeners.forEach((listener) => listener());
  };
  /** Applies one result unless a newer refresh started or a gate already closed this one. */
  const settle = <T>(gen: number, result: ReadResult<T>, change: (current: S, at: number) => S) => {
    if (gen !== generation) return;
    if (!result.ok && isGate(result.error)) {
      update((current) => (current.gate ? current : { ...clearAll(current, result.error), gate: result.error }));
      return;
    }
    if (snapshot.gate) return;
    update((current) => change(current, now()));
  };
  return {
    get snapshot() { return snapshot; },
    get generation() { return generation; },
    begin() { return ++generation; },
    update,
    settle,
    finish(gen: number) {
      if (gen === generation) update((current) => ({ ...current, refreshing: false, lastRefresh: now() }));
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export function createProjectStore(client: RegistryReadClient, projectId: string, { now = Date.now, pageSize = DEFAULT_PAGE_SIZE } = {}): ProjectStore {
  const base = createBase<ProjectSnapshot>({
    projectId, refreshing: false, lastRefresh: null, gate: null, blockedUntil: null,
    project: idleSlot(), draftHead: idleSlot(), draft: idleSlot(), reviews: idleList(), versions: idleList(),
    releaseHead: idleSlot(), releases: idleList(), requests: idleList(),
  }, client, now);
  /** The draft the loaded review pages belong to. */
  let reviewsDraftId: string | null = null;

  const fetchPage = (key: ProjectListKey, after: string | null) => {
    const page = { limit: pageSize, after };
    switch (key) {
      case "reviews": return reviewsDraftId ? client.reviews(projectId, reviewsDraftId, page) : Promise.resolve<ReadResult<Page<ReviewDTO>>>({ ok: false, error: { code: "INVALID_INPUT", status: 0 } });
      case "versions": return client.versions(projectId, page);
      case "releases": return client.releases(projectId, page);
      case "requests": return client.releaseRequests(projectId, page);
    }
  };

  async function refresh() {
    if (base.snapshot.refreshing) return;
    const gen = base.begin();
    base.update((s) => ({
      ...s, refreshing: true, gate: null,
      project: loadingSlot(s.project), draftHead: loadingSlot(s.draftHead), draft: loadingSlot(s.draft), reviews: loadingList(s.reviews),
      versions: loadingList(s.versions), releaseHead: loadingSlot(s.releaseHead), releases: loadingList(s.releases), requests: loadingList(s.requests),
    }));
    const draftChain = client.draftHead(projectId).then(async (head) => {
      base.settle(gen, head, (s, at) => ({ ...s, draftHead: settleSlot(s.draftHead, head, at) }));
      if (!head.ok) {
        // Draft and reviews are read through the head; they share its outcome.
        base.settle(gen, head, (s, at) => ({ ...s, draft: settleSlot(s.draft, head as ReadResult<never>, at), reviews: settleList(s.reviews, head as ReadResult<never>, at) }));
        return;
      }
      reviewsDraftId = head.data.id;
      await Promise.all([
        client.draft(projectId).then((result) => base.settle(gen, result, (s, at) => ({ ...s, draft: settleSlot(s.draft, result, at) }))),
        client.reviews(projectId, head.data.id, { limit: pageSize }).then((result) => base.settle(gen, result, (s, at) => ({ ...s, reviews: settleList(s.reviews, result, at) }))),
      ]);
    });
    await Promise.all([
      client.project(projectId).then((result) => base.settle(gen, result, (s, at) => ({ ...s, project: settleSlot(s.project, result, at) }))),
      draftChain,
      client.versions(projectId, { limit: pageSize }).then((result) => base.settle(gen, result, (s, at) => ({ ...s, versions: settleList(s.versions, result, at) }))),
      client.releaseHead(projectId).then((result) => base.settle(gen, result, (s, at) => ({ ...s, releaseHead: settleSlot(s.releaseHead, result, at) }))),
      client.releases(projectId, { limit: pageSize }).then((result) => base.settle(gen, result, (s, at) => ({ ...s, releases: settleList(s.releases, result, at) }))),
      client.releaseRequests(projectId, { limit: pageSize }).then((result) => base.settle(gen, result, (s, at) => ({ ...s, requests: settleList(s.requests, result, at) }))),
    ]);
    base.finish(gen);
  }

  return {
    subscribe: base.subscribe,
    getSnapshot: () => base.snapshot,
    refresh,
    async ensureFresh(maxAgeMs) {
      const { lastRefresh, refreshing } = base.snapshot;
      if (!refreshing && (lastRefresh === null || now() - lastRefresh > maxAgeMs)) await refresh();
    },
    async loadMore(key) {
      const slot = base.snapshot[key];
      if (base.snapshot.refreshing || base.snapshot.gate || slot.status !== "ready" || slot.loadingMore || !slot.nextCursor) return;
      const gen = base.generation;
      base.update((s) => ({ ...s, [key]: { ...s[key], loadingMore: true, moreError: null } }));
      const result = await fetchPage(key, slot.nextCursor) as ReadResult<Page<{ id: string }>>;
      base.settle(gen, result, (s) => ({ ...s, [key]: appendPage(s[key] as ListSlot<{ id: string }>, result) }));
    },
  };
}

export function createOverviewStore(client: RegistryReadClient, { now = Date.now, pageSize = DEFAULT_PAGE_SIZE } = {}): OverviewStore {
  const base = createBase<OverviewSnapshot>({
    refreshing: false, lastRefresh: null, gate: null, blockedUntil: null, qualifications: idleSlot(), projects: idleList(),
  }, client, now);

  async function refresh() {
    if (base.snapshot.refreshing) return;
    const gen = base.begin();
    base.update((s) => ({ ...s, refreshing: true, gate: null, qualifications: loadingSlot(s.qualifications), projects: loadingList(s.projects) }));
    await Promise.all([
      client.qualifications().then((result) => {
        const actions: ReadResult<QualificationDTO[]> = result.ok ? { ok: true, data: result.data.actions, etag: null } : result;
        base.settle(gen, actions, (s, at) => ({ ...s, qualifications: settleSlot(s.qualifications, actions, at) }));
      }),
      client.projects({ limit: pageSize }).then((result) => base.settle(gen, result, (s, at) => ({ ...s, projects: settleList(s.projects, result, at) }))),
    ]);
    base.finish(gen);
  }

  return {
    subscribe: base.subscribe,
    getSnapshot: () => base.snapshot,
    refresh,
    async ensureFresh(maxAgeMs) {
      const { lastRefresh, refreshing } = base.snapshot;
      if (!refreshing && (lastRefresh === null || now() - lastRefresh > maxAgeMs)) await refresh();
    },
    async loadMore() {
      const slot = base.snapshot.projects;
      if (base.snapshot.refreshing || base.snapshot.gate || slot.status !== "ready" || slot.loadingMore || !slot.nextCursor) return;
      const gen = base.generation;
      base.update((s) => ({ ...s, projects: { ...s.projects, loadingMore: true, moreError: null } }));
      const result = await client.projects({ limit: pageSize, after: slot.nextCursor });
      base.settle(gen, result, (s) => ({ ...s, projects: appendPage(s.projects, result) }));
    },
  };
}
