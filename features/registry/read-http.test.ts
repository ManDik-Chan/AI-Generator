import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashSnapshot } from "./canonical";
import { RegistryProtocolError } from "./protocol";
import { createRegistryReadHandler } from "./read-http";

const reads = vi.hoisted(() => ({
  getRegistryProject: vi.fn(), getRegistryQualifications: vi.fn(), getRegistryReadReleaseHead: vi.fn(), getRegistryVersion: vi.fn(),
  listRegistryProjects: vi.fn(), listRegistryReleaseHistory: vi.fn(), listRegistryReleaseRequests: vi.fn(), listRegistryReviews: vi.fn(), listRegistryVersions: vi.fn(),
}));
const drafts = vi.hoisted(() => ({ getRegistryDraft: vi.fn(), getRegistryDraftHead: vi.fn(), getRegistryReview: vi.fn() }));
vi.mock("./read", () => reads);
vi.mock("./protocol", async importOriginal => ({ ...await importOriginal<typeof import("./protocol")>(), ...drafts }));

const projectId = "11111111-1111-4111-8111-111111111111", objectId = "22222222-2222-4222-8222-222222222222";
const time = "2026-10-31T01:00:00.000Z";
const token = "verified.by.auth";
const payload = {
  manifest: { schemaVersion: "0.5.0", projectId, slug: "http-fixture", version: "1.0.0", name: "HTTP fixture", summary: "Synthetic fixture",
    category: "software", visibility: "PRIVATE", integration: { mode: "SHOWCASE" }, capabilities: ["documentation.read"], researchClaims: [] },
  presentation: { schemaVersion: "0.5.0", projectId, version: "1.0.0", title: "HTTP fixture", sections: [] }, documentation: [],
};
const contentHash = hashSnapshot(payload);
const summary = { id: projectId, slug: "http-fixture", visibility: "PRIVATE", roles: ["VIEWER"] };
const version = { id: objectId, projectId, version: "1.0.0", snapshot: payload, contentHash, hashAlgorithm: "JCS-SHA256-v1", reviewId: objectId, createdAt: time };
const review = { id: objectId, projectId, draftId: objectId, draftRevision: 1, decision: "PENDING", effectiveState: "PENDING", contentHash, expiresAt: time, submittedByViewer: true };
const draft = { id: objectId, projectId, revision: 1, state: "DRAFT", payload };
const etag = `"draft:${objectId}:1"`;
const request = (suffix: string, init: RequestInit = {}) => new Request(`https://internal.example/api/internal/registry/${suffix}`, {
  ...init, headers: { authorization: `Bearer ${token}`, ...init.headers },
});
const path = (suffix: string) => suffix.split("?")[0].split("/");
const allMocks = () => [...Object.values(reads), ...Object.values(drafts)];

beforeEach(() => {
  vi.stubEnv("REGISTRY_INTERNAL_ACCESS_ENABLED", "true");
  vi.stubEnv("REGISTRY_INTERNAL_READ_ENABLED", "true");
  vi.stubEnv("REGISTRY_INTERNAL_READ_HTTP_ENABLED", "true");
  allMocks().forEach(mock => mock.mockReset());
  reads.listRegistryProjects.mockResolvedValue({ result: { items: [summary], nextCursor: null } });
  reads.getRegistryProject.mockResolvedValue({ result: { ...summary, effectiveActions: [{ action: "READ_DRAFT", expiresAt: time }] } });
  reads.getRegistryQualifications.mockResolvedValue({ result: { actions: [{ action: "READ_DRAFT", expiresAt: time }] } });
  reads.getRegistryVersion.mockResolvedValue({ result: version });
  reads.listRegistryVersions.mockResolvedValue({ result: { items: [version], nextCursor: null } });
  reads.listRegistryReviews.mockResolvedValue({ result: { items: [review], nextCursor: null } });
  reads.listRegistryReleaseHistory.mockResolvedValue({ result: { items: [{ id: objectId, projectId, versionId: objectId, version: "1.0.0", contentHash,
    visibilityAtApproval: "PRIVATE", state: "WITHDRAWN", publishedAt: time, withdrawnAt: time, intent: "PUBLISH" }], nextCursor: null } });
  reads.listRegistryReleaseRequests.mockResolvedValue({ result: { items: [{ id: objectId, projectId, versionId: objectId, version: "1.0.0", contentHash,
    intent: "PUBLISH", targetReleaseId: null, visibility: "PRIVATE", expiresAt: time, approvalId: null, state: "PENDING", expired: false, stale: false,
    requestedByViewer: true, approvedByViewer: false }], nextCursor: null } });
  reads.getRegistryReadReleaseHead.mockResolvedValue({ result: { projectId, currentReleaseId: null, visibility: "PRIVATE" }, etag: `"release:${projectId}:1"` });
  drafts.getRegistryDraft.mockResolvedValue({ result: draft, contentHash, etag });
  drafts.getRegistryDraftHead.mockResolvedValue({ result: { id: objectId, projectId, revision: 1, state: "DRAFT", contentHash }, etag });
  drafts.getRegistryReview.mockResolvedValue({ result: review, etag });
});
afterEach(() => vi.unstubAllEnvs());

describe("internal read HTTP boundary", () => {
  it.each(["REGISTRY_INTERNAL_ACCESS_ENABLED", "REGISTRY_INTERNAL_READ_ENABLED", "REGISTRY_INTERNAL_READ_HTTP_ENABLED"])("requires %s independently", async flag => {
    vi.stubEnv(flag, "false");
    const response = await createRegistryReadHandler()(request("projects"), ["projects"]);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "DISABLED" });
    expect(allMocks().every(mock => mock.mock.calls.length === 0)).toBe(true);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])("rejects %s without reading a body or invoking a service", async method => {
    const response = await createRegistryReadHandler()(request("projects", { method }), ["projects"]);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(await response.json()).toEqual({ code: "METHOD_NOT_ALLOWED" });
    expect(allMocks().every(mock => mock.mock.calls.length === 0)).toBe(true);
  });

  it("does not treat cookies or query tokens as authentication", async () => {
    const response = await createRegistryReadHandler()(request("projects?accessToken=forged", { headers: { authorization: "", cookie: "sb-access-token=forged" } }), ["projects"]);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "AUTH_REQUIRED" });
    expect(reads.listRegistryProjects).not.toHaveBeenCalled();
  });

  it.each(["", "Basic abc", "Bearer a b", "Bearer a,b", `Bearer ${"a".repeat(16385)}`])("rejects malformed bearer credentials", async authorization => {
    const response = await createRegistryReadHandler()(request("projects", { headers: { authorization } }), ["projects"]);
    expect(response.status).toBe(401);
    expect(reads.listRegistryProjects).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([
    { origin: "https://other.example" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" },
  ])("rejects a foreign browser origin before reading data", async extra => {
    const response = await createRegistryReadHandler()(request("projects", { headers: extra }), ["projects"]);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "FORBIDDEN" });
    expect(reads.listRegistryProjects).not.toHaveBeenCalled();
  });

  it("accepts same-origin browser reads and never emits CORS or cacheable responses", async () => {
    const response = await createRegistryReadHandler()(request("projects", { headers: { origin: "https://internal.example", "sec-fetch-site": "same-origin" } }), ["projects"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toContain("Authorization");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("etag")).toBeNull();
    expect(await response.json()).toEqual({ result: { items: [summary], nextCursor: null }, replayed: false });
  });

  it.each([
    "projects?ownerId=forged", "projects?projectId=forged", "projects?limit=51", "projects?limit=0", "projects?limit=1.5", "projects?limit=01",
    "projects?limit=1&limit=2", "projects?after=invalid", "projects?after=", `projects/${projectId}?limit=1`, "projects/not-a-uuid",
    `projects/${projectId}/versions/nope`, `projects/${projectId}/drafts/nope/reviews`,
  ])("rejects invalid routing or query input: %s", async suffix => {
    const response = await createRegistryReadHandler()(request(suffix), path(suffix));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
    expect(allMocks().every(mock => mock.mock.calls.length === 0)).toBe(true);
  });

  it.each<Record<string, string>>([{ "content-length": "1" }, { "transfer-encoding": "chunked" }])("refuses GET body framing", async extra => {
    const response = await createRegistryReadHandler()(request("projects", { headers: extra }), ["projects"]);
    expect(response.status).toBe(422);
    expect(reads.listRegistryProjects).not.toHaveBeenCalled();
  });

  it("passes only a caller token and bounded pagination to project listing", async () => {
    const suffix = `projects?limit=50&after=${objectId}`;
    const response = await createRegistryReadHandler()(request(suffix), ["projects"]);
    expect(response.status).toBe(200);
    expect(reads.listRegistryProjects).toHaveBeenCalledWith({ accessToken: token, limit: 50, after: objectId });
  });

  it.each([
    ["qualifications", "getRegistryQualifications"], [`projects/${projectId}`, "getRegistryProject"],
    [`projects/${projectId}/versions`, "listRegistryVersions"], [`projects/${projectId}/versions/${objectId}`, "getRegistryVersion"],
    [`projects/${projectId}/drafts/${objectId}/reviews`, "listRegistryReviews"], [`projects/${projectId}/releases`, "listRegistryReleaseHistory"],
    [`projects/${projectId}/release-requests`, "listRegistryReleaseRequests"], [`projects/${projectId}/release/head`, "getRegistryReadReleaseHead"],
  ] as const)("maps %s to an authorized backend read", async (suffix, service) => {
    const response = await createRegistryReadHandler()(request(suffix), path(suffix));
    expect(response.status).toBe(200);
    expect(reads[service]).toHaveBeenCalledOnce();
    const body = await response.json();
    expect(body.replayed).toBe(false);
    expect(Object.keys(body).sort()).toEqual(service === "getRegistryReadReleaseHead" ? ["etag", "replayed", "result"] : ["replayed", "result"]);
  });

  it("returns a verified server hash in the draft DTO and preserves its ETag", async () => {
    const suffix = `projects/${projectId}/draft`;
    const response = await createRegistryReadHandler()(request(suffix), path(suffix));
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe(etag);
    expect(await response.json()).toEqual({ result: { ...draft, contentHash }, etag, replayed: false });
    drafts.getRegistryDraft.mockResolvedValueOnce({ result: draft, contentHash: "0".repeat(64), etag });
    const invalid = await createRegistryReadHandler()(request(suffix), path(suffix));
    expect(invalid.status).toBe(503);
    expect(await invalid.json()).toEqual({ code: "UNAVAILABLE" });
  });

  it("returns null only for an uninitialized draft head hash", async () => {
    drafts.getRegistryDraftHead.mockResolvedValueOnce({ result: { id: objectId, projectId, revision: 1, state: "DRAFT", contentHash: null }, etag });
    const suffix = `projects/${projectId}/draft/head`;
    const response = await createRegistryReadHandler()(request(suffix), path(suffix));
    expect(response.status).toBe(200);
    expect((await response.json()).result.contentHash).toBeNull();
  });

  it("returns review identity as a caller-relative boolean", async () => {
    const suffix = `projects/${projectId}/reviews/${objectId}`;
    const response = await createRegistryReadHandler()(request(suffix), path(suffix));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: review, etag, replayed: false });
  });

  it.each(["ownerId", "storageRef", "reviewerId", "credentials", "auditRecords", "currentReleaseId"])("rejects leaked %s instead of serializing internal fields", async field => {
    reads.getRegistryProject.mockResolvedValueOnce({ result: { ...summary, effectiveActions: [], [field]: "private-sentinel" } });
    const suffix = `projects/${projectId}`;
    const response = await createRegistryReadHandler()(request(suffix), path(suffix));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"code":"UNAVAILABLE"}');
  });

  it("rejects oversized malformed backend output without sending its bytes", async () => {
    reads.listRegistryProjects.mockResolvedValueOnce({ result: { items: [summary], nextCursor: null, internalDump: "x".repeat(17 * 1024 * 1024) } });
    const response = await createRegistryReadHandler()(request("projects"), ["projects"]);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"code":"UNAVAILABLE"}');
  });

  it("sanitizes protocol, unknown and database errors and chooses status from the stable code", async () => {
    const handler = createRegistryReadHandler();
    for (const [error, status, code] of [
      [new RegistryProtocolError("AUTH_REQUIRED", 302), 401, "AUTH_REQUIRED"], [new RegistryProtocolError("NOT_FOUND", 404), 404, "NOT_FOUND"],
      [new RegistryProtocolError("private-sentinel", 500), 503, "UNAVAILABLE"], [new Error("postgres password=private-sentinel"), 503, "UNAVAILABLE"],
    ] as const) {
      reads.listRegistryProjects.mockRejectedValueOnce(error);
      const response = await handler(request("projects"), ["projects"]);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ code });
    }
  });

  it("throttles repeated tokens before Auth and resets after a minute", async () => {
    let tick = 1_000;
    const handler = createRegistryReadHandler(() => tick);
    for (let i = 0; i < 60; i++) expect((await handler(request("projects"), ["projects"])).status).toBe(200);
    const response = await handler(request("projects"), ["projects"]);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toEqual({ code: "RATE_LIMITED" });
    expect(reads.listRegistryProjects).toHaveBeenCalledTimes(60);
    tick += 60_000;
    expect((await handler(request("projects"), ["projects"])).status).toBe(200);
  });

  it("enforces the global budget even when attacker tokens change", async () => {
    const handler = createRegistryReadHandler(() => 1_000);
    for (let i = 0; i < 600; i++) {
      const response = await handler(request("projects", { headers: { authorization: `Bearer invalid.${i}` } }), ["projects"]);
      expect(response.status).toBe(200);
    }
    const response = await handler(request("projects", { headers: { authorization: "Bearer different.token" } }), ["projects"]);
    expect(response.status).toBe(429);
    expect(reads.listRegistryProjects).toHaveBeenCalledTimes(600);
  });

  it("wires the Next catch-all route to the same read boundary and explicitly rejects every write method", async () => {
    const route = await import("@/app/api/internal/registry/[[...path]]/route");
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
    const response = await route.GET(request("qualifications"), { params: Promise.resolve({ path: ["qualifications"] }) });
    expect(response.status).toBe(200);
    expect(reads.getRegistryQualifications).toHaveBeenCalledOnce();
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const) {
      const rejected = await route[method](request("projects", { method }), { params: Promise.resolve({ path: ["projects"] }) });
      expect(rejected.status).toBe(405);
      expect(rejected.headers.get("allow")).toBe("GET");
    }
    expect(reads.listRegistryProjects).not.toHaveBeenCalled();
  });
});
