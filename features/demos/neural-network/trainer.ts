/*
 * The neural-network capability as a message handler. It owns one session (dataset +
 * network) and at most one active run. The same code runs inside the Web Worker
 * (nn.worker.ts) and, as a fallback, on the page's main thread; `post`, `schedule` and
 * `now` are injected so tests can drive it synchronously.
 */
import { DOMAIN, featureCount, featureLabels, featurize, generateDataset, type Dataset, type FeatureSet } from "@/features/demos/neural-network/datasets";
import { Mlp } from "@/features/demos/neural-network/mlp";
import {
  GRID_SIZE,
  inboundMessageSchema,
  MAX_RUN_MS,
  WORKER_PROTOCOL,
  type Metrics,
  type OutboundMessage,
  type SessionConfig,
  type TrainInput,
} from "@/features/demos/neural-network/protocol";
import type { RunError } from "@/features/demos/runtime/run";
import type { RunStatus } from "@/features/platform/types";
import { prng } from "@/features/platform/sorting";

export interface TrainerHost {
  post(message: OutboundMessage): void;
  /** Run `task` soon (setTimeout 0 in browsers); returns a cancel function. */
  schedule(task: () => void): () => void;
  now(): number;
  /** Work per tick; ~12 ms keeps a worker responsive and a main-thread fallback smooth. */
  sliceMs?: number;
}

interface Session {
  config: SessionConfig;
  dataset: Dataset;
  features: Float64Array;
  featureSet: FeatureSet;
  model: Mlp;
  epoch: number;
  shuffle: () => number;
}

interface ActiveRun {
  id: string;
  input: TrainInput;
  target: number;
  startedAt: number;
  cancelTick: () => void;
  lastProgress: number;
  lastGrid: number;
}

const PROGRESS_EVERY_MS = 50;
const GRID_EVERY_MS = 150;

const r4 = (value: number) => Math.round(value * 1e4) / 1e4;

export function createTrainer(host: TrainerHost) {
  const slice = host.sliceMs ?? 12;
  let session: Session | null = null;
  let run: ActiveRun | null = null;

  const post = (message: OutboundMessage) => host.post(message);
  const status = (runId: string, next: RunStatus, error?: RunError) =>
    post({ protocol: WORKER_PROTOCOL, type: "run.status", runId, status: next, at: new Date().toISOString(), epoch: session?.epoch ?? 0, ...(error ? { error } : {}) });

  function buildFeatures(dataset: Dataset, set: FeatureSet) {
    const dim = featureCount(set);
    const n = dataset.labels.length;
    const out = new Float64Array(n * dim);
    const row = new Float64Array(dim);
    for (let i = 0; i < n; i++) {
      featurize(dataset.points[i * 2], dataset.points[i * 2 + 1], set, row);
      out.set(row, i * dim);
    }
    return out;
  }

  function grid(model: Mlp, set: FeatureSet) {
    const out = new Array<number>(GRID_SIZE * GRID_SIZE);
    const row = new Float64Array(featureCount(set));
    for (let r = 0; r < GRID_SIZE; r++) {
      const y = DOMAIN - ((r + 0.5) / GRID_SIZE) * DOMAIN * 2;
      for (let c = 0; c < GRID_SIZE; c++) {
        const x = -DOMAIN + ((c + 0.5) / GRID_SIZE) * DOMAIN * 2;
        out[r * GRID_SIZE + c] = Math.round(model.predict(featurize(x, y, set, row)) * 1000) / 1000;
      }
    }
    return out;
  }

  const weights = (model: Mlp) => model.weights.map((w) => Array.from(w, r4));

  function metrics(s: Session): Metrics {
    const train = s.model.evaluate(s.features, s.dataset.labels, s.dataset.train);
    const test = s.model.evaluate(s.features, s.dataset.labels, s.dataset.test);
    return { epoch: s.epoch, trainLoss: r4(train.loss), testLoss: r4(test.loss), trainAccuracy: r4(train.accuracy), testAccuracy: r4(test.accuracy) };
  }

  function ready(s: Session) {
    post({
      protocol: WORKER_PROTOCOL,
      type: "session.ready",
      session: {
        sizes: s.model.sizes,
        parameterCount: s.model.parameterCount,
        featureLabels: featureLabels(s.featureSet),
        points: Array.from(s.dataset.points, r4),
        labels: Array.from(s.dataset.labels),
        train: Array.from(s.dataset.train),
        test: Array.from(s.dataset.test),
        gridSize: GRID_SIZE,
        domain: DOMAIN,
        grid: grid(s.model, s.featureSet),
        weights: weights(s.model),
        metrics: metrics(s),
      },
    });
  }

  function newModel(config: SessionConfig, seed: number) {
    return new Mlp({ inputs: featureCount(config.network.features), hidden: config.network.hidden, activation: config.network.activation, seed });
  }

  function stop(next: "CANCELLED" | "SUCCEEDED" | "FAILED" | "TIMED_OUT", error?: RunError) {
    if (!run) return;
    const ended = run;
    run = null;
    ended.cancelTick();
    if (session && next !== "FAILED") {
      post({ protocol: WORKER_PROTOCOL, type: "run.progress", runId: ended.id, metrics: metrics(session), grid: grid(session.model, session.featureSet), weights: weights(session.model) });
    }
    status(ended.id, next, error);
  }

  function tick() {
    if (!run || !session) return;
    const s = session;
    const current = run;
    const sliceEnd = host.now() + slice;
    const train = s.dataset.train;
    const order = Int32Array.from(train);
    do {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(s.shuffle() * (i + 1));
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
      }
      for (let start = 0; start < order.length; start += current.input.batchSize) {
        const loss = s.model.trainBatch(s.features, s.dataset.labels, order.subarray(start, start + current.input.batchSize), current.input);
        if (!Number.isFinite(loss)) {
          return stop("FAILED", { code: "DIVERGED", message: "训练发散：损失变为非有限值。请降低学习率或增大批大小。" });
        }
      }
      s.epoch += 1;
    } while (s.epoch < current.target && host.now() < sliceEnd);

    if (!s.model.isFinite()) return stop("FAILED", { code: "DIVERGED", message: "训练发散：权重变为非有限值。请降低学习率。" });
    if (s.epoch >= current.target) return stop("SUCCEEDED");
    if (host.now() - current.startedAt > MAX_RUN_MS) return stop("TIMED_OUT", { code: "DEADLINE_EXCEEDED", message: "单次运行超过 60 秒，已停止；当前权重保留。" });

    const now = host.now();
    if (now - current.lastProgress >= PROGRESS_EVERY_MS) {
      current.lastProgress = now;
      const withGrid = now - current.lastGrid >= GRID_EVERY_MS;
      if (withGrid) current.lastGrid = now;
      post({
        protocol: WORKER_PROTOCOL,
        type: "run.progress",
        runId: current.id,
        metrics: metrics(s),
        ...(withGrid ? { grid: grid(s.model, s.featureSet), weights: weights(s.model) } : {}),
      });
    }
    current.cancelTick = host.schedule(tick);
  }

  function handle(raw: unknown) {
    const parsed = inboundMessageSchema.safeParse(raw);
    if (!parsed.success) {
      post({
        protocol: WORKER_PROTOCOL,
        type: "protocol.error",
        code: "INVALID_MESSAGE",
        message: "消息不符合 aig.worker/1 协议，已忽略。",
        issues: parsed.error.issues.slice(0, 10).map((issue) => ({ path: issue.path.map(String).join(".") || "$", message: issue.message })),
      });
      return;
    }
    const message = parsed.data;
    if (message.type === "session.configure") {
      stop("CANCELLED", { code: "CANCELLED", message: "配置已更改，运行被取消。" });
      const { config } = message;
      const dataset = generateDataset(config.dataset);
      session = {
        config,
        dataset,
        features: buildFeatures(dataset, config.network.features),
        featureSet: config.network.features,
        model: newModel(config, config.seed),
        epoch: 0,
        shuffle: prng((config.seed ^ 0x2545f491) >>> 0),
      };
      ready(session);
    } else if (message.type === "session.reset") {
      if (!session) return;
      stop("CANCELLED", { code: "CANCELLED", message: "网络已重置，运行被取消。" });
      session = { ...session, config: { ...session.config, seed: message.seed }, model: newModel(session.config, message.seed), epoch: 0, shuffle: prng((message.seed ^ 0x2545f491) >>> 0) };
      ready(session);
    } else if (message.type === "run.start") {
      if (!session) return status(message.runId, "FAILED", { code: "INVALID_STATE", message: "还没有配置数据集与网络。" });
      if (run) return status(message.runId, "FAILED", { code: "INVALID_STATE", message: "已有运行在进行中。" });
      status(message.runId, "ACCEPTED");
      const now = host.now();
      run = { id: message.runId, input: message.input, target: session.epoch + message.input.epochs, startedAt: now, cancelTick: () => {}, lastProgress: -Infinity, lastGrid: now };
      status(message.runId, "RUNNING");
      run.cancelTick = host.schedule(tick);
    } else if (run && message.runId === run.id) {
      stop("CANCELLED", { code: "CANCELLED", message: "运行已被你停止，当前权重保留。" });
    }
  }

  return {
    handle,
    /** Stop scheduling work (worker terminate / component unmount). */
    dispose() {
      run?.cancelTick();
      run = null;
    },
  };
}
