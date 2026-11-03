import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { MAX_JSON_BYTES, parseStrictJson } from "./canonical";
import { createRegistryProjectCommand } from "./internal";
import { editRegistryDraft, RegistryProtocolError } from "./protocol";
import {
  createProjectRequestSchema, createProjectResponseSchema, editDraftResponseSchema,
  idempotencyKeySchema, registryWriteErrorStatuses, type RegistryWriteError,
} from "./write-contracts";

const projectId = z.string().uuid();
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization, Origin",
  "X-Content-Type-Options": "nosniff",
  "Content-Type": "application/json; charset=utf-8",
};
function json(body: unknown, status: number, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
}
function fail(code: RegistryWriteError["code"], extra?: Record<string, string>) {
  return json({ code }, registryWriteErrorStatuses[code], extra);
}

async function readBody(request: Request) {
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw new RegistryProtocolError("INVALID_INPUT", 422);
    if (Number(length) > MAX_JSON_BYTES) throw new RegistryProtocolError("PAYLOAD_TOO_LARGE", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RegistryProtocolError("INVALID_INPUT", 422);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) {
        void reader.cancel().catch(() => {});
        throw new RegistryProtocolError("PAYLOAD_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
    return parseStrictJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks, size)));
  } catch (error) {
    if (error instanceof RegistryProtocolError) throw error;
    throw new RegistryProtocolError("INVALID_INPUT", 422);
  } finally { reader.releaseLock(); }
}

export function isRegistryWriteRoute(method: string, path: readonly string[]) {
  return path[0] === "projects" && (
    (method === "POST" && path.length === 1) ||
    (method === "PUT" && path.length === 3 && path[2] === "draft")
  );
}

export function createRegistryWriteHandler(now: () => number = Date.now) {
  let window = -1, total = 0;
  const counts = new Map<string, number>();
  return async function handle(request: Request, path: readonly string[]): Promise<Response> {
    if (!isRegistryWriteRoute(request.method, path)) return fail("NOT_FOUND");
    const create = request.method === "POST";
    if (process.env.REGISTRY_INTERNAL_ACCESS_ENABLED !== "true" || process.env.REGISTRY_INTERNAL_WRITE_HTTP_ENABLED !== "true"
      || (!create && process.env.REGISTRY_DRAFT_REVIEW_ENABLED !== "true")) return fail("DISABLED");
    if (request.url.length > 2048) return fail("INVALID_INPUT");
    const url = new URL(request.url);
    const site = request.headers.get("sec-fetch-site");
    if (request.headers.get("origin") !== url.origin || (site !== null && site !== "same-origin" && site !== "none")) {
      return fail("FORBIDDEN");
    }
    const bucket = Math.floor(now() / 60_000);
    if (bucket !== window) { window = bucket; total = 0; counts.clear(); }
    if (++total > 120) return fail("RATE_LIMITED", { "Retry-After": "60" });
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.length <= 16391 ? /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization)?.[1] : undefined;
    if (!token) return fail("AUTH_REQUIRED");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const count = (counts.get(tokenHash) ?? 0) + 1;
    counts.set(tokenHash, count);
    if (count > 20) return fail("RATE_LIMITED", { "Retry-After": "60" });
    const key = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
    const ifMatch = request.headers.get("if-match") ?? undefined;
    if (!key.success || url.search || (create ? ifMatch !== undefined : !projectId.safeParse(path[1]).success)) {
      return fail("INVALID_INPUT");
    }
    if (!create && !ifMatch) return fail("PRECONDITION_REQUIRED");
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")
      || request.headers.has("content-encoding")) return fail("UNSUPPORTED_MEDIA_TYPE");
    try {
      const input = await readBody(request);
      if (create) {
        const body = createProjectRequestSchema.safeParse(input);
        if (!body.success) return fail("INVALID_INPUT");
        const result = createProjectResponseSchema.parse(await createRegistryProjectCommand(token, body.data, key.data));
        return json(result, 201);
      }
      const result = editDraftResponseSchema.parse(await editRegistryDraft({
        accessToken: token, projectId: path[1], ifMatch, idempotencyKey: key.data, input,
      }));
      return json(result, 200, { ETag: result.etag });
    } catch (error) {
      if (error instanceof RegistryProtocolError && Object.hasOwn(registryWriteErrorStatuses, error.code)) {
        return fail(error.code as RegistryWriteError["code"]);
      }
      return fail("UNAVAILABLE");
    }
  };
}

export const handleRegistryWrite = createRegistryWriteHandler();
