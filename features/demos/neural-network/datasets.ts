/*
 * Seeded two-class datasets in the square [-1.5, 1.5]². Every point is generated in the
 * visitor's browser; nothing is downloaded or uploaded.
 */
import { prng } from "@/features/platform/sorting";

export const datasetKinds = ["moons", "circles", "spiral", "xor", "blobs"] as const;
export type DatasetKind = (typeof datasetKinds)[number];

export const datasetLabels: Record<DatasetKind, string> = {
  moons: "双月",
  circles: "同心圆",
  spiral: "双螺旋",
  xor: "异或",
  blobs: "两团高斯",
};

export const featureSets = ["raw", "quadratic"] as const;
export type FeatureSet = (typeof featureSets)[number];

/** Half-width of the plotting and sampling square. */
export const DOMAIN = 1.5;

export interface DatasetConfig {
  kind: DatasetKind;
  samples: number;
  noise: number;
  testRatio: number;
  seed: number;
}

export interface Dataset {
  /** Interleaved x, y. */
  points: Float64Array;
  labels: Uint8Array;
  train: Int32Array;
  test: Int32Array;
}

function normal(rand: () => number) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const clip = (value: number) => Math.max(-DOMAIN + 0.02, Math.min(DOMAIN - 0.02, value));

export function generateDataset(config: DatasetConfig): Dataset {
  const rand = prng((Math.imul(config.seed, 0x27d4eb2d) + config.samples) >>> 0);
  const n = config.samples;
  const points = new Float64Array(n * 2);
  const labels = new Uint8Array(n);
  const jitter = config.noise;

  for (let i = 0; i < n; i++) {
    const label = i % 2;
    let x = 0;
    let y = 0;
    if (config.kind === "moons") {
      const t = Math.PI * rand();
      if (label === 0) {
        x = Math.cos(t) - 0.5;
        y = Math.sin(t) - 0.25;
      } else {
        x = 0.5 - Math.cos(t);
        y = 0.25 - Math.sin(t);
      }
      x *= 0.95;
      y *= 0.95;
    } else if (config.kind === "circles") {
      const angle = rand() * Math.PI * 2;
      const radius = label === 0 ? rand() * 0.5 : 0.85 + rand() * 0.3;
      x = Math.cos(angle) * radius;
      y = Math.sin(angle) * radius;
    } else if (config.kind === "spiral") {
      const t = 0.25 + rand() * 2.75;
      const angle = t * 1.9 + label * Math.PI;
      const radius = t * 0.42;
      x = Math.cos(angle) * radius;
      y = Math.sin(angle) * radius;
    } else if (config.kind === "xor") {
      const pick = () => (0.12 + rand() * 1.1) * (rand() < 0.5 ? -1 : 1);
      x = pick();
      y = pick();
      if ((x * y > 0 ? 0 : 1) !== label) y = -y;
    } else {
      const center = label === 0 ? -0.55 : 0.55;
      x = center + normal(rand) * 0.32;
      y = center + normal(rand) * 0.32;
    }
    points[i * 2] = clip(x + normal(rand) * jitter * 0.5);
    points[i * 2 + 1] = clip(y + normal(rand) * jitter * 0.5);
    labels[i] = label;
  }

  const order = Int32Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  const testCount = Math.max(1, Math.min(n - 1, Math.round(n * config.testRatio)));
  return { points, labels, test: order.slice(0, testCount), train: order.slice(testCount) };
}

export function featureCount(set: FeatureSet) {
  return set === "raw" ? 2 : 5;
}

/** Write the features of one point into `out` (length featureCount). */
export function featurize(x: number, y: number, set: FeatureSet, out: Float64Array) {
  out[0] = x;
  out[1] = y;
  if (set === "quadratic") {
    out[2] = x * x;
    out[3] = y * y;
    out[4] = x * y;
  }
  return out;
}

export function featureLabels(set: FeatureSet) {
  return set === "raw" ? ["x", "y"] : ["x", "y", "x²", "y²", "xy"];
}
