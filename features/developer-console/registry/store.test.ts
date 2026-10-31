import { describe, expect, it } from "vitest";

import { createRegistryReadClient } from "@/features/developer-console/registry/client";
import { createOverviewStore, createProjectStore, type ProjectSnapshot } from "@/features/developer-console/registry/store";
import {
  DRAFT, FIXED_NOW, PROJECT, TOKEN, defaultRoutes, draftEtag, draftHead, err, fakeFetch, ok, page, releaseEtag, summary, uuid, versions,
  type FakeResponse,
} from "@/tests/fixtures/registry-console-read";

type Routes = Record<string, FakeResponse | ((url: URL) => FakeResponse)>;
const p = `projects/${PROJECT}`;
const RELEASE_KEYS = [`${p}/release/head`, `${p}/releases`, `${p}/release-requests`];
const DRAFT_KEYS = [p, `${p}/draft/head`, `${p}/draft`, `${p}/drafts/${DRAFT}/reviews`, `${p}/versions`];

function setup(routes: Routes = defaultRoutes(), pageSize = 20) {
  let now = FIXED_NOW;
  const fake = fakeFetch(routes);
  const client = createRegistryReadClient({ fetch: fake.fetch, getAccessToken: async () => TOKEN, now: () => now });
  const store = createProjectStore(client, PROJECT, { now: () => now, pageSize });
  return { store, calls: fake.calls, routes, advance: (ms: number) => { now += ms; } };
}
const withRoutes = (changes: Routes) => ({ ...defaultRoutes(), ...changes });
const slots = (s: ProjectSnapshot) => [s.project, s.draftHead, s.draft, s.reviews, s.versions, s.releaseHead, s.releases, s.requests];
const shown = (s: ProjectSnapshot) => slots(s).filter((slot) => ("items" in slot ? slot.readAt !== null : slot.data !== null)).length;

describe("Registry project store", () => {
  it("reads every section once, the reviews of the head's draft, and records ETags", async () => {
    const { store, calls } = setup();
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getSnapshot().refreshing ? "busy" : "done"));
    await store.refresh();
    const s = store.getSnapshot();
    expect(calls.map((call) => call.url.split("?")[0].replace("/api/internal/registry/", "")).sort()).toEqual([...DRAFT_KEYS, ...RELEASE_KEYS].sort());
    expect(slots(s).every((slot) => slot.status === "ready" && slot.error === null)).toBe(true);
    expect(s.draftHead.etag).toBe(draftEtag());
    expect(s.releaseHead.etag).toBe(releaseEtag());
    expect(s.reviews.items).toHaveLength(2);
    expect(s.lastRefresh).toBe(FIXED_NOW);
    expect(seen.at(-1)).toBe("done");
    expect(seen.filter((item) => item === "busy").length).toBeGreaterThan(1); // sections arrive progressively
  });

  it("keeps READ_DRAFT and READ_RELEASE independent in both directions", async () => {
    const noRelease = setup(withRoutes(Object.fromEntries(RELEASE_KEYS.map((key) => [key, err("FORBIDDEN", 403)]))));
    await noRelease.store.refresh();
    let s = noRelease.store.getSnapshot();
    expect(s.gate).toBeNull();
    expect([s.releaseHead, s.releases, s.requests].map((slot) => slot.error?.code)).toEqual(["FORBIDDEN", "FORBIDDEN", "FORBIDDEN"]);
    expect([s.project, s.draftHead, s.draft, s.reviews, s.versions].every((slot) => slot.status === "ready")).toBe(true);

    const noDraft = setup(withRoutes(Object.fromEntries(DRAFT_KEYS.map((key) => [key, err("FORBIDDEN", 403)]))));
    await noDraft.store.refresh();
    s = noDraft.store.getSnapshot();
    expect([s.project, s.draftHead, s.draft, s.reviews, s.versions].map((slot) => slot.error?.code)).toEqual(Array(5).fill("FORBIDDEN"));
    expect([s.releaseHead, s.releases, s.requests].every((slot) => slot.status === "ready")).toBe(true);
    // Draft and reviews follow the head; they are not requested after it fails.
    expect(noDraft.calls.some((call) => call.url.includes("/draft?") || call.url.endsWith("/draft") || call.url.includes("/reviews"))).toBe(false);
  });

  it.each(["AUTH_REQUIRED", "DISABLED"])("clears every section and closes the gate on %s, without any fallback data", async (code) => {
    const routes = defaultRoutes();
    const { store } = setup(routes);
    await store.refresh();
    expect(shown(store.getSnapshot())).toBe(8);
    routes[`${p}/versions`] = err(code, code === "AUTH_REQUIRED" ? 401 : 403);
    await store.refresh();
    const s = store.getSnapshot();
    expect(s.gate?.code).toBe(code);
    expect(shown(s)).toBe(0);
    expect(JSON.stringify(s)).not.toMatch(/console-read-fixture|sorting-lab|air-quality/);
  });

  it("drops data the caller may no longer read, but keeps the last good data through transient failures", async () => {
    const routes = defaultRoutes();
    const { store, advance } = setup(routes);
    await store.refresh();
    advance(60_000);
    routes[`${p}/releases`] = err("FORBIDDEN", 403);
    routes[`${p}/release-requests`] = err("NOT_FOUND", 404);
    routes[`${p}/versions`] = err("UNAVAILABLE", 503);
    routes[`${p}/draft`] = err("CONFLICT", 409);
    await store.refresh();
    const s = store.getSnapshot();
    expect(s.releases).toMatchObject({ status: "error", items: [], readAt: null, error: { code: "FORBIDDEN" } });
    expect(s.requests).toMatchObject({ status: "error", items: [], readAt: null, error: { code: "NOT_FOUND" } });
    expect(s.versions).toMatchObject({ status: "error", readAt: FIXED_NOW, error: { code: "UNAVAILABLE" } });
    expect(s.versions.items).toHaveLength(2);
    expect(s.draft).toMatchObject({ status: "error", readAt: FIXED_NOW, error: { code: "CONFLICT" } });
    expect(s.draft.data?.id).toBe(DRAFT);
    expect(s.releaseHead).toMatchObject({ status: "ready", readAt: FIXED_NOW + 60_000 });
  });

  it("stops sending after a 429, keeps the last data, and resumes once Retry-After has passed", async () => {
    const routes = defaultRoutes();
    const { store, calls, advance } = setup(routes);
    await store.refresh();
    routes[`${p}/release/head`] = err("RATE_LIMITED", 429, { "Retry-After": "60" });
    // Only the head is limited; reads queued behind it in the same refresh are then held locally.
    await store.refresh();
    const sent = calls.length;
    expect(store.getSnapshot().blockedUntil).toBe(FIXED_NOW + 60_000);
    expect(store.getSnapshot().releaseHead).toMatchObject({ status: "error", error: { code: "RATE_LIMITED", status: 429 } });
    expect(store.getSnapshot().releaseHead.data).not.toBeNull();
    await store.refresh();
    expect(calls.length).toBe(sent);
    expect(slots(store.getSnapshot()).every((slot) => slot.error?.code === "RATE_LIMITED")).toBe(true);
    expect(shown(store.getSnapshot())).toBe(8);
    routes[`${p}/release/head`] = defaultRoutes()[`${p}/release/head`];
    advance(60_000);
    await store.refresh();
    expect(store.getSnapshot()).toMatchObject({ blockedUntil: null, releaseHead: { status: "ready" } });
  });

  it("marks a section changed only when its ETag differs from the previous successful read", async () => {
    const routes = defaultRoutes();
    const { store } = setup(routes);
    await store.refresh();
    expect(store.getSnapshot().draftHead.changed).toBe(false);
    await store.refresh();
    expect(store.getSnapshot().draftHead.changed).toBe(false);
    routes[`${p}/draft/head`] = ok({ ...draftHead, revision: 4 }, draftEtag(4));
    routes[`${p}/release/head`] = ok({ projectId: PROJECT, currentReleaseId: null, visibility: "PRIVATE" }, releaseEtag(6));
    await store.refresh();
    expect(store.getSnapshot().draftHead).toMatchObject({ changed: true, etag: draftEtag(4) });
    expect(store.getSnapshot().releaseHead).toMatchObject({ changed: true, etag: releaseEtag(6) });
  });

  it("reports an uninitialized draft as a state with no DraftDTO", async () => {
    const { store } = setup(withRoutes({
      [`${p}/draft/head`]: ok({ ...draftHead, state: "DRAFT", revision: 1, contentHash: null }, draftEtag(1)),
      [`${p}/draft`]: err("DRAFT_UNINITIALIZED", 409),
      [`${p}/drafts/${DRAFT}/reviews`]: ok(page([])),
    }));
    await store.refresh();
    const s = store.getSnapshot();
    expect(s.draftHead.data?.contentHash).toBeNull();
    expect(s.draft).toMatchObject({ status: "error", data: null, error: { code: "DRAFT_UNINITIALIZED", status: 409 } });
    expect(s.reviews).toMatchObject({ status: "ready", items: [] });
  });

  it("pages with the exclusive cursor, appends without duplicates and stops at a null cursor", async () => {
    const cursors: (string | null)[] = [];
    const { store } = setup(withRoutes({
      [`${p}/versions`]: (url) => {
        const after = url.searchParams.get("after");
        cursors.push(after);
        expect(url.searchParams.get("limit")).toBe("1");
        return after === null ? ok(page([versions[0]], versions[0].id)) : ok(page([versions[0], versions[1]], null));
      },
    }), 1);
    await store.refresh();
    expect(store.getSnapshot().versions).toMatchObject({ nextCursor: versions[0].id });
    await store.loadMore("versions");
    expect(store.getSnapshot().versions.items.map((item) => item.id)).toEqual([versions[0].id, versions[1].id]);
    expect(store.getSnapshot().versions.nextCursor).toBeNull();
    await store.loadMore("versions");
    expect(cursors).toEqual([null, versions[0].id]);
  });

  it("keeps loaded rows when a later page fails transiently, and clears them when access is revoked", async () => {
    let next: FakeResponse = err("UNAVAILABLE", 503);
    const { store } = setup(withRoutes({ [`${p}/versions`]: (url) => (url.searchParams.get("after") ? next : ok(page([versions[0]], uuid(3)))) }), 1);
    await store.refresh();
    await store.loadMore("versions");
    expect(store.getSnapshot().versions).toMatchObject({ status: "ready", loadingMore: false, moreError: { code: "UNAVAILABLE" } });
    expect(store.getSnapshot().versions.items).toHaveLength(1);
    next = err("NOT_FOUND", 404);
    await store.loadMore("versions");
    expect(store.getSnapshot().versions).toMatchObject({ status: "error", items: [], error: { code: "NOT_FOUND" } });
  });

  it("discards a page that arrives after a newer refresh started", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const base = fakeFetch(withRoutes({ [`${p}/versions`]: (url) => ok(page(url.searchParams.get("after") ? [versions[1]] : [versions[0]], url.searchParams.get("after") ? null : uuid(3))) }));
    const slow: typeof fetch = async (input, init) => {
      if (String(input).includes("after=")) await gate;
      return base.fetch(input, init);
    };
    const client = createRegistryReadClient({ fetch: slow, getAccessToken: async () => TOKEN, now: () => FIXED_NOW });
    const store = createProjectStore(client, PROJECT, { now: () => FIXED_NOW, pageSize: 1 });
    await store.refresh();
    const more = store.loadMore("versions");
    const refresh = store.refresh();
    release();
    await Promise.all([more, refresh]);
    expect(store.getSnapshot().versions.items.map((item) => item.id)).toEqual([versions[0].id]);
    expect(store.getSnapshot().versions.loadingMore).toBe(false);
  });

  it("reuses a recent read and refreshes an old one", async () => {
    const { store, calls, advance } = setup();
    await store.ensureFresh(30_000);
    const first = calls.length;
    advance(10_000);
    await store.ensureFresh(30_000);
    expect(calls.length).toBe(first);
    advance(30_001);
    await store.ensureFresh(30_000);
    expect(calls.length).toBe(first * 2);
  });
});

describe("Registry overview store", () => {
  it("reads own qualifications and the first project page, then pages on demand", async () => {
    const second = { ...summary, id: uuid(20), slug: "aaa-second" };
    const fake = fakeFetch(withRoutes({ projects: (url) => (url.searchParams.get("after") ? ok(page([second])) : ok(page([summary], summary.id))) }));
    const client = createRegistryReadClient({ fetch: fake.fetch, getAccessToken: async () => TOKEN, now: () => FIXED_NOW });
    const store = createOverviewStore(client, { now: () => FIXED_NOW, pageSize: 1 });
    await store.refresh();
    expect(store.getSnapshot().qualifications.data?.map((item) => item.action)).toEqual(["READ_RELEASE", "READ_DRAFT", "PUBLISH_RELEASE"]);
    await store.loadMore("projects");
    expect(store.getSnapshot().projects.items.map((item) => item.slug)).toEqual(["console-read-fixture", "aaa-second"]);
    expect(fake.calls.map((call) => call.url)).toContain(`/api/internal/registry/projects?limit=1&after=${summary.id}`);
  });

  it("shows FORBIDDEN for a caller without READ_DRAFT and closes the gate when signed out", async () => {
    const forbidden = fakeFetch({ qualifications: err("FORBIDDEN", 403), projects: err("FORBIDDEN", 403) });
    const store = createOverviewStore(createRegistryReadClient({ fetch: forbidden.fetch, getAccessToken: async () => TOKEN }));
    await store.refresh();
    expect(store.getSnapshot()).toMatchObject({ gate: null, qualifications: { error: { code: "FORBIDDEN" } }, projects: { error: { code: "FORBIDDEN" } } });
    const signedOut = createOverviewStore(createRegistryReadClient({ fetch: forbidden.fetch, getAccessToken: async () => null }));
    await signedOut.refresh();
    expect(signedOut.getSnapshot().gate).toEqual({ code: "AUTH_REQUIRED", status: 0 });
    expect(forbidden.calls).toHaveLength(2);
  });
});
