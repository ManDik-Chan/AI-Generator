/*
 * The browser client against the real P1-C1-A HTTP handler (features/registry/read-http.ts), with
 * only the database-backed read functions replaced. This checks that what the server actually
 * serializes — envelope, ETag header, status and error body — is what the console accepts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRegistryReadClient } from "@/features/developer-console/registry/client";
import { READ_ERROR_STATUS } from "@/features/developer-console/registry/contract";
import { RegistryProtocolError } from "@/features/registry/protocol";
import { createRegistryReadHandler } from "@/features/registry/read-http";
import {
  DRAFT, PROJECT, TOKEN, contentHash, draftEtag, draftHead, draftRead, page, projectRead, qualifications, releaseEtag, releaseHead, releases, requests, reviews, summary, uuid, versions,
} from "@/tests/fixtures/registry-console-read";

const reads = vi.hoisted(() => ({
  getRegistryProject: vi.fn(), getRegistryQualifications: vi.fn(), getRegistryReadReleaseHead: vi.fn(), getRegistryVersion: vi.fn(),
  listRegistryProjects: vi.fn(), listRegistryReleaseHistory: vi.fn(), listRegistryReleaseRequests: vi.fn(), listRegistryReviews: vi.fn(), listRegistryVersions: vi.fn(),
}));
const drafts = vi.hoisted(() => ({ getRegistryDraft: vi.fn(), getRegistryDraftHead: vi.fn(), getRegistryReview: vi.fn() }));
vi.mock("@/features/registry/read", () => reads);
vi.mock("@/features/registry/protocol", async (importOriginal) => ({ ...await importOriginal<typeof import("@/features/registry/protocol")>(), ...drafts }));

const ORIGIN = "http://127.0.0.1:3000";
/** The library returns the strict DraftDTO with the hash beside it; HTTP folds the hash in. */
const { contentHash: _hash, ...draftDTO } = draftRead;
void _hash;

/** A same-origin browser fetch, answered by the real handler. */
function wire(handler = createRegistryReadHandler(), site = "same-origin") {
  const seen: Request[] = [];
  const fetch: typeof globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), ORIGIN);
    const request = new Request(url, { method: init.method, headers: { ...(init.headers as Record<string, string>), "Sec-Fetch-Site": site }, signal: init.signal });
    seen.push(request);
    return handler(request, url.pathname.replace(/^\/api\/internal\/registry\/?/, "").split("/").filter(Boolean));
  };
  return { client: createRegistryReadClient({ fetch, getAccessToken: async () => TOKEN }), seen };
}

beforeEach(() => {
  for (const flag of ["REGISTRY_INTERNAL_ACCESS_ENABLED", "REGISTRY_INTERNAL_READ_ENABLED", "REGISTRY_INTERNAL_READ_HTTP_ENABLED"]) vi.stubEnv(flag, "true");
  [...Object.values(reads), ...Object.values(drafts)].forEach((mock) => mock.mockReset());
  reads.getRegistryQualifications.mockResolvedValue({ result: qualifications });
  reads.listRegistryProjects.mockResolvedValue({ result: page([summary]) });
  reads.getRegistryProject.mockResolvedValue({ result: projectRead });
  reads.listRegistryVersions.mockResolvedValue({ result: page(versions, uuid(4)) });
  reads.getRegistryVersion.mockResolvedValue({ result: versions[0] });
  reads.listRegistryReviews.mockResolvedValue({ result: page(reviews) });
  reads.getRegistryReadReleaseHead.mockResolvedValue({ result: releaseHead, etag: releaseEtag() });
  reads.listRegistryReleaseHistory.mockResolvedValue({ result: page(releases) });
  reads.listRegistryReleaseRequests.mockResolvedValue({ result: page(requests) });
  drafts.getRegistryDraftHead.mockResolvedValue({ result: draftHead, etag: draftEtag() });
  drafts.getRegistryDraft.mockResolvedValue({ result: draftDTO, contentHash, etag: draftEtag() });
  drafts.getRegistryReview.mockResolvedValue({ result: reviews[0], etag: draftEtag() });
});
afterEach(() => vi.unstubAllEnvs());

describe("console client against the real internal read handler", () => {
  it("accepts every successful response the handler serializes, with the server's hash and ETags", async () => {
    const { client, seen } = wire();
    const results = await Promise.all([
      client.qualifications(), client.projects({ limit: 20 }), client.project(PROJECT), client.draftHead(PROJECT), client.draft(PROJECT),
      client.reviews(PROJECT, DRAFT), client.review(PROJECT, uuid(1)), client.versions(PROJECT, { limit: 2, after: uuid(1) }), client.version(PROJECT, uuid(3)),
      client.releaseHead(PROJECT), client.releases(PROJECT), client.releaseRequests(PROJECT),
    ]);
    expect(results.map((result) => result.ok)).toEqual(Array(12).fill(true));
    const [, , , head, draft, , review, versionPage, , release] = results;
    expect(head).toEqual({ ok: true, data: draftHead, etag: draftEtag() });
    expect(draft).toEqual({ ok: true, data: draftRead, etag: draftEtag() });
    expect(review).toMatchObject({ ok: true, etag: draftEtag() });
    expect(release).toEqual({ ok: true, data: releaseHead, etag: releaseEtag() });
    expect(versionPage).toEqual({ ok: true, data: page(versions, uuid(4)), etag: null });
    expect(reads.listRegistryVersions).toHaveBeenCalledWith({ accessToken: TOKEN, projectId: PROJECT, limit: 2, after: uuid(1) });
    // The token reaches the server only as the Bearer header; nothing else identifies the caller.
    for (const request of seen) {
      expect(request.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
      expect(request.headers.get("cookie")).toBeNull();
      expect(request.url).not.toContain("SENTINEL");
    }
  });

  it.each(Object.entries(READ_ERROR_STATUS).filter(([code]) => !["METHOD_NOT_ALLOWED", "RATE_LIMITED"].includes(code)))(
    "agrees with the handler on %s → %i", async (code, status) => {
      reads.getRegistryProject.mockRejectedValue(new RegistryProtocolError(code, status));
      expect(await wire().client.project(PROJECT)).toEqual({ ok: false, error: { code, status } });
    },
  );

  it("maps a closed HTTP flag to DISABLED and an unexpected server failure to UNAVAILABLE", async () => {
    vi.stubEnv("REGISTRY_INTERNAL_READ_HTTP_ENABLED", "false");
    expect(await wire().client.projects()).toEqual({ ok: false, error: { code: "DISABLED", status: 403 } });
    vi.stubEnv("REGISTRY_INTERNAL_READ_HTTP_ENABLED", "true");
    reads.listRegistryProjects.mockRejectedValue(new Error(`database said ${TOKEN}`));
    const failed = await wire().client.projects();
    expect(failed).toEqual({ ok: false, error: { code: "UNAVAILABLE", status: 503 } });
    expect(JSON.stringify(failed)).not.toContain("SENTINEL");
  });

  it("is refused as FORBIDDEN when the browser reports a cross-site request", async () => {
    expect(await wire(createRegistryReadHandler(), "cross-site").client.project(PROJECT)).toEqual({ ok: false, error: { code: "FORBIDDEN", status: 403 } });
    expect(reads.getRegistryProject).not.toHaveBeenCalled();
  });

  it("honours the handler's per-token rate limit and Retry-After", async () => {
    const { client, seen } = wire(createRegistryReadHandler(() => 1_000_000));
    for (let index = 0; index < 60; index++) expect((await client.qualifications()).ok).toBe(true);
    const limited = await client.qualifications();
    expect(limited).toMatchObject({ ok: false, error: { code: "RATE_LIMITED", status: 429 } });
    expect(seen).toHaveLength(61);
    expect((await client.projects()).ok).toBe(false);
    expect(seen).toHaveLength(61); // held locally, not sent
    expect(reads.getRegistryQualifications).toHaveBeenCalledTimes(60);
  });
});
