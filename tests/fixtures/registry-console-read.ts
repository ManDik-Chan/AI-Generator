/*
 * Synthetic P1-C1-A read responses for the developer console's Registry mode tests.
 * IDs are chosen so that UUID order is the opposite of time order: a test that passes by reading
 * lists in server order would sort them the wrong way.
 */
import { hashSnapshot } from "@/features/registry/canonical";
import type { DraftPayload } from "@/features/registry/contracts";

export const PROJECT = "a1111111-1111-4111-8111-111111111111";
export const FOREIGN = "f9999999-9999-4999-8999-999999999999";
export const DRAFT = "b2222222-2222-4222-8222-222222222222";
export const TOKEN = "header.payload-SENTINEL_TOKEN_7f3a.signature";

/** Lower number → lower UUID. */
export const uuid = (n: number) => `0000000${n}`.slice(-8) + "-0000-4000-8000-000000000000";

export function payloadFor(projectId: string, version: string): DraftPayload {
  return {
    manifest: { schemaVersion: "0.5.0", projectId, slug: "console-read-fixture", version, name: "Console read fixture", summary: "Synthetic read-only console fixture",
      category: "software", visibility: "PRIVATE", integration: { mode: "SHOWCASE" }, capabilities: ["documentation.read"], researchClaims: [] },
    presentation: { schemaVersion: "0.5.0", projectId, version, title: "Console read fixture", sections: [{ id: "intro", kind: "MARKDOWN", title: "Intro", body: "<b>not html</b>", sourceAssetIds: [] }] },
    documentation: [],
  };
}

export const payload = payloadFor(PROJECT, "1.2.0");
export const contentHash = hashSnapshot(payload);
export const draftEtag = (revision = 3) => `"draft:${DRAFT}:${revision}"`;
export const releaseEtag = (revision = 5) => `"release:${PROJECT}:${revision}"`;
const future = (minutes: number) => new Date(Date.UTC(2026, 10, 1, 4, 0, 0) + minutes * 60_000).toISOString();
export const FIXED_NOW = Date.UTC(2026, 10, 1, 4, 0, 0);

export const summary = { id: PROJECT, slug: "console-read-fixture", visibility: "PRIVATE", roles: ["OWNER", "EDITOR"] };
export const projectRead = { ...summary, effectiveActions: [{ action: "READ_DRAFT", expiresAt: future(60) }, { action: "EDIT_DRAFT", expiresAt: future(60) }, { action: "READ_RELEASE", expiresAt: future(30) }] };
export const qualifications = { actions: [{ action: "READ_RELEASE", expiresAt: future(30) }, { action: "READ_DRAFT", expiresAt: future(60 * 26) }, { action: "PUBLISH_RELEASE", expiresAt: future(5) }] };
export const draftHead = { id: DRAFT, projectId: PROJECT, revision: 3, state: "IN_REVIEW", contentHash };
export const draftRead = { id: DRAFT, projectId: PROJECT, revision: 3, state: "IN_REVIEW", payload, contentHash };

/** UUID order: older revision first is reversed — rev 3 has the lower ID. */
export const reviews = [
  { id: uuid(1), projectId: PROJECT, draftId: DRAFT, draftRevision: 3, decision: "PENDING", effectiveState: "PENDING", contentHash, expiresAt: future(12), submittedByViewer: true },
  { id: uuid(2), projectId: PROJECT, draftId: DRAFT, draftRevision: 1, decision: "APPROVED", effectiveState: "INVALIDATED", contentHash: "0".repeat(64), expiresAt: future(-90), submittedByViewer: false },
];
const v1 = payloadFor(PROJECT, "1.0.0"), v11 = payloadFor(PROJECT, "1.1.0");
/** The newer version has the lower ID. */
export const versions = [
  { id: uuid(3), projectId: PROJECT, version: "1.1.0", snapshot: v11, contentHash: hashSnapshot(v11), hashAlgorithm: "JCS-SHA256-v1", reviewId: uuid(11), createdAt: "2026-10-30T02:00:00.000Z" },
  { id: uuid(4), projectId: PROJECT, version: "1.0.0", snapshot: v1, contentHash: hashSnapshot(v1), hashAlgorithm: "JCS-SHA256-v1", reviewId: uuid(12), createdAt: "2026-10-20T02:00:00.000Z" },
];
export const releases = [
  { id: uuid(5), projectId: PROJECT, versionId: uuid(3), version: "1.1.0", contentHash: hashSnapshot(v11), visibilityAtApproval: "UNLISTED", state: "PUBLISHED", publishedAt: "2026-10-30T03:00:00.000Z", withdrawnAt: null, intent: "PUBLISH" },
  { id: uuid(6), projectId: PROJECT, versionId: uuid(4), version: "1.0.0", contentHash: hashSnapshot(v1), visibilityAtApproval: "PRIVATE", state: "WITHDRAWN", publishedAt: "2026-10-21T03:00:00.000Z", withdrawnAt: "2026-10-29T03:00:00.000Z", intent: null },
];
export const requests = [
  { id: uuid(7), projectId: PROJECT, versionId: uuid(3), version: "1.1.0", contentHash: hashSnapshot(v11), intent: "PUBLISH", targetReleaseId: null, visibility: "UNLISTED",
    expiresAt: "2026-10-30T02:20:00.000Z", approvalId: uuid(13), state: "CONSUMED", expired: true, stale: true, requestedByViewer: true, approvedByViewer: false },
  { id: uuid(8), projectId: PROJECT, versionId: uuid(4), version: "1.0.0", contentHash: hashSnapshot(v1), intent: "ROLLBACK", targetReleaseId: uuid(6), visibility: "PRIVATE",
    expiresAt: future(9), approvalId: null, state: "PENDING", expired: false, stale: false, requestedByViewer: false, approvedByViewer: false },
];
export const releaseHead = { projectId: PROJECT, currentReleaseId: uuid(5), visibility: "UNLISTED" };

export interface FakeResponse { status: number; body: unknown; headers?: Record<string, string> }
export const ok = (result: unknown, etag?: string): FakeResponse => ({ status: 200, body: { result, ...(etag ? { etag } : {}), replayed: false }, headers: etag ? { ETag: etag } : {} });
export const err = (code: string, status: number, headers?: Record<string, string>): FakeResponse => ({ status, body: { code }, headers });
export const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });

/** Default happy-path routes keyed by path suffix after the read base (no query). */
export function defaultRoutes(): Record<string, FakeResponse> {
  const p = `projects/${PROJECT}`;
  return {
    qualifications: ok(qualifications),
    projects: ok(page([summary])),
    [p]: ok(projectRead),
    [`${p}/draft/head`]: ok(draftHead, draftEtag()),
    [`${p}/draft`]: ok(draftRead, draftEtag()),
    [`${p}/drafts/${DRAFT}/reviews`]: ok(page(reviews)),
    [`${p}/versions`]: ok(page(versions)),
    [`${p}/release/head`]: ok(releaseHead, releaseEtag()),
    [`${p}/releases`]: ok(page(releases)),
    [`${p}/release-requests`]: ok(page(requests)),
  };
}

export interface RecordedCall { url: string; init: RequestInit }

/** A fetch that answers from `routes` (a function may vary by query) and records every call. */
export function fakeFetch(routes: Record<string, FakeResponse | ((url: URL) => FakeResponse)>, base = "/api/internal/registry") {
  const calls: RecordedCall[] = [];
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "https://console.test");
    calls.push({ url: `${url.pathname}${url.search}`, init });
    const key = url.pathname.slice(base.length + 1);
    const route = routes[key];
    const answer = typeof route === "function" ? route(url) : route ?? err("INVALID_INPUT", 422);
    return new Response(typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body), {
      status: answer.status, headers: { "Content-Type": "application/json; charset=utf-8", ...answer.headers },
    });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}
