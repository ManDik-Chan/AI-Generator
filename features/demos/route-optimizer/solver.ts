/*
 * Travelling-salesman heuristics for the route optimizer demo.
 *
 * Construction: nearest neighbour (O(n²)) or a seeded random permutation.
 * Improvement:
 * - two-opt   — first-improvement 2-opt passes until no move shortens the tour;
 * - or-opt    — alternate 2-opt with Or-opt (move a run of 1–3 cities, either
 *               orientation) until neither finds an improvement;
 * - annealing — simulated annealing over random 2-opt moves with geometric cooling,
 *               then a 2-opt polish of the best tour seen.
 * The solver is a stepper: `step(sliceMs)` works for at most one slice so the caller can
 * stream progress, honour cancellation and stop at a deadline with the best tour so far.
 */
import { distanceMatrix, mstWeight, tourLength, type Point } from "@/features/demos/route-optimizer/geometry";
import { prng } from "@/features/platform/sorting";

export const constructions = ["nearest-neighbor", "random"] as const;
export const improvements = ["none", "two-opt", "or-opt", "annealing"] as const;
export type Construction = (typeof constructions)[number];
export type Improvement = (typeof improvements)[number];
export type StopReason = "construction-only" | "converged" | "schedule-complete" | "deadline";
export type SolverPhase = "two-opt" | "or-opt" | "annealing" | "polish" | "done";

export interface SolverOptions {
  construction: Construction;
  improvement: Improvement;
  seed: number;
  startIndex: number;
  annealingIterations: number;
}

export interface SolverSample {
  /** Milliseconds since the solver was created. */
  at: number;
  length: number;
}

const EPS = 1e-9;
const ANNEAL_CHUNK = 2048;

export class TourSolver {
  readonly n: number;
  readonly initialLength: number;
  readonly lowerBound: number;
  phase: SolverPhase = "done";
  stopReason: StopReason | null = null;
  /** Candidate moves evaluated. */
  iterations = 0;
  /** Moves applied (improving moves, or accepted moves during annealing). */
  appliedMoves = 0;
  passes = 0;
  bestLength: number;
  readonly history: SolverSample[] = [];

  private readonly d: Float64Array;
  private readonly rand: () => number;
  private readonly started: number;
  private tour: Int32Array;
  private best: Int32Array;
  private length: number;
  private annealStep = 0;
  private temperature = 0;
  private cooling = 1;
  private lastSample = -Infinity;

  constructor(
    points: readonly Point[],
    private readonly options: SolverOptions,
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.n = points.length;
    this.started = clock();
    this.d = distanceMatrix(points);
    this.rand = prng((Math.imul(options.seed, 0x85ebca6b) ^ 0x5bd1e995) >>> 0);
    this.tour = options.construction === "random" ? this.randomTour() : this.nearestNeighbourTour(options.startIndex);
    this.length = tourLength(this.tour, this.d, this.n);
    this.initialLength = this.length;
    this.best = this.tour.slice();
    this.bestLength = this.length;
    this.lowerBound = mstWeight(this.d, this.n);
    this.record(true);

    if (options.improvement === "none") this.finish("construction-only");
    else if (this.n <= 3) this.finish("converged");
    else if (options.improvement === "annealing") {
      const meanEdge = this.length / this.n || 1;
      this.temperature = meanEdge * 0.6;
      const end = meanEdge * 0.002;
      this.cooling = Math.pow(end / this.temperature, 1 / Math.max(1, options.annealingIterations));
      this.phase = "annealing";
    } else this.phase = "two-opt";
  }

  get done() {
    return this.phase === "done";
  }

  elapsed() {
    return this.clock() - this.started;
  }

  /** Work for at most `sliceMs`. Returns true once the solver has finished. */
  step(sliceMs: number): boolean {
    const end = this.clock() + sliceMs;
    while (this.phase !== "done") {
      if (this.phase === "two-opt" || this.phase === "polish") {
        const improved = this.twoOptPass();
        this.passes += 1;
        this.syncBest();
        if (!improved) {
          if (this.phase === "polish") this.finish("schedule-complete");
          else if (this.options.improvement === "or-opt") this.phase = "or-opt";
          else this.finish("converged");
        }
      } else if (this.phase === "or-opt") {
        const improved = this.orOptPass();
        this.passes += 1;
        this.syncBest();
        if (improved) this.phase = "two-opt";
        else this.finish("converged");
      } else {
        this.annealChunk();
        if (this.annealStep >= this.options.annealingIterations) {
          this.tour = this.best.slice();
          this.length = this.bestLength;
          this.phase = "polish";
        }
      }
      this.record(false);
      if (this.clock() >= end) break;
    }
    return this.phase === "done";
  }

  /** Stop early (deadline); the best tour found so far is kept. */
  interrupt() {
    if (this.phase !== "done") this.finish("deadline");
  }

  /** Best tour so far, rotated to begin at the start city. */
  bestTour(): number[] {
    const start = this.best.indexOf(this.options.startIndex);
    const out = new Array<number>(this.n);
    for (let k = 0; k < this.n; k++) out[k] = this.best[(start + k) % this.n];
    return out;
  }

  /* ----------------------------------------------------------- construction */

  private nearestNeighbourTour(start: number) {
    const { n, d } = this;
    const tour = new Int32Array(n);
    const used = new Uint8Array(n);
    let current = start;
    tour[0] = current;
    used[current] = 1;
    for (let k = 1; k < n; k++) {
      let next = -1;
      let min = Infinity;
      const row = current * n;
      for (let v = 0; v < n; v++) {
        if (!used[v] && d[row + v] < min) {
          min = d[row + v];
          next = v;
        }
      }
      tour[k] = next;
      used[next] = 1;
      current = next;
    }
    return tour;
  }

  private randomTour() {
    const tour = Int32Array.from({ length: this.n }, (_, i) => i);
    for (let i = this.n - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      const tmp = tour[i];
      tour[i] = tour[j];
      tour[j] = tmp;
    }
    return tour;
  }

  /* ----------------------------------------------------------- improvement */

  private reverse(from: number, to: number) {
    const t = this.tour;
    while (from < to) {
      const tmp = t[from];
      t[from] = t[to];
      t[to] = tmp;
      from += 1;
      to -= 1;
    }
  }

  /** Reverse `count` positions starting at `from`, wrapping around the end. */
  private reverseCyclic(from: number, count: number) {
    const { n } = this;
    const t = this.tour;
    for (let k = 0; k < count >> 1; k++) {
      const a = (from + k) % n;
      const b = (from + count - 1 - k) % n;
      const tmp = t[a];
      t[a] = t[b];
      t[b] = tmp;
    }
  }

  /** Replace edges (t[i],t[i+1]) and (t[j],t[j+1]) by reversing the shorter side. */
  private applyTwoOpt(i: number, j: number) {
    const inner = j - i;
    if (inner <= this.n - inner) this.reverse(i + 1, j);
    else this.reverseCyclic(j + 1, this.n - inner);
  }

  private twoOptPass() {
    const { n, d } = this;
    const t = this.tour;
    let improved = false;
    let evaluated = 0;
    for (let i = 0; i < n - 2; i++) {
      const a = t[i];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const b = t[i + 1];
        const c = t[j];
        const e = t[(j + 1) % n];
        const delta = d[a * n + c] + d[b * n + e] - d[a * n + b] - d[c * n + e];
        evaluated += 1;
        if (delta < -EPS) {
          this.reverse(i + 1, j);
          this.appliedMoves += 1;
          improved = true;
        }
      }
    }
    this.iterations += evaluated;
    if (improved) this.length = tourLength(t, d, n);
    return improved;
  }

  private rotate(offset: number) {
    if (!offset) return;
    const { n } = this;
    const out = new Int32Array(n);
    for (let k = 0; k < n; k++) out[k] = this.tour[(k + offset) % n];
    this.tour = out;
  }

  /** Or-opt sweep over segments that do not contain position 0; rotated twice to cover all. */
  private orOptPass() {
    let improved = this.orOptSweep();
    if (!improved) {
      this.rotate(this.n >> 1);
      improved = this.orOptSweep();
    }
    if (improved) this.length = tourLength(this.tour, this.d, this.n);
    return improved;
  }

  private orOptSweep() {
    const { n, d } = this;
    let improved = false;
    let evaluated = 0;
    for (let len = 1; len <= 3; len++) {
      if (n < len + 3) continue;
      for (let s = 1; s + len - 1 <= n - 1; s++) {
        const t = this.tour;
        const e = s + len - 1;
        const prev = t[s - 1];
        const first = t[s];
        const last = t[e];
        const next = t[(e + 1) % n];
        const removeGain = d[prev * n + first] + d[last * n + next] - d[prev * n + next];
        if (removeGain <= EPS) continue;
        let bestK = -1;
        let bestCost = removeGain - EPS;
        let reversed = false;
        for (let k = 0; k < n; k++) {
          if (k >= s - 1 && k <= e) continue;
          const p = t[k];
          const q = t[(k + 1) % n];
          const base = d[p * n + q];
          const forward = d[p * n + first] + d[last * n + q] - base;
          const backward = d[p * n + last] + d[first * n + q] - base;
          evaluated += 1;
          if (forward < bestCost) {
            bestCost = forward;
            bestK = k;
            reversed = false;
          }
          if (backward < bestCost) {
            bestCost = backward;
            bestK = k;
            reversed = true;
          }
        }
        if (bestK >= 0) {
          const segment = Array.from(t.subarray(s, e + 1));
          if (reversed) segment.reverse();
          const out = new Int32Array(n);
          let w = 0;
          for (let m = 0; m < n; m++) {
            if (m >= s && m <= e) continue;
            out[w++] = t[m];
            if (m === bestK) for (const v of segment) out[w++] = v;
          }
          this.tour = out;
          this.appliedMoves += 1;
          improved = true;
        }
      }
    }
    this.iterations += evaluated;
    return improved;
  }

  private annealChunk() {
    const { n, d } = this;
    const total = this.options.annealingIterations;
    let evaluated = 0;
    for (let c = 0; c < ANNEAL_CHUNK && this.annealStep < total; c++) {
      this.annealStep += 1;
      this.temperature *= this.cooling;
      let i = Math.floor(this.rand() * n);
      let j = Math.floor(this.rand() * n);
      if (i > j) {
        const tmp = i;
        i = j;
        j = tmp;
      }
      if (j - i < 2 || (i === 0 && j === n - 1)) continue;
      const t = this.tour;
      const a = t[i];
      const b = t[i + 1];
      const cc = t[j];
      const e = t[(j + 1) % n];
      const delta = d[a * n + cc] + d[b * n + e] - d[a * n + b] - d[cc * n + e];
      evaluated += 1;
      if (delta < 0 || this.rand() < Math.exp(-delta / this.temperature)) {
        this.applyTwoOpt(i, j);
        this.length += delta;
        this.appliedMoves += 1;
        if (this.length < this.bestLength - EPS) {
          this.best.set(this.tour);
          this.bestLength = this.length;
        }
      }
    }
    this.iterations += evaluated;
  }

  /* ----------------------------------------------------------- bookkeeping */

  private syncBest() {
    if (this.length < this.bestLength - EPS || this.phase === "polish") {
      this.best = this.tour.slice();
      this.bestLength = tourLength(this.best, this.d, this.n);
    }
  }

  private finish(reason: StopReason) {
    this.stopReason = reason;
    this.phase = "done";
    this.record(true);
  }

  private record(force: boolean) {
    const at = this.elapsed();
    if (!force && at - this.lastSample < 4) return;
    this.lastSample = at;
    this.history.push({ at, length: this.bestLength });
  }
}

/** Keep at most `max` samples: first, last and evenly spaced ones in between. */
export function downsample<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const out: T[] = [];
  for (let k = 0; k < max; k++) out.push(items[Math.round((k * (items.length - 1)) / (max - 1))]);
  return out;
}
