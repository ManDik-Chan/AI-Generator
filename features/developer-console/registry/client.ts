/*
 * GET-only client for the internal Registry read API (P1-C1-A).
 *
 * - Authenticates with `Authorization: Bearer` only. Requests are sent with `credentials: "omit"`,
 *   so the session cookie is never offered as a substitute.
 * - The access token is fetched per request from `getAccessToken` and kept in a local variable for
 *   that request only. It is never stored, logged, placed in a URL or copied into a result or error.
 * - Every response is parsed with the strict contract schemas; unknown fields, a mismatched project
 *   binding or an unexpected status/code pair are reported as CONTRACT_MISMATCH instead of rendered.
 * - After a 429 the client refuses to send anything until Retry-After has passed.
 * - There is no write method. The only HTTP method this module can produce is GET.
 */
import type { z } from "zod";

import {
  READ_ERROR_STATUS, draftHeadReadSchema, draftReadSchema, envelopeSchema, errorBodySchema, isUuid, schemas, versionReadSchema,
  type DraftHeadRead, type DraftRead, type Page, type ProjectReadDTO, type ProjectSummaryDTO, type Qualifications, type ReadError,
  type ReleaseHeadRead, type ReleaseRecordDTO, type ReleaseRequestDTO, type ReviewDTO, type VersionRead,
} from "@/features/developer-console/registry/contract";

export const REGISTRY_READ_BASE = "/api/internal/registry";
export const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const TIMEOUT_MS = 20_000;
const TOKEN = /^[A-Za-z0-9._~-]{1,16384}$/;

export interface PageRequest {
  limit?: number;
  after?: string | null;
}

export type ReadResult<T> = { ok: true; data: T; etag: string | null } | { ok: false; error: ReadError };

export interface RegistryReadClientOptions {
  fetch: typeof fetch;
  /** Current Supabase access token, or null when signed out. Called for every request. */
  getAccessToken: () => Promise<string | null>;
  /** Origin-relative base path; defaults to the internal read route. */
  basePath?: string;
  now?: () => number;
}

export interface RegistryReadClient {
  qualifications(): Promise<ReadResult<Qualifications>>;
  projects(page?: PageRequest): Promise<ReadResult<Page<ProjectSummaryDTO>>>;
  project(projectId: string): Promise<ReadResult<ProjectReadDTO>>;
  draftHead(projectId: string): Promise<ReadResult<DraftHeadRead>>;
  draft(projectId: string): Promise<ReadResult<DraftRead>>;
  reviews(projectId: string, draftId: string, page?: PageRequest): Promise<ReadResult<Page<ReviewDTO>>>;
  review(projectId: string, reviewId: string): Promise<ReadResult<ReviewDTO>>;
  versions(projectId: string, page?: PageRequest): Promise<ReadResult<Page<VersionRead>>>;
  version(projectId: string, versionId: string): Promise<ReadResult<VersionRead>>;
  releaseHead(projectId: string): Promise<ReadResult<ReleaseHeadRead>>;
  releases(projectId: string, page?: PageRequest): Promise<ReadResult<Page<ReleaseRecordDTO>>>;
  releaseRequests(projectId: string, page?: PageRequest): Promise<ReadResult<Page<ReleaseRequestDTO>>>;
  /** Epoch ms until which requests are refused locally after a 429, or null. */
  blockedUntil(): number | null;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const fail = (error: ReadError): { ok: false; error: ReadError } => ({ ok: false, error });
const mismatch = (status: number) => fail({ code: "CONTRACT_MISMATCH", status });

interface Spec<T> {
  path: string[];
  /** Every path segment that is an ID; each must be a UUID or nothing is sent. */
  ids?: string[];
  page?: PageRequest;
  schema: z.ZodType<T>;
  etag: "draft" | "release" | null;
  /** Rejects a well-formed response that belongs to another project or object. */
  bound?: (data: T) => boolean;
}

export function createRegistryReadClient({ fetch: send, getAccessToken, basePath = REGISTRY_READ_BASE, now = Date.now }: RegistryReadClientOptions): RegistryReadClient {
  let blocked: number | null = null;

  function query(page: PageRequest | undefined): string | null {
    if (!page) return "";
    const params = new URLSearchParams();
    if (page.limit !== undefined) {
      if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > MAX_PAGE_SIZE) return null;
      params.set("limit", String(page.limit));
    }
    if (page.after !== undefined && page.after !== null) {
      if (!isUuid(page.after)) return null;
      params.set("after", page.after);
    }
    const encoded = params.toString();
    return encoded ? `?${encoded}` : "";
  }

  async function token(): Promise<string | null> {
    try {
      const value = await getAccessToken();
      return typeof value === "string" && TOKEN.test(value) ? value : null;
    } catch {
      return null;
    }
  }

  async function get<T>(spec: Spec<T>): Promise<ReadResult<T>> {
    const at = now();
    if (blocked !== null && at < blocked) return fail({ code: "RATE_LIMITED", status: 0, retryAt: blocked });
    blocked = null;
    const search = query(spec.page);
    // IDs come from route params and earlier responses; a malformed one is never sent.
    if (search === null || (spec.ids ?? []).some((id) => typeof id !== "string" || !isUuid(id))) return fail({ code: "INVALID_INPUT", status: 0 });
    const bearer = await token();
    if (bearer === null) return fail({ code: "AUTH_REQUIRED", status: 0 });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    let text: string;
    try {
      response = await send(`${basePath}/${spec.path.map(encodeURIComponent).join("/")}${search}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      text = await response.text();
    } catch {
      return fail({ code: "NETWORK", status: 0 });
    } finally {
      clearTimeout(timer);
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return mismatch(response.status);
    }

    if (response.status !== 200) {
      const parsed = errorBodySchema.safeParse(body);
      if (!parsed.success || READ_ERROR_STATUS[parsed.data.code] !== response.status) return mismatch(response.status);
      const code = parsed.data.code;
      if (code === "RATE_LIMITED") {
        const seconds = Number(response.headers.get("retry-after"));
        blocked = now() + (Number.isInteger(seconds) && seconds > 0 && seconds <= 3600 ? seconds : 60) * 1000;
        return fail({ code, status: response.status, retryAt: blocked });
      }
      return fail({ code, status: response.status });
    }

    const parsed = envelopeSchema(spec.schema, spec.etag).safeParse(body);
    if (!parsed.success) return mismatch(200);
    const { result } = parsed.data as { result: T };
    const etag = "etag" in parsed.data ? (parsed.data.etag as string) : null;
    const header = response.headers.get("etag");
    if (etag !== null && header !== null && header !== etag) return mismatch(200);
    if (spec.bound && !spec.bound(result)) return mismatch(200);
    return { ok: true, data: result, etag };
  }

  const page = <T>(item: z.ZodType<T>) => schemas.page(item) as unknown as z.ZodType<Page<T>>;
  const inProject = (projectId: string) => (item: { projectId: string }) => same(item.projectId, projectId);
  const allInProject = (projectId: string) => (data: Page<{ projectId: string }>) => data.items.every(inProject(projectId));
  const snapshotBound = (projectId: string) => (version: VersionRead) =>
    same(version.projectId, projectId) && same(version.snapshot.manifest.projectId, projectId) && version.snapshot.manifest.version === version.version;

  return {
    qualifications: () => get({ path: ["qualifications"], schema: schemas.qualifications, etag: null }),
    projects: (request = {}) => get({ path: ["projects"], page: request, schema: page(schemas.projectSummary), etag: null }),
    project: (projectId) => get({ path: ["projects", projectId], ids: [projectId], schema: schemas.project, etag: null, bound: (project) => same(project.id, projectId) }),
    draftHead: (projectId) => get({ path: ["projects", projectId, "draft", "head"], ids: [projectId], schema: draftHeadReadSchema, etag: "draft", bound: inProject(projectId) }),
    draft: (projectId) => get({
      path: ["projects", projectId, "draft"], ids: [projectId], schema: draftReadSchema, etag: "draft",
      bound: (draft) => same(draft.projectId, projectId) && same(draft.payload.manifest.projectId, projectId) && same(draft.payload.presentation.projectId, projectId),
    }),
    reviews: (projectId, draftId, request = {}) => get({
      path: ["projects", projectId, "drafts", draftId, "reviews"], ids: [projectId, draftId], page: request, schema: page(schemas.review), etag: null,
      bound: (data) => data.items.every((review) => same(review.projectId, projectId) && same(review.draftId, draftId)),
    }),
    review: (projectId, reviewId) => get({
      path: ["projects", projectId, "reviews", reviewId], ids: [projectId, reviewId], schema: schemas.review, etag: "draft",
      bound: (review) => same(review.projectId, projectId) && same(review.id, reviewId),
    }),
    versions: (projectId, request = {}) => get({
      path: ["projects", projectId, "versions"], ids: [projectId], page: request, schema: page(versionReadSchema), etag: null,
      bound: (data) => data.items.every(snapshotBound(projectId)),
    }),
    version: (projectId, versionId) => get({
      path: ["projects", projectId, "versions", versionId], ids: [projectId, versionId], schema: versionReadSchema, etag: null,
      bound: (version) => snapshotBound(projectId)(version) && same(version.id, versionId),
    }),
    releaseHead: (projectId) => get({ path: ["projects", projectId, "release", "head"], ids: [projectId], schema: schemas.releaseHead, etag: "release", bound: inProject(projectId) }),
    releases: (projectId, request = {}) => get({ path: ["projects", projectId, "releases"], ids: [projectId], page: request, schema: page(schemas.releaseRecord), etag: null, bound: allInProject(projectId) }),
    releaseRequests: (projectId, request = {}) => get({ path: ["projects", projectId, "release-requests"], ids: [projectId], page: request, schema: page(schemas.releaseRequest), etag: null, bound: allInProject(projectId) }),
    blockedUntil: () => (blocked !== null && now() < blocked ? blocked : null),
  };
}
