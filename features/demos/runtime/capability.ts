/*
 * Capability descriptors — the demo runtime contract `aig.capability/0.1`.
 *
 * A capability is one runnable operation of a project ("solve a route", "train a
 * network"). The descriptor states where it executes, which transport it speaks, its
 * input/output JSON Schema, its limits and where user data goes. It is implemented for
 * the platform's own demos; third-party registration needs the Registry, which is not
 * deployed (docs/developer/interface-status.md).
 */
import { z } from "zod";

import type { Issue } from "@/features/demos/runtime/errors";

export const CAPABILITY_SCHEMA = "aig.capability/0.1";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const CAPABILITY_ID = /^[a-z][a-z0-9-]{1,40}(\.[a-z][a-z0-9-]{1,40}){1,3}$/;

const jsonSchemaObject = z.record(z.string(), z.unknown()).describe("JSON Schema (draft 2020-12)");

export const capabilityDescriptorSchema = z
  .object({
    schema: z.literal(CAPABILITY_SCHEMA),
    id: z.string().regex(CAPABILITY_ID).describe("Stable dotted id, e.g. route-optimizer.solve"),
    project: z.string().regex(/^[a-z][a-z0-9-]{2,62}$/).describe("Project slug, same rule as the P0.5 manifest"),
    version: z.string().regex(SEMVER).describe("Semantic version of the capability implementation"),
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(300),
    execution: z.enum(["server", "browser"]).describe("server: runs in the platform's function runtime. browser: runs on the visitor's device"),
    transports: z.array(z.enum(["http-json", "http-sse", "worker"])).min(1),
    dataFlow: z.enum(["none", "platform", "developer"]).describe("none: input never leaves the browser. platform: processed by AI-Generator, not stored. developer: sent to the project's own service"),
    status: z.enum(["demo", "live", "design"]),
    limits: z
      .object({
        maxInputBytes: z.number().int().positive(),
        defaultDeadlineMs: z.number().int().positive(),
        maxDeadlineMs: z.number().int().positive(),
        rateLimit: z.object({ requests: z.number().int().positive(), windowSeconds: z.number().int().positive() }).strict().optional(),
        concurrentRunsPerClient: z.number().int().positive().optional(),
      })
      .strict(),
    inputSchema: jsonSchemaObject,
    outputSchema: jsonSchemaObject,
    sourcePath: z.string().max(200).describe("Repository path of the implementation"),
    docsPath: z.string().max(200).describe("Website path of the documentation"),
  })
  .strict();

export type CapabilityDescriptor = z.infer<typeof capabilityDescriptorSchema>;

/** Context handed to a server capability while it runs. */
export interface RunContext {
  /** Aborted when the client disconnects or the run is cancelled. */
  readonly signal: AbortSignal;
  /** Milliseconds on the run clock. */
  now(): number;
  /** Milliseconds left before the run's deadline (may be negative). */
  timeLeft(): number;
  /** True once the deadline has passed. Long loops should check it and return `partial`. */
  expired(): boolean;
  /** Emit a progress event (SSE `run.progress`). Ignored for plain JSON requests. */
  progress(data: unknown): void;
  /** Yield to the event loop so progress can flush; throws RunInterrupt when cancelled. */
  checkpoint(): Promise<void>;
  /** Wrap a best-so-far result: the run ends TIMED_OUT and still returns this output. */
  partial<O>(output: O): PartialResult<O>;
}

const PARTIAL = Symbol("aig.partial");

export interface PartialResult<O> {
  readonly [PARTIAL]: true;
  readonly output: O;
}

export function partialResult<O>(output: O): PartialResult<O> {
  return { [PARTIAL]: true, output };
}

export function isPartialResult<O>(value: unknown): value is PartialResult<O> {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[PARTIAL] === true;
}

/** Thrown by `checkpoint()` when the run must stop. */
export class RunInterrupt extends Error {
  constructor(readonly reason: "cancelled" | "deadline") {
    super(reason);
    this.name = "RunInterrupt";
  }
}

export interface ServerCapability<I = unknown, O = unknown> {
  descriptor: Omit<CapabilityDescriptor, "schema" | "inputSchema" | "outputSchema" | "execution" | "transports"> & {
    transports?: CapabilityDescriptor["transports"];
  };
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  /** Cross-field rules the schema cannot express. Issues become 422 SEMANTIC_REJECTION. */
  validate?(input: I): Issue[];
  /** The deadline the run gets when the input does not choose one. */
  deadlineOf?(input: I): number;
  execute(input: I, ctx: RunContext): Promise<O | PartialResult<O>>;
}

/** Identity helper that keeps the input/output types connected. */
export function defineServerCapability<I, O>(capability: ServerCapability<I, O>): ServerCapability<I, O> {
  return capability;
}

/** JSON Schema of a zod schema as accepted on input (defaults optional) or produced on output. */
export function jsonSchemaOf(schema: z.ZodType, io: "input" | "output") {
  const json = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export function describeServerCapability(capability: ServerCapability): CapabilityDescriptor {
  return {
    schema: CAPABILITY_SCHEMA,
    ...capability.descriptor,
    execution: "server",
    transports: capability.descriptor.transports ?? ["http-json", "http-sse"],
    inputSchema: jsonSchemaOf(capability.input, "input"),
    outputSchema: jsonSchemaOf(capability.output, "output"),
  };
}
