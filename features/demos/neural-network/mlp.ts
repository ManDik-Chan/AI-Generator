/*
 * A small fully connected network for binary classification, trained with
 * backpropagation. Hidden layers use tanh / ReLU / sigmoid; the output is one logit fed
 * to a sigmoid, trained with binary cross-entropy (computed from the logit, so it stays
 * finite for confident predictions). Optimizers: SGD, momentum and Adam, with L2 weight
 * decay on weights (not biases). Pure TypeScript: no WebGL, no dependencies.
 */
import { prng } from "@/features/platform/sorting";

export const activations = ["tanh", "relu", "sigmoid"] as const;
export type Activation = (typeof activations)[number];
export const optimizers = ["sgd", "momentum", "adam"] as const;
export type OptimizerKind = (typeof optimizers)[number];

export interface NetworkShape {
  inputs: number;
  hidden: number[];
  activation: Activation;
  seed: number;
}

export interface TrainOptions {
  learningRate: number;
  l2: number;
  optimizer: OptimizerKind;
}

const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

/** Binary cross-entropy from a logit: max(z,0) − z·y + log(1 + e^−|z|). */
export function bceFromLogit(z: number, y: number) {
  return Math.max(z, 0) - z * y + Math.log1p(Math.exp(-Math.abs(z)));
}

function activate(kind: Activation, z: number) {
  if (kind === "tanh") return Math.tanh(z);
  if (kind === "relu") return z > 0 ? z : 0;
  return sigmoid(z);
}

/** Derivative expressed with the pre-activation z and activation a. */
function derivative(kind: Activation, z: number, a: number) {
  if (kind === "tanh") return 1 - a * a;
  if (kind === "relu") return z > 0 ? 1 : 0;
  return a * (1 - a);
}

export class Mlp {
  readonly sizes: number[];
  readonly activation: Activation;
  /** weights[l] has sizes[l + 1] rows × sizes[l] columns, row-major. */
  readonly weights: Float64Array[];
  readonly biases: Float64Array[];
  private readonly gradW: Float64Array[];
  private readonly gradB: Float64Array[];
  private readonly m1W: Float64Array[];
  private readonly m1B: Float64Array[];
  private readonly m2W: Float64Array[];
  private readonly m2B: Float64Array[];
  private readonly z: Float64Array[];
  private readonly a: Float64Array[];
  private readonly delta: Float64Array[];
  private step = 0;

  constructor(shape: NetworkShape) {
    this.sizes = [shape.inputs, ...shape.hidden, 1];
    this.activation = shape.activation;
    const rand = prng((Math.imul(shape.seed, 0x165667b1) + 0x3c6ef372) >>> 0);
    const normal = () => {
      let u = 0;
      while (u === 0) u = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
    };
    const layers = this.sizes.length - 1;
    const alloc = (rows: (l: number) => number) => Array.from({ length: layers }, (_, l) => new Float64Array(rows(l)));
    this.weights = alloc((l) => this.sizes[l + 1] * this.sizes[l]);
    this.biases = alloc((l) => this.sizes[l + 1]);
    this.gradW = alloc((l) => this.sizes[l + 1] * this.sizes[l]);
    this.gradB = alloc((l) => this.sizes[l + 1]);
    this.m1W = alloc((l) => this.sizes[l + 1] * this.sizes[l]);
    this.m1B = alloc((l) => this.sizes[l + 1]);
    this.m2W = alloc((l) => this.sizes[l + 1] * this.sizes[l]);
    this.m2B = alloc((l) => this.sizes[l + 1]);
    this.z = this.sizes.map((size) => new Float64Array(size));
    this.a = this.sizes.map((size) => new Float64Array(size));
    this.delta = this.sizes.map((size) => new Float64Array(size));
    for (let l = 0; l < layers; l++) {
      const fanIn = this.sizes[l];
      const fanOut = this.sizes[l + 1];
      const std = this.activation === "relu" && l < layers - 1 ? Math.sqrt(2 / fanIn) : Math.sqrt(2 / (fanIn + fanOut));
      const w = this.weights[l];
      for (let k = 0; k < w.length; k++) w[k] = normal() * std;
      if (this.activation === "relu" && l < layers - 1) this.biases[l].fill(0.01);
    }
  }

  get parameterCount() {
    return this.weights.reduce((sum, w) => sum + w.length, 0) + this.biases.reduce((sum, b) => sum + b.length, 0);
  }

  /** Forward pass; returns the output logit and leaves activations in `this.a`. */
  logit(x: ArrayLike<number>): number {
    const layers = this.sizes.length - 1;
    const input = this.a[0];
    for (let k = 0; k < this.sizes[0]; k++) input[k] = x[k];
    for (let l = 0; l < layers; l++) {
      const rows = this.sizes[l + 1];
      const cols = this.sizes[l];
      const w = this.weights[l];
      const b = this.biases[l];
      const prev = this.a[l];
      const zl = this.z[l + 1];
      const al = this.a[l + 1];
      const last = l === layers - 1;
      for (let r = 0; r < rows; r++) {
        let sum = b[r];
        const offset = r * cols;
        for (let c = 0; c < cols; c++) sum += w[offset + c] * prev[c];
        zl[r] = sum;
        al[r] = last ? sum : activate(this.activation, sum);
      }
    }
    return this.z[layers][0];
  }

  predict(x: ArrayLike<number>) {
    return sigmoid(this.logit(x));
  }

  /**
   * One optimizer step on a mini-batch. `features` holds `dim` values per sample.
   * Returns the mean data loss of the batch (before the update).
   */
  trainBatch(features: Float64Array, labels: Uint8Array, batch: ArrayLike<number>, options: TrainOptions): number {
    const layers = this.sizes.length - 1;
    const dim = this.sizes[0];
    for (let l = 0; l < layers; l++) {
      this.gradW[l].fill(0);
      this.gradB[l].fill(0);
    }
    let loss = 0;
    const view = new Float64Array(dim);
    for (let s = 0; s < batch.length; s++) {
      const index = batch[s];
      for (let k = 0; k < dim; k++) view[k] = features[index * dim + k];
      const z = this.logit(view);
      const y = labels[index];
      loss += bceFromLogit(z, y);
      // Output delta for sigmoid + BCE.
      this.delta[layers][0] = sigmoid(z) - y;
      for (let l = layers - 1; l >= 0; l--) {
        const rows = this.sizes[l + 1];
        const cols = this.sizes[l];
        const w = this.weights[l];
        const gw = this.gradW[l];
        const gb = this.gradB[l];
        const next = this.delta[l + 1];
        const prevA = this.a[l];
        for (let r = 0; r < rows; r++) {
          const d = next[r];
          gb[r] += d;
          const offset = r * cols;
          for (let c = 0; c < cols; c++) gw[offset + c] += d * prevA[c];
        }
        if (l > 0) {
          const current = this.delta[l];
          const zl = this.z[l];
          const al = this.a[l];
          for (let c = 0; c < cols; c++) {
            let sum = 0;
            for (let r = 0; r < rows; r++) sum += w[r * cols + c] * next[r];
            current[c] = sum * derivative(this.activation, zl[c], al[c]);
          }
        }
      }
    }
    const scale = 1 / Math.max(1, batch.length);
    this.apply(options, scale);
    return loss * scale;
  }

  private apply({ learningRate: lr, l2, optimizer }: TrainOptions, scale: number) {
    this.step += 1;
    const beta1 = 0.9;
    const beta2 = 0.999;
    const correction1 = 1 - beta1 ** this.step;
    const correction2 = 1 - beta2 ** this.step;
    const update = (param: Float64Array, grad: Float64Array, m1: Float64Array, m2: Float64Array, decay: number) => {
      for (let k = 0; k < param.length; k++) {
        const g = grad[k] * scale + decay * param[k];
        if (optimizer === "sgd") param[k] -= lr * g;
        else if (optimizer === "momentum") {
          m1[k] = beta1 * m1[k] + g;
          param[k] -= lr * m1[k];
        } else {
          m1[k] = beta1 * m1[k] + (1 - beta1) * g;
          m2[k] = beta2 * m2[k] + (1 - beta2) * g * g;
          param[k] -= (lr * (m1[k] / correction1)) / (Math.sqrt(m2[k] / correction2) + 1e-8);
        }
      }
    };
    for (let l = 0; l < this.weights.length; l++) {
      update(this.weights[l], this.gradW[l], this.m1W[l], this.m2W[l], l2);
      update(this.biases[l], this.gradB[l], this.m1B[l], this.m2B[l], 0);
    }
  }

  /** Mean BCE and accuracy over the given sample indices. */
  evaluate(features: Float64Array, labels: Uint8Array, indices: ArrayLike<number>) {
    const dim = this.sizes[0];
    const view = new Float64Array(dim);
    let loss = 0;
    let correct = 0;
    for (let s = 0; s < indices.length; s++) {
      const index = indices[s];
      for (let k = 0; k < dim; k++) view[k] = features[index * dim + k];
      const z = this.logit(view);
      const y = labels[index];
      loss += bceFromLogit(z, y);
      if ((z >= 0 ? 1 : 0) === y) correct += 1;
    }
    const count = Math.max(1, indices.length);
    return { loss: loss / count, accuracy: correct / count };
  }

  isFinite() {
    return this.weights.every((w) => w.every(Number.isFinite)) && this.biases.every((b) => b.every(Number.isFinite));
  }
}
