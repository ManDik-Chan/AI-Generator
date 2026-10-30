/*
 * The Run resource shared by both demo transports (HTTP/SSE on the server, postMessage
 * in the browser). States and legal transitions come from features/platform/run-lifecycle
 * (PENDING → ACCEPTED → RUNNING → SUCCEEDED | FAILED | CANCELLED | TIMED_OUT).
 */
import { z } from "zod";

import { advanceRun, isTerminal } from "@/features/platform/run-lifecycle";
import type { RunStatus } from "@/features/platform/types";

export const runStatuses = ["PENDING", "ACCEPTED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"] as const satisfies readonly RunStatus[];
export const runStatusSchema = z.enum(runStatuses);

/** Why a run ended without SUCCEEDED. Codes are stable; messages are for people. */
export const runErrorCodes = ["DEADLINE_EXCEEDED", "CANCELLED", "CAPABILITY_ERROR", "INVALID_OUTPUT", "DIVERGED", "INVALID_STATE"] as const;
export type RunErrorCode = (typeof runErrorCodes)[number];

export const runErrorSchema = z
  .object({
    code: z.enum(runErrorCodes),
    message: z.string().min(1).max(300),
  })
  .strict();

export type RunError = z.infer<typeof runErrorSchema>;

export const runTransitionSchema = z
  .object({
    status: runStatusSchema,
    at: z.iso.datetime(),
  })
  .strict();

export const RUN_ID_PATTERN = /^run_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Build the Run schema for a given output schema. */
export function runSchemaFor<T extends z.ZodType>(output: T) {
  return z
    .object({
      object: z.literal("run"),
      id: z.string().regex(RUN_ID_PATTERN),
      capability: z.string(),
      capabilityVersion: z.string(),
      status: runStatusSchema,
      createdAt: z.iso.datetime(),
      startedAt: z.iso.datetime().nullable(),
      finishedAt: z.iso.datetime().nullable(),
      durationMs: z.number().int().min(0).nullable(),
      transitions: z.array(runTransitionSchema),
      output: output.nullable().describe("Present on SUCCEEDED; on TIMED_OUT only when the capability returned a partial result"),
      error: runErrorSchema.nullable(),
      requestId: z.uuid(),
    })
    .strict();
}

export interface Run<O = unknown> {
  object: "run";
  id: string;
  capability: string;
  capabilityVersion: string;
  status: RunStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  transitions: { status: RunStatus; at: string }[];
  output: O | null;
  error: RunError | null;
  requestId: string;
}

export function newRunId(uuid: () => string = () => crypto.randomUUID()) {
  return `run_${uuid()}`;
}

export function createRun<O>(fields: { id: string; capability: string; capabilityVersion: string; requestId: string; at: Date }): Run<O> {
  const at = fields.at.toISOString();
  return {
    object: "run",
    id: fields.id,
    capability: fields.capability,
    capabilityVersion: fields.capabilityVersion,
    status: "PENDING",
    createdAt: at,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    transitions: [{ status: "PENDING", at }],
    output: null,
    error: null,
    requestId: fields.requestId,
  };
}

/**
 * Move a run to the next state. Illegal or repeated transitions are ignored (terminal
 * states are final), which keeps late cancellations and duplicate events idempotent.
 */
export function transition<O>(run: Run<O>, to: RunStatus, at: Date, patch: Partial<Pick<Run<O>, "output" | "error">> = {}): Run<O> {
  const next = advanceRun(run.status, to);
  if (next === run.status) return run;
  const iso = at.toISOString();
  const updated: Run<O> = { ...run, ...patch, status: next, transitions: [...run.transitions, { status: next, at: iso }] };
  if (next === "RUNNING") updated.startedAt = iso;
  if (isTerminal(next)) {
    updated.finishedAt = iso;
    const start = Date.parse(updated.startedAt ?? updated.createdAt);
    updated.durationMs = Math.max(0, at.getTime() - start);
  }
  return updated;
}
