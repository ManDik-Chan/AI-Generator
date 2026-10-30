/*
 * HTTP helpers for the Demo Runtime API: bounded body reading, content negotiation,
 * client identification for rate limiting and uniform no-store responses.
 */
import { ApiError, errorBody } from "@/features/demos/runtime/errors";

export const API_VERSION = "v1";

export const baseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export function jsonResponse(body: unknown, init: { status?: number; requestId: string; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...baseHeaders, "Content-Type": "application/json; charset=utf-8", "X-Request-Id": init.requestId, ...init.headers },
  });
}

export function errorResponse(error: ApiError, requestId: string) {
  return jsonResponse(errorBody(error, requestId), { status: error.status, requestId, headers: error.headers });
}

/** Reject anything but JSON before reading the body. */
export function assertJsonContentType(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json(\s*;.*)?$/i.test(type.trim())) {
    throw new ApiError("UNSUPPORTED_MEDIA_TYPE", "请求体必须是 application/json。");
  }
}

/**
 * Read at most `maxBytes` of the body. The limit is enforced on the bytes actually
 * received; Content-Length is only used to reject early.
 */
export async function readBoundedText(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError("PAYLOAD_TOO_LARGE", `请求体不能超过 ${maxBytes} 字节。`);
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ApiError("PAYLOAD_TOO_LARGE", `请求体不能超过 ${maxBytes} 字节。`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  assertJsonContentType(request);
  const text = await readBoundedText(request, maxBytes);
  if (!text.trim()) throw new ApiError("INVALID_REQUEST", "请求体为空。");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("INVALID_REQUEST", "请求体不是有效的 JSON。");
  }
}

export function wantsEventStream(request: Request) {
  return (request.headers.get("accept") ?? "").toLowerCase().includes("text/event-stream");
}

/**
 * Best-effort client key for rate limiting. Vercel sets x-real-ip / x-forwarded-for;
 * the value stays in memory only and is never logged or returned.
 */
export function clientKey(request: Request) {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "anonymous";
}

export function encodeSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const sseHeaders = {
  ...baseHeaders,
  "Cache-Control": "no-store, no-transform",
  "Content-Type": "text/event-stream; charset=utf-8",
  "X-Accel-Buffering": "no",
} as const;
