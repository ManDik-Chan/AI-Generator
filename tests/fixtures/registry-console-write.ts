/*
 * A small stateful stand-in for the P1-C2 write API plus the reads the editor uses, for unit tests of
 * the console's write client and stores. It models what the client depends on: ETag revisions,
 * idempotency receipts bound to the exact request, live authorization, the write switch, rate limits
 * and a write that commits but whose response is lost. Real handlers, JWTs and PostgreSQL are covered
 * by tests/integration/developer-console-registry-write.integration.test.ts.
 */
import { hashSnapshot } from "@/features/registry/canonical";
import type { DraftPayload } from "@/features/registry/contracts";
import { DRAFT, PROJECT, TOKEN, payloadFor } from "@/tests/fixtures/registry-console-read";

export { DRAFT, PROJECT, TOKEN };
export const SLUG = "console-read-fixture";
export const FUTURE = "2099-01-01T00:00:00.000Z";

export interface Sent { method: string; path: string; headers: Record<string, string>; body: string | null; init: RequestInit }

export function validPayload(version = "1.0.0", summary = "Edited in the console"): DraftPayload {
  const payload = payloadFor(PROJECT, version);
  payload.manifest.summary = summary;
  return payload;
}

export function fakeRegistry(initial: { payload?: DraftPayload | null; revision?: number } = {}) {
  const state = {
    revision: initial.revision ?? 1,
    payload: (initial.payload === undefined ? null : initial.payload) as DraftPayload | null,
    draftState: "DRAFT" as "DRAFT" | "IN_REVIEW",
    editGrant: true,
    roles: ["OWNER"] as string[],
    session: true,
    writesDisabled: false,
    canCreate: true,
    taken: new Set<string>(),
    created: new Map<string, string>(),
    rateLimitNext: 0,
    /** Commit the next write, then fail the fetch as if the connection dropped. */
    dropAfterCommit: 0,
    /** Fail the next write before it reaches the server. */
    dropBeforeCommit: 0,
    unavailableNext: 0,
  };
  const draftReceipts = new Map<string, { request: string; response: unknown }>();
  const createReceipts = new Map<string, { slug: string; id: string }>();
  const sent: Sent[] = [];
  const etag = () => `"draft:${DRAFT}:${state.revision}"`;
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
  const fail = (code: string, status: number, headers?: Record<string, string>) => json(status, { code }, headers);
  const lose = () => { throw new TypeError("Failed to fetch"); };

  /** Another writer saves the draft directly. */
  function otherWriterSaves(payload: DraftPayload) {
    state.payload = payload;
    state.revision += 1;
  }

  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "https://console.test");
    const path = url.pathname.replace(/^\/api\/internal\/registry\//, "");
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value]));
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? init.body : null;
    sent.push({ method, path, headers, body, init });
    const authorized = state.session && headers.authorization === `Bearer ${TOKEN}`;

    if (method === "GET") {
      if (!authorized) return fail("AUTH_REQUIRED", 401);
      const p = `projects/${PROJECT}`;
      if (path === p) {
        const effectiveActions = [{ action: "READ_DRAFT", expiresAt: FUTURE }, ...(state.editGrant && state.roles.some((role) => role === "OWNER" || role === "EDITOR") ? [{ action: "EDIT_DRAFT", expiresAt: FUTURE }] : [])];
        return json(200, { result: { id: PROJECT, slug: SLUG, visibility: "PRIVATE", roles: state.roles, effectiveActions }, replayed: false });
      }
      if (path === `${p}/draft/head`) {
        return json(200, { result: { id: DRAFT, projectId: PROJECT, revision: state.revision, state: state.draftState, contentHash: state.payload ? hashSnapshot(state.payload) : null }, etag: etag(), replayed: false }, { ETag: etag() });
      }
      if (path === `${p}/draft`) {
        if (!state.payload) return fail("DRAFT_UNINITIALIZED", 409);
        return json(200, { result: { id: DRAFT, projectId: PROJECT, revision: state.revision, state: state.draftState, payload: state.payload, contentHash: hashSnapshot(state.payload) }, etag: etag(), replayed: false }, { ETag: etag() });
      }
      return fail("NOT_FOUND", 404);
    }

    if (state.dropBeforeCommit > 0) { state.dropBeforeCommit -= 1; lose(); }
    if (state.writesDisabled) return fail("DISABLED", 403);
    if (state.rateLimitNext > 0) { state.rateLimitNext -= 1; return fail("RATE_LIMITED", 429, { "Retry-After": "7" }); }
    if (state.unavailableNext > 0) { state.unavailableNext -= 1; return fail("UNAVAILABLE", 503); }
    if (!authorized) return fail("AUTH_REQUIRED", 401);
    const key = headers["idempotency-key"] ?? "";

    if (method === "POST" && path === "projects") {
      if (!state.canCreate) return fail("FORBIDDEN", 403);
      const { slug } = JSON.parse(body!) as { slug: string };
      const receipt = createReceipts.get(key);
      if (receipt && receipt.slug !== slug) return fail("IDEMPOTENCY_CONFLICT", 409);
      let id = receipt?.id;
      if (!receipt) {
        if (state.taken.has(slug)) return fail("CONFLICT", 409);
        id = `c${String(createReceipts.size + 1).padStart(7, "0")}-0000-4000-8000-000000000000`;
        state.taken.add(slug);
        createReceipts.set(key, { slug, id });
      }
      if (state.dropAfterCommit > 0) { state.dropAfterCommit -= 1; lose(); }
      return json(201, { result: { id, slug }, replayed: Boolean(receipt) });
    }

    if (method === "PUT" && path === `projects/${PROJECT}/draft`) {
      const request = `${headers["if-match"]}|${body}`;
      const receipt = draftReceipts.get(key);
      if (receipt && receipt.request !== request) return fail("IDEMPOTENCY_CONFLICT", 409);
      if (!state.editGrant) return fail("FORBIDDEN", 403);
      if (receipt) {
        if (state.dropAfterCommit > 0) { state.dropAfterCommit -= 1; lose(); }
        return json(200, { ...(receipt.response as object), replayed: true }, { ETag: (receipt.response as { etag: string }).etag });
      }
      if (!headers["if-match"]) return fail("PRECONDITION_REQUIRED", 428);
      if (state.draftState !== "DRAFT") return fail("CONFLICT", 409);
      if (headers["if-match"] !== etag()) return fail("PRECONDITION_FAILED", 412);
      state.payload = JSON.parse(body!) as DraftPayload;
      state.revision += 1;
      const response = { result: { id: DRAFT, projectId: PROJECT, revision: state.revision, state: state.draftState, payload: state.payload }, etag: etag() };
      draftReceipts.set(key, { request, response });
      if (state.dropAfterCommit > 0) { state.dropAfterCommit -= 1; lose(); }
      return json(200, { ...response, replayed: false }, { ETag: etag() });
    }
    return fail("NOT_FOUND", 404);
  };

  return {
    state, sent, etag, otherWriterSaves,
    fetch: fetch as typeof globalThis.fetch,
    writes: () => sent.filter((call) => call.method !== "GET"),
  };
}
