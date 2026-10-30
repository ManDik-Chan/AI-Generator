import { afterEach, describe, expect, it, vi } from "vitest";

import { datasetKinds, DOMAIN, featurize, generateDataset } from "@/features/demos/neural-network/datasets";
import { appendHistory, initialTrainerState, MAX_HISTORY, trainerReducer, type TrainerState } from "@/features/demos/neural-network/host-state";
import { bceFromLogit, Mlp } from "@/features/demos/neural-network/mlp";
import { outboundMessageSchema, WORKER_PROTOCOL, type OutboundMessage, type SessionConfig } from "@/features/demos/neural-network/protocol";
import { createTrainer } from "@/features/demos/neural-network/trainer";

const config = (patch: Partial<SessionConfig["network"]> = {}, dataset: Partial<SessionConfig["dataset"]> = {}): SessionConfig => ({
  dataset: { kind: "xor", samples: 200, noise: 0.05, testRatio: 0.25, seed: 4, ...dataset },
  network: { hidden: [6, 6], activation: "tanh", features: "raw", ...patch },
  seed: 11,
});

/** Synchronous host: scheduled ticks run from a queue, the clock advances 1 ms per read. */
function harness() {
  const messages: OutboundMessage[] = [];
  const queue: (() => void)[] = [];
  let clock = 0;
  const trainer = createTrainer({
    post: (message) => messages.push(outboundMessageSchema.parse(message)),
    schedule: (task) => {
      queue.push(task);
      return () => {
        const index = queue.indexOf(task);
        if (index >= 0) queue.splice(index, 1);
      };
    },
    now: () => (clock += 1),
    sliceMs: 12,
  });
  const drain = (limit = 10_000) => {
    let n = 0;
    while (queue.length && n++ < limit) queue.shift()!();
  };
  const send = (message: Record<string, unknown>) => trainer.handle({ protocol: WORKER_PROTOCOL, ...message });
  const statuses = (runId: string) => messages.filter((m): m is Extract<OutboundMessage, { type: "run.status" }> => m.type === "run.status" && m.runId === runId).map((m) => m.status);
  return { messages, queue, drain, send, statuses, trainer, advance: (ms: number) => (clock += ms) };
}

describe("datasets", () => {
  it.each(datasetKinds)("%s is deterministic, balanced and inside the plotting square", (kind) => {
    const a = generateDataset({ kind, samples: 300, noise: 0.2, testRatio: 0.2, seed: 9 });
    expect(Array.from(a.points)).toEqual(Array.from(generateDataset({ kind, samples: 300, noise: 0.2, testRatio: 0.2, seed: 9 }).points));
    expect(a.labels.reduce((sum, v) => sum + v, 0)).toBe(150);
    expect(a.train.length + a.test.length).toBe(300);
    expect(a.test.length).toBe(60);
    expect(new Set([...a.train, ...a.test]).size).toBe(300);
    for (const v of a.points) expect(Math.abs(v)).toBeLessThan(DOMAIN);
  });

  it("builds quadratic features", () => {
    expect(Array.from(featurize(2, 3, "quadratic", new Float64Array(5)))).toEqual([2, 3, 4, 9, 6]);
  });
});

describe("Mlp", () => {
  it("computes a stable cross-entropy from logits", () => {
    expect(bceFromLogit(0, 1)).toBeCloseTo(Math.log(2));
    expect(Number.isFinite(bceFromLogit(1000, 0))).toBe(true);
    expect(bceFromLogit(-1000, 0)).toBeCloseTo(0);
  });

  it.each(["tanh", "relu", "sigmoid"] as const)("backpropagation matches numerical gradients (%s)", (activation) => {
    const data = generateDataset({ kind: "moons", samples: 24, noise: 0.1, testRatio: 0.25, seed: 2 });
    const features = new Float64Array(24 * 2);
    for (let i = 0; i < 48; i++) features[i] = data.points[i];
    const all = Int32Array.from({ length: 24 }, (_, i) => i);
    const shape = { inputs: 2, hidden: [4, 3], activation, seed: 5 };
    const probe = new Mlp(shape);
    const lossAt = () => probe.evaluate(features, data.labels, all).loss;
    const h = 1e-5;
    const numeric: number[] = [];
    for (const [layer, index] of [[0, 0], [0, 5], [1, 7], [2, 1]] as const) {
      const w = probe.weights[layer];
      const original = w[index];
      w[index] = original + h;
      const up = lossAt();
      w[index] = original - h;
      const down = lossAt();
      w[index] = original;
      numeric.push((up - down) / (2 * h));
    }
    const trained = new Mlp(shape);
    const before = [trained.weights[0][0], trained.weights[0][5], trained.weights[1][7], trained.weights[2][1]];
    const lr = 1e-3;
    trained.trainBatch(features, data.labels, all, { learningRate: lr, l2: 0, optimizer: "sgd" });
    const after = [trained.weights[0][0], trained.weights[0][5], trained.weights[1][7], trained.weights[2][1]];
    before.forEach((value, k) => expect((value - after[k]) / lr).toBeCloseTo(numeric[k], 4));
  });

  it.each(["sgd", "momentum", "adam"] as const)("learns a separable problem with %s", (optimizer) => {
    const data = generateDataset({ kind: "blobs", samples: 200, noise: 0, testRatio: 0.2, seed: 1 });
    const model = new Mlp({ inputs: 2, hidden: [4], activation: "tanh", seed: 3 });
    const before = model.evaluate(data.points, data.labels, data.train).loss;
    for (let epoch = 0; epoch < 60; epoch++) {
      for (let s = 0; s < data.train.length; s += 16) model.trainBatch(data.points, data.labels, data.train.subarray(s, s + 16), { learningRate: optimizer === "adam" ? 0.03 : 0.1, l2: 0, optimizer });
    }
    const after = model.evaluate(data.points, data.labels, data.test);
    expect(after.loss).toBeLessThan(before);
    expect(after.accuracy).toBeGreaterThan(0.85);
  });

  it("counts parameters and supports zero hidden layers", () => {
    expect(new Mlp({ inputs: 2, hidden: [], activation: "relu", seed: 1 }).parameterCount).toBe(3);
    expect(new Mlp({ inputs: 5, hidden: [8, 8], activation: "relu", seed: 1 }).parameterCount).toBe(5 * 8 + 8 + 8 * 8 + 8 + 8 + 1);
  });
});

describe("trainer (aig.worker/1)", () => {
  it("answers malformed messages with protocol.error and does nothing else", () => {
    const h = harness();
    h.trainer.handle({ type: "run.start" });
    h.send({ type: "session.configure", config: { ...config(), extra: true } });
    expect(h.messages.map((m) => m.type)).toEqual(["protocol.error", "protocol.error"]);
  });

  it("fails a run when no session exists", () => {
    const h = harness();
    h.send({ type: "run.start", runId: "r1", input: { epochs: 5, learningRate: 0.1, batchSize: 10, l2: 0, optimizer: "sgd" } });
    expect(h.statuses("r1")).toEqual(["FAILED"]);
  });

  it("walks a run through ACCEPTED → RUNNING → SUCCEEDED and trains the requested epochs", () => {
    const h = harness();
    h.send({ type: "session.configure", config: config() });
    const ready = h.messages[0];
    expect(ready.type).toBe("session.ready");
    if (ready.type !== "session.ready") return;
    expect(ready.session.grid).toHaveLength(ready.session.gridSize ** 2);
    expect(ready.session.sizes).toEqual([2, 6, 6, 1]);
    h.send({ type: "run.start", runId: "r1", input: { epochs: 300, learningRate: 0.03, batchSize: 10, l2: 0.0001, optimizer: "adam" } });
    h.drain();
    expect(h.statuses("r1")).toEqual(["ACCEPTED", "RUNNING", "SUCCEEDED"]);
    const progress = h.messages.filter((m) => m.type === "run.progress");
    const last = progress.at(-1);
    expect(last?.type === "run.progress" && last.metrics.epoch).toBe(300);
    expect(last?.type === "run.progress" && last.grid).toBeTruthy();
    expect(last?.type === "run.progress" && last.metrics.testAccuracy).toBeGreaterThan(0.85);
    expect(last?.type === "run.progress" && last.metrics.trainLoss).toBeLessThan(ready.session.metrics.trainLoss);
  });

  it("continues from the current weights in the next run", () => {
    const h = harness();
    h.send({ type: "session.configure", config: config() });
    const input = { epochs: 20, learningRate: 0.05, batchSize: 20, l2: 0, optimizer: "momentum" };
    h.send({ type: "run.start", runId: "a", input });
    h.drain();
    h.send({ type: "run.start", runId: "b", input });
    h.drain();
    const last = h.messages.filter((m) => m.type === "run.progress").at(-1);
    expect(last?.type === "run.progress" && last.metrics.epoch).toBe(40);
  });

  it("cancels on request, rejects a second concurrent run and cancels on reconfigure", () => {
    const h = harness();
    h.send({ type: "session.configure", config: config() });
    const input = { epochs: 5000, learningRate: 0.01, batchSize: 4, l2: 0, optimizer: "sgd" };
    h.send({ type: "run.start", runId: "a", input });
    h.drain(2);
    h.send({ type: "run.start", runId: "b", input });
    expect(h.statuses("b")).toEqual(["FAILED"]);
    h.send({ type: "run.cancel", runId: "a" });
    expect(h.statuses("a")).toEqual(["ACCEPTED", "RUNNING", "CANCELLED"]);
    expect(h.queue).toHaveLength(0);
    h.send({ type: "run.start", runId: "c", input });
    h.send({ type: "session.configure", config: config({ hidden: [3] }) });
    expect(h.statuses("c")).toEqual(["ACCEPTED", "RUNNING", "CANCELLED"]);
    expect(h.messages.at(-1)?.type).toBe("session.ready");
  });

  afterEach(() => vi.restoreAllMocks());

  it("reports a non-finite loss as FAILED / DIVERGED and keeps the session usable", () => {
    const h = harness();
    h.send({ type: "session.configure", config: config() });
    const spy = vi.spyOn(Mlp.prototype, "trainBatch").mockReturnValueOnce(Number.NaN);
    h.send({ type: "run.start", runId: "x", input: { epochs: 50, learningRate: 3, batchSize: 1, l2: 0, optimizer: "momentum" } });
    h.drain();
    expect(h.statuses("x")).toEqual(["ACCEPTED", "RUNNING", "FAILED"]);
    const failed = h.messages.find((m) => m.type === "run.status" && m.status === "FAILED");
    expect(failed?.type === "run.status" && failed.error?.code).toBe("DIVERGED");
    spy.mockRestore();
    h.send({ type: "run.start", runId: "y", input: { epochs: 5, learningRate: 0.1, batchSize: 10, l2: 0, optimizer: "sgd" } });
    h.drain();
    expect(h.statuses("y").at(-1)).toBe("SUCCEEDED");
  });

  it("times out a run that exceeds the browser budget", () => {
    const h = harness();
    h.send({ type: "session.configure", config: config() });
    h.send({ type: "run.start", runId: "t", input: { epochs: 5000, learningRate: 0.01, batchSize: 1, l2: 0, optimizer: "sgd" } });
    h.drain(1);
    h.advance(61_000);
    h.drain(1);
    expect(h.statuses("t").at(-1)).toBe("TIMED_OUT");
  });
});

describe("host reducer", () => {
  const status = (runId: string, s: string): OutboundMessage => ({ protocol: WORKER_PROTOCOL, type: "run.status", runId, status: s as never, at: new Date().toISOString(), epoch: 0 });

  it("tracks the page-owned PENDING state and ignores other runs", () => {
    let state: TrainerState = trainerReducer(initialTrainerState, { kind: "run.requested", runId: "a", at: new Date().toISOString() });
    state = trainerReducer(state, { kind: "message", message: status("a", "ACCEPTED") });
    state = trainerReducer(state, { kind: "message", message: status("zzz", "FAILED") });
    state = trainerReducer(state, { kind: "message", message: status("a", "RUNNING") });
    state = trainerReducer(state, { kind: "message", message: status("a", "SUCCEEDED") });
    state = trainerReducer(state, { kind: "message", message: status("a", "FAILED") });
    expect(state.run?.transitions.map((t) => t.status)).toEqual(["PENDING", "ACCEPTED", "RUNNING", "SUCCEEDED"]);
  });

  it("marks an active run FAILED when the worker is replaced", () => {
    let state = trainerReducer(initialTrainerState, { kind: "run.requested", runId: "a", at: new Date().toISOString() });
    state = trainerReducer(state, { kind: "transport", transport: "main-thread", note: "fallback" });
    expect(state.run?.status).toBe("FAILED");
    expect(state.transportNote).toBe("fallback");
  });

  it("keeps the whole loss curve within the history cap", () => {
    let history = [{ epoch: 0, trainLoss: 1, testLoss: 1 }];
    for (let epoch = 1; epoch <= 2000; epoch++) history = appendHistory(history, { epoch, trainLoss: 1 / epoch, testLoss: 1 / epoch });
    expect(history.length).toBeLessThanOrEqual(MAX_HISTORY);
    expect(history[0].epoch).toBe(0);
    expect(history.at(-1)?.epoch).toBe(2000);
    expect(appendHistory(history, { epoch: 5, trainLoss: 0, testLoss: 0 })).toBe(history);
  });
});
