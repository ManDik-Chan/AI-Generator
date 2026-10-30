/*
 * Every example embedded in docs/developer is executed here. The HTTP examples run
 * against the real request handlers through an in-process fetch.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { trainOnce, type Port } from "@/examples/browser/train-once";
import { textStats } from "@/examples/capabilities/text-stats";
import { capabilityDescriptorSchema, describeServerCapability } from "@/features/demos/runtime/capability";
import { executeRun } from "@/features/demos/runtime/executor";
import { createDemoApiDeps, handleCreateRun } from "@/features/demos/runtime/handlers";
import { createTrainer } from "@/features/demos/neural-network/trainer";
import { validateManifest } from "@/features/platform/manifest";
// @ts-expect-error -- plain ESM example without type declarations
import { solve } from "./demo-api/solve.mjs";
// @ts-expect-error -- plain ESM example without type declarations
import { streamRun } from "./demo-api/stream.mjs";

const deps = createDemoApiDeps();
const inProcessFetch = (url: string, init: RequestInit) => handleCreateRun(new Request(url, init), deps);

describe("examples/demo-api", () => {
  it("solve.mjs gets a finished run", async () => {
    const run = await solve("http://localhost:3000", inProcessFetch);
    expect(run.status).toBe("SUCCEEDED");
    expect(run.output.points).toHaveLength(120);
  });

  it("solve.mjs surfaces API errors with code and requestId", async () => {
    const failing = async () => new Response(JSON.stringify({ code: "RATE_LIMITED", message: "slow down", requestId: "x" }), { status: 429 });
    await expect(solve("http://localhost:3000", failing)).rejects.toThrow(/429 RATE_LIMITED: slow down \(requestId x\)/);
  });

  it("stream.mjs reports every transition and progress", async () => {
    const statuses: string[] = [];
    const phases = new Set<string>();
    const run = await streamRun("http://localhost:3000", {
      fetchImpl: inProcessFetch,
      onStatus: (r: { status: string }) => statuses.push(r.status),
      onProgress: (p: { phase: string }) => phases.add(p.phase),
    });
    expect(statuses).toEqual(["PENDING", "ACCEPTED", "RUNNING", "SUCCEEDED"]);
    expect(phases.has("annealing")).toBe(true);
    expect(run.output.tour).toHaveLength(300);
  });
});

describe("examples/capabilities/text-stats", () => {
  it("is a valid capability that runs through the lifecycle", async () => {
    expect(capabilityDescriptorSchema.safeParse(describeServerCapability(textStats)).success).toBe(true);
    const run = await executeRun(textStats, { text: "To be, or not to be. 生存还是毁灭。To be!" }, { requestId: crypto.randomUUID(), deadlineMs: 1000 });
    expect(run.status).toBe("SUCCEEDED");
    expect(run.output).toMatchObject({ words: 9, sentences: 3, partial: false });
    expect(run.output?.topWords[0]).toEqual({ word: "be", count: 3 });
  });

  it("rejects input outside its schema", () => {
    expect(textStats.input.safeParse({ text: "" }).success).toBe(false);
    expect(textStats.input.safeParse({ text: "x", extra: 1 }).success).toBe(false);
  });
});

describe("examples/browser/train-once", () => {
  it("drives the worker protocol to a finished run", async () => {
    const listeners = new Set<(event: { data: unknown }) => void>();
    const trainer = createTrainer({
      post: (message) => queueMicrotask(() => listeners.forEach((listener) => listener({ data: message }))),
      schedule: (task) => {
        const id = setTimeout(task, 0);
        return () => clearTimeout(id);
      },
      now: () => performance.now(),
    });
    const port: Port = {
      postMessage: (message) => trainer.handle(message),
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    };
    const result = await trainOnce(
      port,
      { dataset: { kind: "blobs", samples: 120, noise: 0.05, testRatio: 0.25, seed: 1 }, network: { hidden: [4], activation: "tanh", features: "raw" }, seed: 2 },
      { epochs: 40, learningRate: 0.05, batchSize: 16, l2: 0, optimizer: "adam" },
    );
    expect(result.status).toBe("SUCCEEDED");
    expect(result.metrics?.epoch).toBe(40);
    expect(result.metrics?.testAccuracy).toBeGreaterThan(0.9);
  });
});

describe("examples/manifest", () => {
  it("manifest.json passes the P0.5 validator", () => {
    const result = validateManifest(readFileSync(join(process.cwd(), "examples/manifest/manifest.json"), "utf8"));
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
