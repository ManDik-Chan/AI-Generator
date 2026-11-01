/*
 * Deterministic experiment harnesses for the Research Lab.
 *
 * Every function here is pure TypeScript over code that already ships in this repository
 * (the sorting lab, the route optimizer solver and the neural-network MLP). The experiment
 * page calls a harness once while it is rendered on the server, which gives the reference
 * result, and the visitor's browser can call the same harness again to reproduce it. Nothing
 * here talks to a server, starts a Worker or reads any data outside its arguments.
 */
import { generateDataset } from "@/features/demos/neural-network/datasets";
import { Mlp, activations, type Activation } from "@/features/demos/neural-network/mlp";
import { generateInstance, type InstanceKind } from "@/features/demos/route-optimizer/instances";
import { distanceMatrix, tourLength } from "@/features/demos/route-optimizer/geometry";
import { TourSolver, type Construction, type Improvement } from "@/features/demos/route-optimizer/solver";
import { algorithms, distributions, makeInput, runSort } from "@/features/platform/sorting";

export const replayKinds = ["sorting-comparisons", "route-bound", "route-local-optimum", "mlp-gradient-check"] as const;
export type ReplayKind = (typeof replayKinds)[number];

/** How far a reproduced value may be from the reference and still agree with it. */
export type Tolerance = { kind: "exact" } | { kind: "relative"; value: number } | { kind: "absolute"; value: number };

export interface ResultColumn {
  key: string;
  label: string;
  unit?: string;
  format: "int" | "fixed" | "percent" | "sci";
  digits?: number;
  tolerance: Tolerance;
}

export interface ResultRow {
  key: string;
  label: string;
  values: Record<string, number>;
}

/** A pass / fail criterion stated before the experiment ran (it is part of the protocol). */
export interface ResultCheck {
  key: string;
  label: string;
  pass: boolean;
}

export interface ReplayOutcome {
  /** Header of the row-label column. */
  rowHeader: string;
  columns: ResultColumn[];
  rows: ResultRow[];
  checks: ResultCheck[];
}

export interface ReplaySpec {
  /** Seed used for the reference result. */
  defaultSeed: number;
  /** Seeds the visitor may choose; the harness accepts any integer in this range. */
  seedRange: readonly [number, number];
  run(seed: number): ReplayOutcome;
}

const exact: Tolerance = { kind: "exact" };
/** Floating-point sums of square roots: the same operations in the same order give the same bits. */
const lengthTolerance: Tolerance = { kind: "relative", value: 1e-9 };

/* ------------------------------------------------------------------ sorting */

const SORT_N = 64;

function sortingComparisons(seed: number): ReplayOutcome {
  let sortedEverywhere = true;
  const rows = distributions.map((distribution) => {
    const input = makeInput(distribution.key, SORT_N, seed);
    const expected = [...input].sort((a, b) => a - b);
    const values: Record<string, number> = {};
    for (const algorithm of algorithms) {
      const run = runSort(algorithm.key, input);
      values[algorithm.key] = run.comparisons;
      if (run.sorted.length !== expected.length || run.sorted.some((value, index) => value !== expected[index])) sortedEverywhere = false;
    }
    return { key: distribution.key, label: distribution.label, values };
  });
  return {
    rowHeader: "输入分布",
    columns: algorithms.map((algorithm) => ({ key: algorithm.key, label: algorithm.label, unit: "次", format: "int", tolerance: exact })),
    rows,
    checks: [{ key: "sorted", label: "12 次运行的输出都是输入的升序排列", pass: sortedEverywhere }],
  };
}

/* ------------------------------------------------------------------- routes */

const ROUTE_EPS = 1e-9;

function solve(points: readonly (readonly [number, number])[], construction: Construction, improvement: Improvement, seed: number) {
  // A frozen clock never reaches the slice end, so `step` runs to completion in one call and
  // the result does not depend on how fast the machine is.
  const solver = new TourSolver(points, { construction, improvement, seed, startIndex: 0, annealingIterations: 0 }, () => 0);
  while (!solver.step(1)) { /* runs to completion */ }
  return solver;
}

const ROUTE_N = 120;
const routeInstances: { kind: InstanceKind; label: string }[] = [
  { kind: "uniform", label: "均匀随机" },
  { kind: "clustered", label: "聚类城市" },
  { kind: "circle", label: "环形" },
  { kind: "grid", label: "网格" },
];

function routeBound(seed: number): ReplayOutcome {
  let aboveBound = true;
  let improved = true;
  let orOptNotWorse = true;
  const rows = routeInstances.map(({ kind, label }) => {
    const points = generateInstance(kind, ROUTE_N, seed);
    const twoOpt = solve(points, "nearest-neighbor", "two-opt", seed);
    const orOpt = solve(points, "nearest-neighbor", "or-opt", seed);
    const bound = twoOpt.lowerBound;
    if (twoOpt.bestLength < bound - ROUTE_EPS || orOpt.bestLength < bound - ROUTE_EPS) aboveBound = false;
    if (twoOpt.bestLength > twoOpt.initialLength + ROUTE_EPS) improved = false;
    if (orOpt.bestLength > twoOpt.bestLength + ROUTE_EPS) orOptNotWorse = false;
    return {
      key: kind,
      label,
      values: {
        construction: twoOpt.initialLength,
        twoOpt: twoOpt.bestLength,
        orOpt: orOpt.bestLength,
        bound,
        gap: (orOpt.bestLength / bound - 1) * 100,
      },
    };
  });
  return {
    rowHeader: "点集",
    columns: [
      { key: "construction", label: "最近邻构造", format: "fixed", digits: 1, tolerance: lengthTolerance },
      { key: "twoOpt", label: "2-opt 之后", format: "fixed", digits: 1, tolerance: lengthTolerance },
      { key: "orOpt", label: "Or-opt 之后", format: "fixed", digits: 1, tolerance: lengthTolerance },
      { key: "bound", label: "MST 下界", format: "fixed", digits: 1, tolerance: lengthTolerance },
      { key: "gap", label: "距最优上界", unit: "%", format: "percent", digits: 2, tolerance: { kind: "absolute", value: 1e-6 } },
    ],
    rows,
    checks: [
      { key: "bound", label: "每条路线都不短于同一点集的 MST 下界", pass: aboveBound },
      { key: "improved", label: "2-opt 之后的路线不长于构造路线", pass: improved },
      { key: "or-opt", label: "Or-opt 的结果不比同一构造下的 2-opt 差", pass: orOptNotWorse },
    ],
  };
}

const LOCAL_N = 150;
const localRuns: { key: string; label: string; construction: Construction; improvement: Improvement }[] = [
  { key: "nn-2opt", label: "最近邻 + 2-opt", construction: "nearest-neighbor", improvement: "two-opt" },
  { key: "random-2opt", label: "随机构造 + 2-opt", construction: "random", improvement: "two-opt" },
  { key: "nn-oropt", label: "最近邻 + Or-opt", construction: "nearest-neighbor", improvement: "or-opt" },
];

/** Scan every 2-opt move of a closed tour: how many would shorten it, and the smallest change. */
export function scanTwoOpt(tour: readonly number[], d: Float64Array, n: number) {
  let checked = 0;
  let improving = 0;
  let minDelta = Infinity;
  for (let i = 0; i < n - 2; i++) {
    const a = tour[i];
    const b = tour[i + 1];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // these two edges share city tour[0]
      const c = tour[j];
      const e = tour[(j + 1) % n];
      const delta = d[a * n + c] + d[b * n + e] - d[a * n + b] - d[c * n + e];
      checked += 1;
      if (delta < -ROUTE_EPS) improving += 1;
      if (delta < minDelta) minDelta = delta;
    }
  }
  return { checked, improving, minDelta };
}

function routeLocalOptimum(seed: number): ReplayOutcome {
  const points = generateInstance("uniform", LOCAL_N, seed);
  const d = distanceMatrix(points);
  let localOptimum = true;
  const rows = localRuns.map((run) => {
    const solver = solve(points, run.construction, run.improvement, seed);
    const tour = solver.bestTour();
    const scan = scanTwoOpt(tour, d, LOCAL_N);
    if (scan.improving > 0) localOptimum = false;
    return { key: run.key, label: run.label, values: { length: tourLength(tour, d, LOCAL_N), checked: scan.checked, improving: scan.improving, minDelta: scan.minDelta } };
  });
  return {
    rowHeader: "构造与改进",
    columns: [
      { key: "length", label: "路线长度", format: "fixed", digits: 1, tolerance: lengthTolerance },
      { key: "checked", label: "检查的交换", unit: "个", format: "int", tolerance: exact },
      { key: "improving", label: "可缩短的交换", unit: "个", format: "int", tolerance: exact },
      { key: "minDelta", label: "最小长度变化 Δ", format: "fixed", digits: 3, tolerance: { kind: "absolute", value: 1e-6 } },
    ],
    rows,
    checks: [{ key: "local-optimum", label: "三条路线上都没有能缩短路线的 2-opt 交换（Δ < −10⁻⁹）", pass: localOptimum }],
  };
}

/* ----------------------------------------------------------------- gradients */

export const GRADIENT_STEP = 1e-5;
export const GRADIENT_THRESHOLD = 1e-6;
const GRADIENT_SAMPLES = 24;

/**
 * Compare backpropagation with central differences for every parameter of a small MLP.
 * The analytic gradient is read from one plain SGD step with learning rate 1 and no weight
 * decay, so `before − after` is the gradient of the mean loss over the batch.
 */
export function gradientCheck(activation: Activation, seed: number) {
  const data = generateDataset({ kind: "moons", samples: GRADIENT_SAMPLES, noise: 0.1, testRatio: 0.25, seed });
  const all = Int32Array.from({ length: GRADIENT_SAMPLES }, (_, i) => i);
  const shape = { inputs: 2, hidden: [4, 3], activation, seed };
  const probe = new Mlp(shape);
  const stepped = new Mlp(shape);
  const before = [...stepped.weights, ...stepped.biases].map((values) => Float64Array.from(values));
  stepped.trainBatch(data.points, data.labels, all, { learningRate: 1, l2: 0, optimizer: "sgd" });
  const after = [...stepped.weights, ...stepped.biases];

  let maxAbsolute = 0;
  let maxRelative = 0;
  [...probe.weights, ...probe.biases].forEach((params, group) => {
    for (let k = 0; k < params.length; k++) {
      const original = params[k];
      params[k] = original + GRADIENT_STEP;
      const up = probe.evaluate(data.points, data.labels, all).loss;
      params[k] = original - GRADIENT_STEP;
      const down = probe.evaluate(data.points, data.labels, all).loss;
      params[k] = original;
      const numeric = (up - down) / (2 * GRADIENT_STEP);
      const analytic = before[group][k] - after[group][k];
      const absolute = Math.abs(analytic - numeric);
      maxAbsolute = Math.max(maxAbsolute, absolute);
      // Relative error with a floor, so two near-zero gradients do not divide noise by noise.
      maxRelative = Math.max(maxRelative, absolute / Math.max(Math.abs(analytic), Math.abs(numeric), 1e-4));
    }
  });
  return { parameters: probe.parameterCount, maxAbsolute, maxRelative };
}

const activationLabels: Record<Activation, string> = { tanh: "tanh", relu: "ReLU", sigmoid: "sigmoid" };

function mlpGradientCheck(seed: number): ReplayOutcome {
  let withinThreshold = true;
  const rows = activations.map((activation) => {
    const result = gradientCheck(activation, seed);
    if (!(result.maxRelative <= GRADIENT_THRESHOLD)) withinThreshold = false;
    return { key: activation, label: activationLabels[activation], values: { parameters: result.parameters, maxAbsolute: result.maxAbsolute, maxRelative: result.maxRelative } };
  });
  // The errors are rounding noise, and JavaScript engines may round tanh / exp differently in
  // the last place. Differences far below the threshold do not change the verdict.
  return {
    rowHeader: "激活函数",
    columns: [
      { key: "parameters", label: "参数个数", unit: "个", format: "int", tolerance: exact },
      { key: "maxAbsolute", label: "最大绝对误差", format: "sci", digits: 2, tolerance: { kind: "absolute", value: 1e-9 } },
      { key: "maxRelative", label: "最大相对误差", format: "sci", digits: 2, tolerance: { kind: "absolute", value: GRADIENT_THRESHOLD / 2 } },
    ],
    rows,
    checks: [{ key: "threshold", label: "三种激活函数下，每个参数的相对误差都不超过 10⁻⁶", pass: withinThreshold }],
  };
}

/* ------------------------------------------------------------------ registry */

export const replaySpecs: Record<ReplayKind, ReplaySpec> = {
  "sorting-comparisons": { defaultSeed: 2026, seedRange: [1, 99_999], run: sortingComparisons },
  "route-bound": { defaultSeed: 7, seedRange: [1, 99_999], run: routeBound },
  "route-local-optimum": { defaultSeed: 11, seedRange: [1, 99_999], run: routeLocalOptimum },
  "mlp-gradient-check": { defaultSeed: 5, seedRange: [1, 99_999], run: mlpGradientCheck },
};

export function runReplay(kind: ReplayKind, seed = replaySpecs[kind].defaultSeed): ReplayOutcome {
  const spec = replaySpecs[kind];
  if (!Number.isInteger(seed) || seed < spec.seedRange[0] || seed > spec.seedRange[1]) throw new RangeError(`Seed out of range for ${kind}`);
  return spec.run(seed);
}

/* ---------------------------------------------------------------- comparison */

export function withinTolerance(reference: number, value: number, tolerance: Tolerance) {
  if (!Number.isFinite(reference) || !Number.isFinite(value)) return Object.is(reference, value);
  if (tolerance.kind === "exact") return reference === value;
  const difference = Math.abs(reference - value);
  if (tolerance.kind === "absolute") return difference <= tolerance.value;
  return difference <= tolerance.value * Math.max(Math.abs(reference), Math.abs(value));
}

export interface Comparison {
  /** Same shape: rows, columns and checks line up with the reference. */
  comparable: boolean;
  /** `${row}:${column}` → agrees with the reference within that column's tolerance. */
  cells: Record<string, boolean>;
  valuesAgree: boolean;
  checksAgree: boolean;
}

export function compareOutcomes(reference: ReplayOutcome, replay: ReplayOutcome): Comparison {
  const sameShape = reference.rows.length === replay.rows.length
    && reference.columns.length === replay.columns.length
    && reference.checks.length === replay.checks.length
    && reference.rows.every((row, index) => row.key === replay.rows[index].key)
    && reference.columns.every((column, index) => column.key === replay.columns[index].key);
  if (!sameShape) return { comparable: false, cells: {}, valuesAgree: false, checksAgree: false };
  const cells: Record<string, boolean> = {};
  let valuesAgree = true;
  reference.rows.forEach((row, index) => {
    for (const column of reference.columns) {
      const agree = withinTolerance(row.values[column.key], replay.rows[index].values[column.key], column.tolerance);
      cells[`${row.key}:${column.key}`] = agree;
      if (!agree) valuesAgree = false;
    }
  });
  const checksAgree = reference.checks.every((check, index) => check.key === replay.checks[index].key && check.pass === replay.checks[index].pass);
  return { comparable: true, cells, valuesAgree, checksAgree };
}

const superscript: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

export function formatResult(value: number, column: Pick<ResultColumn, "format" | "digits">): string {
  if (!Number.isFinite(value)) return "—";
  if (column.format === "int") return Math.round(value).toLocaleString("en-US");
  if (column.format === "fixed") return value.toLocaleString("en-US", { minimumFractionDigits: column.digits ?? 2, maximumFractionDigits: column.digits ?? 2 });
  if (column.format === "percent") return value.toFixed(column.digits ?? 2);
  if (value === 0) return "0";
  const [mantissa, exponent] = value.toExponential(column.digits ?? 2).split("e");
  return `${mantissa} × 10${exponent.replace("+", "").split("").map((char) => superscript[char] ?? char).join("")}`;
}
