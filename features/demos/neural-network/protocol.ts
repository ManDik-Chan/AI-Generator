/*
 * Browser runtime protocol `aig.worker/1` between a page (host) and a capability running
 * in a Web Worker. Every message carries the protocol tag; the worker validates every
 * inbound message and answers malformed ones with `protocol.error` instead of acting.
 * Runs use the same lifecycle and error codes as the server runtime.
 */
import { z } from "zod";

import { runErrorSchema, runStatusSchema } from "@/features/demos/runtime/run";
import { datasetKinds, featureSets } from "@/features/demos/neural-network/datasets";
import { activations, optimizers } from "@/features/demos/neural-network/mlp";

export const WORKER_PROTOCOL = "aig.worker/1";
export const GRID_SIZE = 40;
export const MAX_RUN_MS = 60_000;

const seed = z.int().min(0).max(2_147_483_647);

export const sessionConfigSchema = z
  .object({
    dataset: z
      .object({
        kind: z.enum(datasetKinds),
        samples: z.int().min(40).max(800),
        noise: z.number().min(0).max(0.6),
        testRatio: z.number().min(0.1).max(0.5),
        seed,
      })
      .strict(),
    network: z
      .object({
        hidden: z.array(z.int().min(1).max(8)).max(4).describe("Neurons per hidden layer; [] is logistic regression"),
        activation: z.enum(activations),
        features: z.enum(featureSets),
      })
      .strict(),
    seed: seed.describe("Weight initialisation seed"),
  })
  .strict();

export type SessionConfig = z.infer<typeof sessionConfigSchema>;

export const trainInputSchema = z
  .object({
    epochs: z.int().min(1).max(5000).describe("Epochs to train in this run, continuing from the current weights"),
    learningRate: z.number().gt(0).max(3),
    batchSize: z.int().min(1).max(256),
    l2: z.number().min(0).max(0.1),
    optimizer: z.enum(optimizers),
  })
  .strict();

export type TrainInput = z.infer<typeof trainInputSchema>;

const tag = { protocol: z.literal(WORKER_PROTOCOL) };
const runId = z.string().min(1).max(64);

export const inboundMessageSchema = z.discriminatedUnion("type", [
  z.object({ ...tag, type: z.literal("session.configure"), config: sessionConfigSchema }).strict(),
  z.object({ ...tag, type: z.literal("session.reset"), seed }).strict(),
  z.object({ ...tag, type: z.literal("run.start"), runId, input: trainInputSchema }).strict(),
  z.object({ ...tag, type: z.literal("run.cancel"), runId }).strict(),
]);

export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const metricsSchema = z
  .object({
    epoch: z.int().min(0),
    trainLoss: z.number(),
    testLoss: z.number(),
    trainAccuracy: z.number().min(0).max(1),
    testAccuracy: z.number().min(0).max(1),
  })
  .strict();

export type Metrics = z.infer<typeof metricsSchema>;

export const sessionSnapshotSchema = z
  .object({
    sizes: z.array(z.int().min(1)),
    parameterCount: z.int().min(1),
    featureLabels: z.array(z.string()),
    points: z.array(z.number()).describe("Interleaved x, y"),
    labels: z.array(z.int().min(0).max(1)),
    train: z.array(z.int().min(0)),
    test: z.array(z.int().min(0)),
    gridSize: z.int().min(2),
    domain: z.number().positive(),
    grid: z.array(z.number()).describe("P(class 1) on a gridSize × gridSize lattice, row-major from top-left"),
    weights: z.array(z.array(z.number())),
    metrics: metricsSchema,
  })
  .strict();

export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;

export const outboundMessageSchema = z.discriminatedUnion("type", [
  z.object({ ...tag, type: z.literal("session.ready"), session: sessionSnapshotSchema }).strict(),
  z
    .object({
      ...tag,
      type: z.literal("run.status"),
      runId,
      status: runStatusSchema,
      at: z.iso.datetime(),
      epoch: z.int().min(0),
      error: runErrorSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...tag,
      type: z.literal("run.progress"),
      runId,
      metrics: metricsSchema,
      grid: z.array(z.number()).optional(),
      weights: z.array(z.array(z.number())).optional(),
    })
    .strict(),
  z
    .object({
      ...tag,
      type: z.literal("protocol.error"),
      code: z.enum(["INVALID_MESSAGE"]),
      message: z.string(),
      issues: z.array(z.object({ path: z.string(), message: z.string() }).strict()).optional(),
    })
    .strict(),
]);

export type OutboundMessage = z.infer<typeof outboundMessageSchema>;
