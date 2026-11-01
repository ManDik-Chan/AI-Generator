import { afterEach, describe, expect, it, vi } from "vitest";

import { createRegistryReadClient } from "@/features/developer-console/registry/client";
import { READ_ERROR_STATUS } from "@/features/developer-console/registry/contract";
import {
  DRAFT, FIXED_NOW, FOREIGN, PROJECT, TOKEN, defaultRoutes, draftEtag, err, fakeFetch, ok, page, projectRead, releaseHead, releases, requests, reviews, uuid, versions,
  type FakeResponse,
} from "@/tests/fixtures/registry-console-read";

function setup(routes: Record<string, FakeResponse | ((url: URL) => FakeResponse)> = defaultRoutes(), token: () => Promise<string | null> = async () => TOKEN) {
  let now = FIXED_NOW;
  const fake = fakeFetch(routes);
  const getAccessToken = vi.fn(token);
  const client = createRegistryReadClient({ fetch: fake.fetch, getAccessToken, now: () => now });
  return { client, calls: fake.calls, getAccessToken, advance: (ms: number) => { now += ms; } };
}
const p = `projects/${PROJECT}`;

afterEach(() => vi.unstubAllGlobals());

describe("Registry read client request boundary", () => {
  it("sends Bearer GETs without cookies, caching, redirects or a body", async () => {
    const { client, calls } = setup();
    await client.project(PROJECT);
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(url).toBe(`/api/internal/registry/projects/${PROJECT}`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("omit");
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}`, Accept: "application/json" });
    expect(url).not.toContain(TOKEN);
  });

  it("asks for the token on every request and never sends without one", async () => {
    const signedOut = setup(defaultRoutes(), async () => null);
    expect(await signedOut.client.qualifications()).toEqual({ ok: false, error: { code: "AUTH_REQUIRED", status: 0 } });
    const broken = setup(defaultRoutes(), async () => { throw new Error(`session store failed for ${TOKEN}`); });
    expect(await broken.client.projects()).toEqual({ ok: false, error: { code: "AUTH_REQUIRED", status: 0 } });
    const malformed = setup(defaultRoutes(), async () => "has space");
    expect((await malformed.client.projects()).ok).toBe(false);
    expect([...signedOut.calls, ...broken.calls, ...malformed.calls]).toHaveLength(0);
    const live = setup();
    await live.client.project(PROJECT);
    await live.client.releaseHead(PROJECT);
    expect(live.getAccessToken).toHaveBeenCalledTimes(2);
  });

  it("refuses malformed IDs and pagination locally, and sends only limit and after", async () => {
    const { client, calls } = setup({ ...defaultRoutes(), [`${p}/versions`]: (url) => ok(page(url.searchParams.get("after") ? [] : versions)) });
    for (const result of await Promise.all([
      client.project("not-a-uuid"), client.project("projects"), client.reviews(PROJECT, "../draft"), client.version(PROJECT, `${uuid(3)}?x=1`),
      client.versions(PROJECT, { limit: 0 }), client.versions(PROJECT, { limit: 51 }), client.versions(PROJECT, { limit: 1.5 }), client.versions(PROJECT, { after: "1" }),
    ])) expect(result).toEqual({ ok: false, error: { code: "INVALID_INPUT", status: 0 } });
    expect(calls).toHaveLength(0);
    await client.versions(PROJECT, { limit: 20, after: uuid(3) });
    await client.versions(PROJECT, { limit: 50, after: null });
    expect(calls.map((call) => call.url)).toEqual([`/api/internal/registry/${p}/versions?limit=20&after=${uuid(3)}`, `/api/internal/registry/${p}/versions?limit=50`]);
  });
});

describe("Registry read client response boundary", () => {
  it.each(Object.entries(READ_ERROR_STATUS))("maps %s with status %i", async (code, status) => {
    const { client } = setup({ [p]: err(code, status, code === "RATE_LIMITED" ? { "Retry-After": "60" } : {}) });
    const result = await client.project(PROJECT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code, status });
  });

  it("treats unknown codes, status/code mismatches, extra fields and non-JSON bodies as contract mismatches", async () => {
    for (const answer of [err("NOT_FOUND", 403), err("TEAPOT", 418), { status: 404, body: { code: "NOT_FOUND", detail: "row 7" } }, { status: 502, body: "<html>bad gateway</html>" }, { status: 200, body: "{" }]) {
      const { client } = setup({ [p]: answer });
      const result = await client.project(PROJECT);
      expect(result).toEqual({ ok: false, error: { code: "CONTRACT_MISMATCH", status: answer.status } });
    }
  });

  it("rejects unknown fields, replayed results and ETag disagreements in successful responses", async () => {
    const cases: FakeResponse[] = [
      ok({ ...projectRead, ownerId: uuid(9) }),
      { status: 200, body: { result: projectRead, replayed: true } },
      { status: 200, body: { result: projectRead, replayed: false, receipt: {} } },
      { status: 200, body: { result: projectRead, etag: draftEtag(), replayed: false } },
    ];
    for (const answer of cases) expect(await setup({ [p]: answer }).client.project(PROJECT)).toEqual({ ok: false, error: { code: "CONTRACT_MISMATCH", status: 200 } });
    const head = ok({ id: DRAFT, projectId: PROJECT, revision: 3, state: "DRAFT", contentHash: null }, draftEtag());
    expect((await setup({ [`${p}/draft/head`]: head }).client.draftHead(PROJECT)).ok).toBe(true);
    const disagreeing = { ...head, headers: { ETag: draftEtag(4) } };
    expect(await setup({ [`${p}/draft/head`]: disagreeing }).client.draftHead(PROJECT)).toEqual({ ok: false, error: { code: "CONTRACT_MISMATCH", status: 200 } });
  });

  it("rejects well-formed responses that belong to another project or object", async () => {
    const foreign = <T extends { projectId: string }>(item: T) => ({ ...item, projectId: FOREIGN });
    const routes: Record<string, FakeResponse> = {
      [p]: ok({ ...projectRead, id: FOREIGN }),
      [`${p}/draft/head`]: ok({ id: DRAFT, projectId: FOREIGN, revision: 3, state: "DRAFT", contentHash: null }, draftEtag()),
      [`${p}/drafts/${DRAFT}/reviews`]: ok(page([{ ...reviews[0], draftId: uuid(9) }])),
      [`${p}/versions`]: ok(page([foreign(versions[0])])),
      [`${p}/versions/${uuid(3)}`]: ok(versions[1]),
      [`${p}/release/head`]: ok(foreign(releaseHead), `"release:${PROJECT}:5"`),
      [`${p}/releases`]: ok(page([releases[0], foreign(releases[1])])),
      [`${p}/release-requests`]: ok(page([foreign(requests[0])])),
    };
    const { client } = setup(routes);
    for (const result of await Promise.all([
      client.project(PROJECT), client.draftHead(PROJECT), client.reviews(PROJECT, DRAFT), client.versions(PROJECT), client.version(PROJECT, uuid(3)),
      client.releaseHead(PROJECT), client.releases(PROJECT), client.releaseRequests(PROJECT),
    ])) expect(result).toEqual({ ok: false, error: { code: "CONTRACT_MISMATCH", status: 200 } });
  });

  it("holds every request after a 429 until Retry-After has passed", async () => {
    let limited = true;
    const { client, calls, advance } = setup({ ...defaultRoutes(), [p]: () => (limited ? err("RATE_LIMITED", 429, { "Retry-After": "30" }) : ok(projectRead)) });
    expect(await client.project(PROJECT)).toEqual({ ok: false, error: { code: "RATE_LIMITED", status: 429, retryAt: FIXED_NOW + 30_000 } });
    expect(client.blockedUntil()).toBe(FIXED_NOW + 30_000);
    expect(await client.releaseHead(PROJECT)).toEqual({ ok: false, error: { code: "RATE_LIMITED", status: 0, retryAt: FIXED_NOW + 30_000 } });
    expect(calls).toHaveLength(1);
    limited = false;
    advance(30_000);
    expect(client.blockedUntil()).toBeNull();
    expect((await client.project(PROJECT)).ok).toBe(true);
    expect(calls).toHaveLength(2);
    const fallback = setup({ [p]: err("RATE_LIMITED", 429) });
    const result = await fallback.client.project(PROJECT);
    expect(!result.ok && result.error.retryAt).toBe(FIXED_NOW + 60_000);
  });

  it("reports network failures without a message, and never lets the token reach a result, error or storage", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem, getItem: vi.fn(), removeItem: vi.fn() });
    vi.stubGlobal("sessionStorage", { setItem, getItem: vi.fn(), removeItem: vi.fn() });
    const thrown = createRegistryReadClient({ fetch: async () => { throw new TypeError(`connect failed Bearer ${TOKEN}`); }, getAccessToken: async () => TOKEN });
    const network = await thrown.project(PROJECT);
    expect(network).toEqual({ ok: false, error: { code: "NETWORK", status: 0 } });
    const results: unknown[] = [network];
    for (const answer of [err("AUTH_REQUIRED", 401), err("FORBIDDEN", 403), err("UNAVAILABLE", 503), { status: 500, body: `token ${TOKEN}` }, ok(projectRead)]) {
      results.push(await setup({ [p]: answer }).client.project(PROJECT));
    }
    const { client } = setup();
    results.push(await Promise.all([client.qualifications(), client.projects(), client.draft(PROJECT), client.reviews(PROJECT, DRAFT), client.releaseRequests(PROJECT)]));
    expect(JSON.stringify(results)).not.toContain("SENTINEL_TOKEN");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("produces nothing but GET for every read it offers", async () => {
    const { client, calls } = setup();
    await Promise.all([
      client.qualifications(), client.projects(), client.project(PROJECT), client.draftHead(PROJECT), client.draft(PROJECT), client.reviews(PROJECT, DRAFT),
      client.review(PROJECT, uuid(1)), client.versions(PROJECT), client.version(PROJECT, uuid(3)), client.releaseHead(PROJECT), client.releases(PROJECT), client.releaseRequests(PROJECT),
    ]);
    expect(calls).toHaveLength(12);
    expect(calls.every((call) => call.init.method === "GET" && call.init.body === undefined)).toBe(true);
    expect(Object.keys(client).filter((key) => /edit|submit|decide|seal|publish|withdraw|rollback|approve|request(?!s)|execute|write|post|put|patch|delete/i.test(key))).toEqual([]);
  });
});
