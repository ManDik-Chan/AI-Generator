/*
 * Browser-side view of the P1-C2 internal write HTTP contract (docs/registry-c2-write-contracts.md).
 *
 * features/registry/write-contracts.ts imports the Node JCS hasher through contracts.ts, so it cannot
 * run in the browser. The two response schemas are mirrored here on top of the existing structural
 * payload mirror (contract.ts); write-contract.test.ts fails if they drift from the server schemas.
 */
import { z } from "zod";

import { DRAFT_ETAG, payloadViewSchema, type PayloadView } from "@/features/developer-console/registry/contract";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const revision = z.number().int().positive().max(2_147_483_647);

export const SLUG_PATTERN = /^[a-z][a-z0-9-]{2,62}$/;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
/** The server's body limit, including whitespace. */
export const MAX_WRITE_BYTES = 256 * 1024;

export const createdProjectSchema = z.object({ slug: z.string().regex(SLUG_PATTERN), id: uuid }).strict();
export const createProjectResponseSchema = z.object({ result: createdProjectSchema, replayed: z.boolean() }).strict();
export type CreatedProject = z.infer<typeof createdProjectSchema>;

/** Mirror of draftDTOSchema: the write result carries no content hash. */
export const draftWriteResultSchema = z.object({
  id: uuid, projectId: uuid, revision, state: z.enum(["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"]), payload: payloadViewSchema,
}).strict();
export type DraftWriteResult = z.infer<typeof draftWriteResultSchema>;
export const editDraftResponseSchema = z.object({ result: draftWriteResultSchema, etag: z.string().regex(DRAFT_ETAG), replayed: z.boolean() }).strict();

/** Every error code the write HTTP adapter can return, with its status. */
export const WRITE_ERROR_STATUS = {
  AUTH_REQUIRED: 401, FORBIDDEN: 403, DISABLED: 403, NOT_FOUND: 404,
  INVALID_INPUT: 422, PRECONDITION_REQUIRED: 428, PRECONDITION_FAILED: 412,
  CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409, REPLAY_STALE: 409,
  PAYLOAD_TOO_LARGE: 413, UNSUPPORTED_MEDIA_TYPE: 415, RATE_LIMITED: 429, UNAVAILABLE: 503,
} as const;
export type ServerWriteErrorCode = keyof typeof WRITE_ERROR_STATUS;
export const writeErrorBodySchema = z.object({ code: z.enum(Object.keys(WRITE_ERROR_STATUS) as [ServerWriteErrorCode, ...ServerWriteErrorCode[]]) }).strict();

/** A definite answer: the server (or the client before sending) refused, and nothing was applied. */
export interface WriteError {
  code: ServerWriteErrorCode;
  /** HTTP status; 0 when the client refused to send (no session, invalid input, rate-limit window). */
  status: number;
  /** Epoch ms when a rate-limit window closes. */
  retryAt?: number;
}

/** Why the client cannot tell whether a write was applied. */
export type UnknownReason = "NETWORK" | "TIMEOUT" | "UNAVAILABLE" | "CONTRACT_MISMATCH";

export type WriteOutcome<T> =
  | { kind: "ok"; data: T; etag: string | null; replayed: boolean; status: number }
  | { kind: "rejected"; error: WriteError }
  | { kind: "unknown"; reason: UnknownReason; status: number };

/** Server-side rules the client can check before sending: the binding between manifest and presentation. */
export function payloadIssues(payload: unknown, binding?: { projectId: string; slug: string }): string[] {
  const parsed = payloadViewSchema.safeParse(payload);
  if (!parsed.success) {
    return parsed.error.issues.slice(0, 12).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  const value: PayloadView = parsed.data;
  const issues: string[] = [];
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (!same(value.presentation.projectId, value.manifest.projectId)) issues.push("presentation.projectId: 必须与 manifest.projectId 相同");
  if (value.presentation.version !== value.manifest.version) issues.push("presentation.version: 必须与 manifest.version 相同");
  if (binding && !same(value.manifest.projectId, binding.projectId)) issues.push("manifest.projectId: 必须是本项目的 ID");
  if (binding && value.manifest.slug !== binding.slug) issues.push(`manifest.slug: 必须是本项目的 slug（${binding.slug}）`);
  const ids = value.presentation.sections.map((section) => section.id);
  if (new Set(ids).size !== ids.length) issues.push("presentation.sections: 章节 ID 不能重复");
  if (new Set(value.manifest.capabilities).size !== value.manifest.capabilities.length) issues.push("manifest.capabilities: 能力不能重复");
  return issues;
}

/** Key order–independent JSON, for comparing payloads by value. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const samePayload = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);
