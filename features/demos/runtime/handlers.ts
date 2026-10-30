/*
 * Request handlers of the Demo Runtime API, kept apart from the Next.js route files so
 * tests and the documentation examples can call them with plain Request objects.
 *
 * POST /api/demo/v1/runs
 *   1. limits: per-client sliding window and concurrency (429 RATE_LIMITED);
 *   2. body: application/json (415), ≤ capability.maxInputBytes (413), valid JSON (400);
 *   3. envelope { capability, input } (400), known capability (404), server-executed (422);
 *   4. input schema (400) and semantic rules (422);
 *   5. execute: JSON → 200 with the terminal Run; Accept: text/event-stream → SSE.
 */
import { z } from "zod";

import { ApiError, toIssues } from "@/features/demos/runtime/errors";
import { executeRun, type RunEvent } from "@/features/demos/runtime/executor";
import { clientKey, encodeSse, errorResponse, jsonResponse, readJsonBody, sseHeaders, wantsEventStream } from "@/features/demos/runtime/http";
import { ConcurrencyGate, rateLimitHeaders, SlidingWindowLimiter } from "@/features/demos/runtime/rate-limit";
import { findCapability, listCapabilities, serverCapabilities } from "@/features/demos/runtime/registry";
import { newRunId } from "@/features/demos/runtime/run";

/** Envelope cap before the capability's own limit is known. */
export const MAX_ENVELOPE_BYTES = 64 * 1024;

export const runRequestSchema = z
  .object({
    capability: z.string().min(1).max(100),
    input: z.unknown(),
  })
  .strict();

export interface DemoApiDeps {
  limiter: SlidingWindowLimiter;
  gate: ConcurrencyGate;
  now: () => number;
  requestId: () => string;
}

export function createDemoApiDeps(): DemoApiDeps {
  return {
    limiter: new SlidingWindowLimiter(20, 60_000),
    gate: new ConcurrencyGate(8, 2),
    now: () => Date.now(),
    requestId: () => crypto.randomUUID(),
  };
}

/** Module-level instance for the deployed routes (one per function instance). */
export const sharedDeps = createDemoApiDeps();

export function handleListCapabilities(deps: DemoApiDeps = sharedDeps) {
  const requestId = deps.requestId();
  return jsonResponse({ object: "list", data: listCapabilities() }, { requestId });
}

export function handleGetCapability(id: string, deps: DemoApiDeps = sharedDeps) {
  const requestId = deps.requestId();
  const capability = findCapability(id);
  if (!capability) return errorResponse(new ApiError("NOT_FOUND", "没有这个能力。"), requestId);
  return jsonResponse(capability, { requestId });
}

export async function handleCreateRun(request: Request, deps: DemoApiDeps = sharedDeps): Promise<Response> {
  const requestId = deps.requestId();
  const key = clientKey(request);
  let release: (() => void) | null = null;
  try {
    const decision = deps.limiter.take(key, deps.now());
    const limitHeaders = rateLimitHeaders(decision);
    if (!decision.ok) {
      throw new ApiError("RATE_LIMITED", `请求过于频繁：每 60 秒最多 ${decision.limit} 次运行。`, undefined, { ...limitHeaders, "Retry-After": String(decision.resetSeconds) });
    }
    release = deps.gate.acquire(key);
    if (!release) {
      throw new ApiError("RATE_LIMITED", "同时进行的运行过多，请等当前运行结束后再试。", undefined, { ...limitHeaders, "Retry-After": "2" });
    }

    const body = await readJsonBody(request, MAX_ENVELOPE_BYTES);
    const envelope = runRequestSchema.safeParse(body);
    if (!envelope.success) throw new ApiError("INVALID_REQUEST", "请求体必须是 { capability, input }。", toIssues(envelope.error));

    const descriptor = findCapability(envelope.data.capability);
    if (!descriptor) throw new ApiError("NOT_FOUND", "没有这个能力。");
    const capability = serverCapabilities[descriptor.id];
    if (!capability) {
      throw new ApiError("SEMANTIC_REJECTION", "这个能力在访客的浏览器中运行，服务端不执行它。", [{ path: "capability", message: `${descriptor.id} 的 execution 是 ${descriptor.execution}。` }]);
    }

    const input = capability.input.safeParse(envelope.data.input);
    if (!input.success) throw new ApiError("INVALID_REQUEST", "input 不符合该能力的输入契约。", toIssues(input.error, "input"));
    const semantic = capability.validate?.(input.data) ?? [];
    if (semantic.length) throw new ApiError("SEMANTIC_REJECTION", "input 的取值组合无法执行。", semantic);

    const deadlineMs = Math.min(capability.deadlineOf?.(input.data) ?? capability.descriptor.limits.defaultDeadlineMs, capability.descriptor.limits.maxDeadlineMs);
    const runId = newRunId();
    const headers = { ...limitHeaders, "X-Run-Id": runId };

    if (!wantsEventStream(request)) {
      try {
        const run = await executeRun(capability, input.data, { requestId, deadlineMs, signal: request.signal, runId });
        return jsonResponse(run, { requestId, headers });
      } finally {
        release();
        release = null;
      }
    }

    const ownedRelease = release;
    release = null;
    const encoder = new TextEncoder();
    const abort = new AbortController();
    const onRequestAbort = () => abort.abort();
    request.signal?.addEventListener("abort", onRequestAbort, { once: true });
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const write = (event: string, data: unknown) => {
          if (abort.signal.aborted) return;
          try {
            controller.enqueue(encoder.encode(encodeSse(event, data)));
          } catch {
            abort.abort();
          }
        };
        try {
          await executeRun(capability, input.data, {
            requestId,
            deadlineMs,
            signal: abort.signal,
            runId,
            onEvent: (event: RunEvent) => {
              if (event.type === "status") write("run.status", event.run);
              else write("run.progress", { runId: event.runId, data: event.data });
            },
          });
        } finally {
          ownedRelease();
          request.signal?.removeEventListener("abort", onRequestAbort);
          try {
            controller.close();
          } catch {
            /* already closed by a disconnect */
          }
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, { status: 200, headers: { ...sseHeaders, "X-Request-Id": requestId, ...headers } });
  } catch (error) {
    release?.();
    if (error instanceof ApiError) return errorResponse(error, requestId);
    return errorResponse(new ApiError("INTERNAL_ERROR", "服务端出错，请稍后重试。"), requestId);
  }
}
