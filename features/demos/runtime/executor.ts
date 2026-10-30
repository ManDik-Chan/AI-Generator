/*
 * Runs one server capability through the run lifecycle within a single request.
 *
 * PENDING → ACCEPTED → RUNNING → terminal, with:
 * - SUCCEEDED when execute() returns an output that passes the output schema;
 * - TIMED_OUT when execute() returns `ctx.partial(...)`, or when it is still running at
 *   deadline + grace (the executor stops waiting and aborts the context);
 * - CANCELLED when the caller's signal aborts (client disconnect);
 * - FAILED when execute() throws or returns an invalid output.
 * Errors thrown by capability code are never forwarded verbatim to the client.
 */
import type { z } from "zod";

import { isPartialResult, partialResult, RunInterrupt, type RunContext, type ServerCapability } from "@/features/demos/runtime/capability";
import { createRun, newRunId, transition, type Run } from "@/features/demos/runtime/run";

export type RunEvent<O = unknown> =
  | { type: "status"; run: Run<O> }
  | { type: "progress"; runId: string; data: unknown };

export interface ExecuteOptions {
  requestId: string;
  deadlineMs: number;
  signal?: AbortSignal;
  onEvent?: (event: RunEvent) => void;
  /** How long past the deadline to wait for a capability that ignores it. */
  graceMs?: number;
  clock?: { now(): number; date(): Date };
  runId?: string;
}

const defaultClock = { now: () => performance.now(), date: () => new Date() };

function yieldToEventLoop() {
  return new Promise<void>((resolve) => {
    if (typeof setImmediate === "function") setImmediate(resolve);
    else setTimeout(resolve, 0);
  });
}

export async function executeRun<I, O>(capability: ServerCapability<I, O>, input: I, options: ExecuteOptions): Promise<Run<O>> {
  const clock = options.clock ?? defaultClock;
  const emit = options.onEvent ?? (() => {});
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  let run = createRun<O>({
    id: options.runId ?? newRunId(),
    capability: capability.descriptor.id,
    capabilityVersion: capability.descriptor.version,
    requestId: options.requestId,
    at: clock.date(),
  });
  const step = (to: Run["status"], patch?: Partial<Pick<Run<O>, "output" | "error">>) => {
    const next = transition(run, to, clock.date(), patch);
    if (next !== run) {
      run = next;
      emit({ type: "status", run: run as Run });
    }
  };

  emit({ type: "status", run: run as Run });
  step("ACCEPTED");
  step("RUNNING");

  const started = clock.now();
  const deadline = started + options.deadlineMs;
  const ctx: RunContext = {
    signal: controller.signal,
    now: () => clock.now() - started,
    timeLeft: () => deadline - clock.now(),
    expired: () => clock.now() >= deadline,
    progress: (data) => {
      if (!controller.signal.aborted) emit({ type: "progress", runId: run.id, data });
    },
    checkpoint: async () => {
      await yieldToEventLoop();
      if (controller.signal.aborted) throw new RunInterrupt("cancelled");
    },
    partial: (output) => partialResult(output),
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<"deadline">((resolve) => {
    timer = setTimeout(() => resolve("deadline"), Math.max(0, options.deadlineMs + (options.graceMs ?? 250)));
  });

  try {
    if (controller.signal.aborted) throw new RunInterrupt("cancelled");
    const work = capability.execute(input, ctx);
    // If the guard wins, the abandoned work rejects at its next checkpoint; keep that quiet.
    work.catch(() => {});
    const result = await Promise.race([work, guard]);
    if (result === "deadline") {
      controller.abort();
      step("TIMED_OUT", { error: { code: "DEADLINE_EXCEEDED", message: "运行超过截止时间，未返回结果。" } });
    } else if (options.signal?.aborted) {
      step("CANCELLED", { error: { code: "CANCELLED", message: "客户端已断开，运行被取消。" } });
    } else {
      const partial = isPartialResult<O>(result);
      const parsed = (capability.output as z.ZodType<O>).safeParse(partial ? result.output : result);
      if (!parsed.success) {
        step("FAILED", { error: { code: "INVALID_OUTPUT", message: "能力返回的结果不符合输出契约。" } });
      } else if (partial) {
        step("TIMED_OUT", { output: parsed.data, error: { code: "DEADLINE_EXCEEDED", message: "到达截止时间，返回目前最好的结果。" } });
      } else {
        step("SUCCEEDED", { output: parsed.data });
      }
    }
  } catch (error) {
    if (error instanceof RunInterrupt && error.reason === "cancelled") {
      step("CANCELLED", { error: { code: "CANCELLED", message: "客户端已断开，运行被取消。" } });
    } else if (error instanceof RunInterrupt) {
      step("TIMED_OUT", { error: { code: "DEADLINE_EXCEEDED", message: "运行超过截止时间，未返回结果。" } });
    } else {
      step("FAILED", { error: { code: "CAPABILITY_ERROR", message: "能力执行出错，没有产生结果。" } });
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
  return run;
}
