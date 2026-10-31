import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { draftDTOSchema, versionDTOSchema } from "./contracts";
import { hashSnapshot } from "./canonical";
import { getRegistryDraft, getRegistryDraftHead, getRegistryReview, RegistryProtocolError } from "./protocol";
import { reviewDTOSchema } from "./read-contracts";
import { pageSchema, projectReadDTOSchema, projectSummaryDTOSchema, qualificationsDTOSchema,
  releaseHeadReadDTOSchema, releaseRecordDTOSchema, releaseRequestDTOSchema } from "./query-contracts";
import { getRegistryProject, getRegistryQualifications, getRegistryReadReleaseHead, getRegistryVersion,
  listRegistryProjects, listRegistryReleaseHistory, listRegistryReleaseRequests, listRegistryReviews, listRegistryVersions } from "./read";

const id = z.string().uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().positive().max(2_147_483_647);
const draftHeadSchema = z.object({ id, projectId: id, revision, state: z.enum(["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"]), contentHash: digest.nullable() }).strict();
const draftTag = z.string().regex(/^"draft:[0-9a-f-]{36}:[1-9][0-9]*"$/);
const releaseTag = z.string().regex(/^"release:[0-9a-f-]{36}:[1-9][0-9]*"$/);
const envelope = (result: z.ZodType, etag?: z.ZodType) => etag
  ? z.object({ result, etag }).strict() : z.object({ result }).strict();
const errorStatuses: Readonly<Record<string, number>> = {
  AUTH_REQUIRED: 401, FORBIDDEN: 403, NOT_FOUND: 404, INVALID_INPUT: 422,
  DISABLED: 403, UNAVAILABLE: 503, DRAFT_UNINITIALIZED: 409, CONFLICT: 409,
  REVIEW_INVALID: 409, HASH_MISMATCH: 409, APPROVAL_INVALID: 409,
};
const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Authorization, Origin",
  "X-Content-Type-Options": "nosniff", "Content-Type": "application/json; charset=utf-8" };
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
type Operation = { run: () => Promise<unknown>; schema: z.ZodType; draft?: boolean };

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  const encoded = JSON.stringify(body);
  if (Buffer.byteLength(encoded, "utf8") > MAX_RESPONSE_BYTES) return new Response('{"code":"UNAVAILABLE"}', { status: 503, headers });
  return new Response(encoded, { status, headers: { ...headers, ...extra } });
}
const failure = (code: string, status: number, extra?: Record<string, string>) => json({ code }, status, extra);

function pagination(url: URL): { limit?: number; after?: string } | null {
  const keys = [...url.searchParams.keys()];
  if (keys.some(key => !["limit", "after"].includes(key)) || new Set(keys).size !== keys.length) return null;
  const limit = url.searchParams.get("limit"), after = url.searchParams.get("after");
  if (limit !== null && (!/^[1-9][0-9]?$/.test(limit) || Number(limit) > 50)) return null;
  if (after !== null && !id.safeParse(after).success) return null;
  return { ...(limit === null ? {} : { limit: Number(limit) }), ...(after === null ? {} : { after }) };
}

function operation(path: readonly string[], url: URL, accessToken: string): Operation | null {
  const token = { accessToken }, page = pagination(url);
  if (!page) return null;
  const noQuery = url.searchParams.size === 0;
  if (path.length === 1 && path[0] === "qualifications" && noQuery) {
    return { run: () => getRegistryQualifications(token), schema: envelope(qualificationsDTOSchema) };
  }
  if (path[0] !== "projects") return null;
  if (path.length === 1) return { run: () => listRegistryProjects({ ...token, ...page }), schema: envelope(pageSchema(projectSummaryDTOSchema)) };
  if (!id.safeParse(path[1]).success) return null;
  const project = { ...token, projectId: path[1] };
  if (path.length === 2 && noQuery) return { run: () => getRegistryProject(project), schema: envelope(projectReadDTOSchema) };
  if (path.length === 3) {
    if (path[2] === "draft" && noQuery) return { run: () => getRegistryDraft(project),
      schema: z.object({ result: draftDTOSchema, contentHash: digest, etag: draftTag }).strict(), draft: true };
    if (path[2] === "versions") return { run: () => listRegistryVersions({ ...project, ...page }), schema: envelope(pageSchema(versionDTOSchema)) };
    if (path[2] === "releases") return { run: () => listRegistryReleaseHistory({ ...project, ...page }), schema: envelope(pageSchema(releaseRecordDTOSchema)) };
    if (path[2] === "release-requests") return { run: () => listRegistryReleaseRequests({ ...project, ...page }), schema: envelope(pageSchema(releaseRequestDTOSchema)) };
  }
  if (path.length === 4) {
    if (path[2] === "draft" && path[3] === "head" && noQuery) return { run: () => getRegistryDraftHead(project), schema: envelope(draftHeadSchema, draftTag) };
    if (path[2] === "release" && path[3] === "head" && noQuery) return { run: () => getRegistryReadReleaseHead(project), schema: envelope(releaseHeadReadDTOSchema, releaseTag) };
    if (id.safeParse(path[3]).success && noQuery) {
      if (path[2] === "versions") return { run: () => getRegistryVersion({ ...project, versionId: path[3] }), schema: envelope(versionDTOSchema) };
      if (path[2] === "reviews") return { run: () => getRegistryReview({ ...project, reviewId: path[3] }), schema: envelope(reviewDTOSchema, draftTag) };
    }
  }
  if (path.length === 5 && path[2] === "drafts" && id.safeParse(path[3]).success && path[4] === "reviews") {
    return { run: () => listRegistryReviews({ ...project, draftId: path[3], ...page }), schema: envelope(pageSchema(reviewDTOSchema)) };
  }
  return null;
}

/** Each process enforces a global budget and a bounded hashed-token budget before Auth.
 * Deployments with multiple processes must additionally enforce a shared ingress budget.
 */
export function createRegistryReadHandler(now: () => number = Date.now) {
  let windowStart = 0, globalCount = 0;
  const counts = new Map<string, number>();
  return async function handle(request: Request, path: readonly string[]): Promise<Response> {
    if (process.env.REGISTRY_INTERNAL_ACCESS_ENABLED !== "true" || process.env.REGISTRY_INTERNAL_READ_ENABLED !== "true"
      || process.env.REGISTRY_INTERNAL_READ_HTTP_ENABLED !== "true") return failure("DISABLED", 403);
    if (request.method !== "GET") return failure("METHOD_NOT_ALLOWED", 405, { Allow: "GET" });
    if (request.url.length > 2048 || path.length > 5 || request.body !== null || request.headers.has("transfer-encoding")
      || (request.headers.has("content-length") && request.headers.get("content-length") !== "0")) return failure("INVALID_INPUT", 422);
    const url = new URL(request.url), origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
    if ((origin !== null && origin !== url.origin) || (site !== null && !["same-origin", "none"].includes(site))) return failure("FORBIDDEN", 403);
    const time = now();
    if (time - windowStart >= 60_000 || time < windowStart) { windowStart = time; globalCount = 0; counts.clear(); }
    globalCount++;
    if (globalCount > 600) return failure("RATE_LIMITED", 429, { "Retry-After": "60" });
    const authorization = request.headers.get("authorization") ?? "";
    if (authorization.length > 16400) return failure("AUTH_REQUIRED", 401);
    const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
    if (!match || match[1].length > 16384) return failure("AUTH_REQUIRED", 401);
    const key = createHash("sha256").update(match[1]).digest("hex");
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count); // At most 600 keys in a window, constrained by the global budget.
    if (count > 60) return failure("RATE_LIMITED", 429, { "Retry-After": "60" });
    const selected = operation(path, url, match[1]);
    if (!selected) return failure("INVALID_INPUT", 422);
    try {
      const parsed = selected.schema.parse(await selected.run()) as { result: unknown; etag?: string; contentHash?: string };
      let result = parsed.result;
      if (selected.draft) {
        const draft = draftDTOSchema.parse(result);
        if (hashSnapshot(draft.payload) !== parsed.contentHash) return failure("UNAVAILABLE", 503);
        result = { ...draft, contentHash: parsed.contentHash };
      }
      return json({ result, ...(parsed.etag ? { etag: parsed.etag } : {}), replayed: false }, 200, parsed.etag ? { ETag: parsed.etag } : {});
    } catch (error) {
      if (error instanceof RegistryProtocolError && Object.hasOwn(errorStatuses, error.code)) return failure(error.code, errorStatuses[error.code]);
      return failure("UNAVAILABLE", 503);
    }
  };
}

export const handleRegistryRead = createRegistryReadHandler();
