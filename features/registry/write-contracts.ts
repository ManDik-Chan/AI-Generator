import { z } from "zod";
import { draftDTOSchema, draftPayloadSchema } from "./contracts";

export const createProjectRequestSchema = z.object({ slug: z.string().regex(/^[a-z][a-z0-9-]{2,62}$/) }).strict();
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const createdProjectSchema = createProjectRequestSchema.extend({ id: z.string().uuid() });
export const createProjectResponseSchema = z.object({ result: createdProjectSchema, replayed: z.boolean() }).strict();
export const editDraftRequestSchema = draftPayloadSchema;
export const editDraftResponseSchema = z.object({
  result: draftDTOSchema,
  etag: z.string().regex(/^"draft:[0-9a-f-]{36}:[1-9][0-9]*"$/),
  replayed: z.boolean(),
}).strict();

export const registryWriteErrorStatuses = {
  AUTH_REQUIRED: 401, FORBIDDEN: 403, DISABLED: 403, NOT_FOUND: 404,
  INVALID_INPUT: 422, PRECONDITION_REQUIRED: 428, PRECONDITION_FAILED: 412,
  CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409, REPLAY_STALE: 409,
  PAYLOAD_TOO_LARGE: 413, UNSUPPORTED_MEDIA_TYPE: 415, RATE_LIMITED: 429, UNAVAILABLE: 503,
} as const;
export type RegistryWriteError = { code: keyof typeof registryWriteErrorStatuses };
export type CreateProjectRequest = z.input<typeof createProjectRequestSchema>;
export type CreateProjectResponse = z.output<typeof createProjectResponseSchema>;
export type EditDraftRequest = z.input<typeof editDraftRequestSchema>;
export type EditDraftResponse = z.output<typeof editDraftResponseSchema>;
