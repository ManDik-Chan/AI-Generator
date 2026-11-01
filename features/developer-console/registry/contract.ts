/*
 * Browser-side view of the P1-C1-A internal read HTTP contract (docs/registry-c1a-read-contracts.md).
 *
 * Review, project, qualification, Release and pagination schemas are imported from the shared
 * browser-safe Registry modules. Draft and Version schemas cannot be: features/registry/contracts.ts
 * imports the Node JCS hasher. They are mirrored here without the hash and uniqueness refinements,
 * and contract.test.ts fails if the mirror's structure drifts from the server schema. The server
 * already validated every response with the full schemas; this layer rejects anything that does not
 * match the published shape, including unknown fields, before the console renders it.
 */
import { z } from "zod";

import { CLAIM_STATUSES, MANIFEST_CAPABILITIES, MANIFEST_CATEGORIES, MANIFEST_SCHEMA_VERSION, MANIFEST_VISIBILITIES } from "@/features/platform/manifest";
import { reviewDTOSchema, type ReviewDTO } from "@/features/registry/read-contracts";
import {
  pageSchema, projectReadDTOSchema, projectSummaryDTOSchema, qualificationsDTOSchema, releaseHeadReadDTOSchema,
  releaseRecordDTOSchema, releaseRequestDTOSchema,
  type ProjectReadDTO, type ProjectSummaryDTO, type QualificationDTO, type ReleaseRecordDTO, type ReleaseRequestDTO,
} from "@/features/registry/query-contracts";

export type { ProjectReadDTO, ProjectSummaryDTO, QualificationDTO, ReleaseRecordDTO, ReleaseRequestDTO, ReviewDTO };

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const semver = z.string().max(100).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const text = z.string().min(1).max(500).refine((value) => value.trim().length > 0, "Text must not be blank");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().positive().max(2_147_483_647);
const dateTime = z.iso.datetime({ offset: true });
const assetIds = z.array(uuid).max(100);

/* ---- Mirror of draftPayloadSchema (features/registry/contracts.ts), structure only ---- */

const claim = z.object({
  topic: text, status: z.enum(CLAIM_STATUSES), description: text, evidenceAssetIds: assetIds, modelVersion: text.optional(),
}).strict();
const manifest = z.object({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION), projectId: uuid, slug: z.string().regex(/^[a-z][a-z0-9-]{2,62}$/), version: semver,
  name: text, summary: text, category: z.enum(MANIFEST_CATEGORIES), visibility: z.enum(MANIFEST_VISIBILITIES),
  integration: z.object({ mode: z.literal("SHOWCASE") }).strict(),
  capabilities: z.array(z.enum(MANIFEST_CAPABILITIES)).min(1).max(3), researchClaims: z.array(claim).max(40),
}).strict();
const metric = z.discriminatedUnion("status", [
  z.object({ name: text, status: z.literal("UNPUBLISHED") }).strict(),
  z.object({ name: text, status: z.literal("REPORTED"), value: z.number().finite(), unit: text,
    dataset: text, protocol: text, modelVersion: text, evidenceAssetId: uuid }).strict(),
]);
const sectionId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const section = z.discriminatedUnion("kind", [
  z.object({ id: sectionId, kind: z.literal("MARKDOWN"), title: text, body: z.string().max(20_000), sourceAssetIds: assetIds }).strict(),
  z.object({ id: sectionId, kind: z.literal("IMAGE"), title: text, assetId: uuid, alt: text }).strict(),
  z.object({ id: sectionId, kind: z.literal("BENCHMARKS"), title: text, metrics: z.array(metric).max(30) }).strict(),
]);
const presentation = z.object({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION), projectId: uuid, version: semver, title: text, sections: z.array(section).max(24),
}).strict();
const documentation = z.object({ id: uuid, title: text, language: z.enum(["zh", "en"]), assetId: uuid }).strict();

export const payloadViewSchema = z.object({ manifest, presentation, documentation: z.array(documentation).max(30) }).strict();
export type PayloadView = z.infer<typeof payloadViewSchema>;

/* ---- Draft and Version reads ---- */

const draftState = z.enum(["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"]);

/** Mirrors the private draftHeadSchema in features/registry/read-http.ts. */
export const draftHeadReadSchema = z.object({ id: uuid, projectId: uuid, revision, state: draftState, contentHash: hash.nullable() }).strict();
export type DraftHeadRead = z.infer<typeof draftHeadReadSchema>;

/** HTTP DraftReadDTO: the strict DraftDTO plus the server-computed JCS content hash. */
export const draftReadSchema = z.object({ id: uuid, projectId: uuid, revision, state: draftState, payload: payloadViewSchema, contentHash: hash }).strict();
export type DraftRead = z.infer<typeof draftReadSchema>;

export const HASH_ALGORITHM = "JCS-SHA256-v1" as const;
export const versionReadSchema = z.object({
  id: uuid, projectId: uuid, version: semver, snapshot: payloadViewSchema, contentHash: hash,
  hashAlgorithm: z.literal(HASH_ALGORITHM), reviewId: uuid, createdAt: dateTime,
}).strict();
export type VersionRead = z.infer<typeof versionReadSchema>;

export type ReleaseHeadRead = z.infer<typeof releaseHeadReadDTOSchema>;
export type Qualifications = z.infer<typeof qualificationsDTOSchema>;
export interface Page<T> { items: T[]; nextCursor: string | null }

/* ---- Envelope, ETags and errors ---- */

export const DRAFT_ETAG = /^"draft:[0-9a-f-]{36}:[1-9][0-9]*"$/;
export const RELEASE_ETAG = /^"release:[0-9a-f-]{36}:[1-9][0-9]*"$/;

type EtagKind = "draft" | "release" | null;
/** `{result, etag?, replayed:false}`. Only Draft, Review and Release-head reads carry an ETag. */
export function envelopeSchema<T extends z.ZodType>(result: T, etag: EtagKind) {
  const replayed = z.literal(false);
  if (etag === null) return z.object({ result, replayed }).strict();
  return z.object({ result, etag: z.string().regex(etag === "draft" ? DRAFT_ETAG : RELEASE_ETAG), replayed }).strict();
}

/** Every error code the read HTTP adapter can return, with its status. */
export const READ_ERROR_STATUS = {
  AUTH_REQUIRED: 401, FORBIDDEN: 403, DISABLED: 403, NOT_FOUND: 404, METHOD_NOT_ALLOWED: 405,
  DRAFT_UNINITIALIZED: 409, CONFLICT: 409, REVIEW_INVALID: 409, HASH_MISMATCH: 409, APPROVAL_INVALID: 409,
  INVALID_INPUT: 422, RATE_LIMITED: 429, UNAVAILABLE: 503,
} as const;
export type ServerReadErrorCode = keyof typeof READ_ERROR_STATUS;
/**
 * Client-side outcomes that never come from the server: no network response, a response that does
 * not match the contract, or a request the client refused to send (no session, invalid ID, or a
 * rate-limit window still open).
 */
export type ClientReadErrorCode = "NETWORK" | "CONTRACT_MISMATCH";
export type ReadErrorCode = ServerReadErrorCode | ClientReadErrorCode;

export const errorBodySchema = z.object({ code: z.enum(Object.keys(READ_ERROR_STATUS) as [ServerReadErrorCode, ...ServerReadErrorCode[]]) }).strict();

/** Never carries a message, header or token: only the stable code, status and retry hint. */
export interface ReadError {
  code: ReadErrorCode;
  /** HTTP status; 0 when no response was received or the request was not sent. */
  status: number;
  /** Epoch ms when a rate-limit window closes. */
  retryAt?: number;
}

/** Errors after which previously read data for that scope must no longer be shown. */
export const REVOKING_CODES: ReadonlySet<ReadErrorCode> = new Set(["AUTH_REQUIRED", "FORBIDDEN", "DISABLED", "NOT_FOUND"]);

export const schemas = {
  qualifications: qualificationsDTOSchema,
  projectSummary: projectSummaryDTOSchema,
  project: projectReadDTOSchema,
  review: reviewDTOSchema,
  releaseHead: releaseHeadReadDTOSchema,
  releaseRecord: releaseRecordDTOSchema,
  releaseRequest: releaseRequestDTOSchema,
  page: pageSchema,
};

export const isUuid = (value: string) => uuid.safeParse(value).success;
