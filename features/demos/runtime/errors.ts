/*
 * Error vocabulary of the Demo Runtime API (/api/demo/v1).
 *
 * The codes and the { code, message, requestId } shape follow the P0.5 error protocol
 * (docs/developer/api-reference.md#错误处理). Two demo extensions are documented there:
 * the optional `issues` list for validation failures and INTERNAL_ERROR for unexpected
 * server faults. Messages never contain stack traces, input values, paths or keys.
 */
import { z } from "zod";

export const apiErrorCodes = [
  "INVALID_REQUEST",
  "NOT_FOUND",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "SEMANTIC_REJECTION",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const apiErrorStatus: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  SEMANTIC_REJECTION: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export const issueSchema = z
  .object({
    path: z.string().max(200).describe("Dot path into the request body, e.g. input.points.3"),
    message: z.string().max(300),
  })
  .strict();

export type Issue = z.infer<typeof issueSchema>;

export const apiErrorSchema = z
  .object({
    code: z.enum(apiErrorCodes),
    message: z.string().min(1).max(500),
    requestId: z.uuid(),
    issues: z.array(issueSchema).max(20).optional().describe("Demo extension: present for INVALID_REQUEST and SEMANTIC_REJECTION"),
  })
  .strict();

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

/** A request-level failure that becomes an HTTP error response. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: Issue[],
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get status() {
    return apiErrorStatus[this.code];
  }
}

/** Convert zod issues to the public issue list (at most 20, values never echoed). */
export function toIssues(error: z.ZodError, prefix = ""): Issue[] {
  return error.issues.slice(0, 20).map((issue) => ({
    path: [prefix, ...issue.path.map(String)].filter(Boolean).join(".") || "$",
    message: issue.message.slice(0, 300),
  }));
}

export function errorBody(error: ApiError, requestId: string): ApiErrorBody {
  return {
    code: error.code,
    message: error.message,
    requestId,
    ...(error.issues?.length ? { issues: error.issues } : {}),
  };
}
