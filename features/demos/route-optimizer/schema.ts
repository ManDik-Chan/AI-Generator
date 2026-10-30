/*
 * Input and output contract of `route-optimizer.solve`. These zod schemas validate every
 * request at runtime and are also the source of the JSON Schema published in the
 * capability descriptor and in docs/developer/openapi.json.
 */
import { z } from "zod";

import { instanceKinds } from "@/features/demos/route-optimizer/instances";
import { constructions, improvements } from "@/features/demos/route-optimizer/solver";

export const MAX_POINTS = 400;
export const MIN_POINTS = 3;
export const MAX_COORDINATE = 10_000;
export const DEFAULT_DEADLINE_MS = 3000;
export const MAX_DEADLINE_MS = 5000;
export const MIN_DEADLINE_MS = 50;

const coordinate = z.number().min(0).max(MAX_COORDINATE);
const seed = z.int().min(0).max(2_147_483_647);

export const routeInstanceSchema = z
  .object({
    kind: z.enum(instanceKinds).describe("Seeded generator: uniform, clustered, circle or grid"),
    count: z.int().min(MIN_POINTS).max(MAX_POINTS),
    seed: seed.default(1),
  })
  .strict();

export const routeInputSchema = z
  .object({
    points: z
      .array(z.tuple([coordinate, coordinate]))
      .min(MIN_POINTS)
      .max(MAX_POINTS)
      .optional()
      .describe("Cities as [x, y] pairs in a 0–10000 plane. Send either points or instance"),
    instance: routeInstanceSchema.optional().describe("Let the server generate a seeded point set instead of sending points"),
    construction: z.enum(constructions).default("nearest-neighbor"),
    improvement: z.enum(improvements).default("two-opt"),
    annealingIterations: z.int().min(1_000).max(3_000_000).default(200_000).describe("Only used by improvement=annealing"),
    seed: seed.default(1).describe("Seeds the random construction and annealing"),
    startIndex: z.int().min(0).max(MAX_POINTS - 1).default(0).describe("Index of the city the tour starts from; must be < number of points"),
    deadlineMs: z.int().min(MIN_DEADLINE_MS).max(MAX_DEADLINE_MS).default(DEFAULT_DEADLINE_MS).describe("When reached, the run ends TIMED_OUT with the best tour so far"),
  })
  .strict()
  .refine((value) => Boolean(value.points) !== Boolean(value.instance), {
    message: "points 与 instance 必须且只能提供一个。",
    path: ["points"],
  });

export type RouteInput = z.infer<typeof routeInputSchema>;

export const stopReasons = ["construction-only", "converged", "schedule-complete", "deadline"] as const;

export const routeOutputSchema = z
  .object({
    points: z.array(z.tuple([z.number(), z.number()])).optional().describe("Echoed only when the input used instance"),
    tour: z.array(z.int().min(0)).describe("Visiting order as point indices, starting at startIndex; the tour returns to its start"),
    length: z.number().min(0),
    initialLength: z.number().min(0).describe("Length after construction, before improvement"),
    improvement: z.number().describe("1 - length / initialLength"),
    lowerBound: z.number().min(0).describe("Minimum spanning tree weight; no tour can be shorter"),
    gap: z.number().min(0).describe("length / lowerBound - 1: an upper bound on the distance from optimal"),
    iterations: z.int().min(0).describe("Candidate moves evaluated"),
    appliedMoves: z.int().min(0),
    passes: z.int().min(0),
    stopReason: z.enum(stopReasons),
    partial: z.boolean().describe("True when the deadline stopped the solver"),
    elapsedMs: z.number().min(0),
    convergence: z
      .array(z.object({ at: z.number().min(0), length: z.number().min(0) }).strict())
      .max(120)
      .describe("Best length over time (ms since the solver started), at most 120 samples"),
  })
  .strict();

export type RouteOutput = z.infer<typeof routeOutputSchema>;

/** Shape of each `run.progress` SSE event of this capability. */
export const routeProgressSchema = z
  .object({
    phase: z.enum(["two-opt", "or-opt", "annealing", "polish", "done"]),
    elapsedMs: z.number().min(0),
    length: z.number().min(0),
    iterations: z.int().min(0),
    tour: z.array(z.int().min(0)),
  })
  .strict();

export type RouteProgress = z.infer<typeof routeProgressSchema>;
