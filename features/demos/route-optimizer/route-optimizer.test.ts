import { describe, expect, it } from "vitest";

import { executeRun } from "@/features/demos/runtime/executor";
import { routeOptimizerCapability } from "@/features/demos/route-optimizer/capability";
import { distanceMatrix, isPermutation, mstWeight, tourLength, type Point } from "@/features/demos/route-optimizer/geometry";
import { generateInstance, instanceKinds, PLANE } from "@/features/demos/route-optimizer/instances";
import { routeInputSchema } from "@/features/demos/route-optimizer/schema";
import { improvements, TourSolver, downsample, type SolverOptions } from "@/features/demos/route-optimizer/solver";

const options = (patch: Partial<SolverOptions> = {}): SolverOptions => ({ construction: "nearest-neighbor", improvement: "two-opt", seed: 1, startIndex: 0, annealingIterations: 20_000, ...patch });

function solve(points: Point[], patch: Partial<SolverOptions> = {}) {
  const solver = new TourSolver(points, options(patch));
  let guard = 0;
  while (!solver.step(50) && guard++ < 10_000);
  return solver;
}

function hasImprovingTwoOpt(tour: number[], points: Point[]) {
  const n = points.length;
  const d = distanceMatrix(points);
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, e] = [tour[i], tour[i + 1], tour[j], tour[(j + 1) % n]];
      if (d[a * n + c] + d[b * n + e] - d[a * n + b] - d[c * n + e] < -1e-7) return true;
    }
  }
  return false;
}

describe("geometry", () => {
  const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];

  it("measures closed tours and the MST bound", () => {
    const d = distanceMatrix(square);
    expect(tourLength([0, 1, 2, 3], d, 4)).toBe(40);
    expect(tourLength([0, 2, 1, 3], d, 4)).toBeCloseTo(20 + 20 * Math.SQRT2);
    expect(mstWeight(d, 4)).toBe(30);
    expect(mstWeight(new Float64Array(1), 1)).toBe(0);
  });

  it("recognises permutations", () => {
    expect(isPermutation([2, 0, 1], 3)).toBe(true);
    expect(isPermutation([0, 0, 1], 3)).toBe(false);
    expect(isPermutation([0, 1], 3)).toBe(false);
    expect(isPermutation([0, 1, 3], 3)).toBe(false);
  });
});

describe("instances", () => {
  it.each(instanceKinds)("%s is deterministic, sized and inside the plane", (kind) => {
    const a = generateInstance(kind, 137, 42);
    expect(a).toEqual(generateInstance(kind, 137, 42));
    expect(a).not.toEqual(generateInstance(kind, 137, 43));
    expect(a).toHaveLength(137);
    for (const [x, y] of a) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(PLANE);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(PLANE);
    }
  });
});

describe("TourSolver", () => {
  const points = generateInstance("uniform", 150, 9);

  it.each(improvements)("%s returns a valid tour from the start city, never below the bound", (improvement) => {
    for (const construction of ["nearest-neighbor", "random"] as const) {
      const solver = solve(points, { improvement, construction, startIndex: 17 });
      const tour = solver.bestTour();
      expect(isPermutation(tour, points.length)).toBe(true);
      expect(tour[0]).toBe(17);
      expect(tourLength(tour, distanceMatrix(points), points.length)).toBeCloseTo(solver.bestLength, 6);
      expect(solver.bestLength).toBeLessThanOrEqual(solver.initialLength + 1e-9);
      expect(solver.bestLength).toBeGreaterThanOrEqual(solver.lowerBound - 1e-9);
      expect(solver.stopReason).toBe(improvement === "none" ? "construction-only" : improvement === "annealing" ? "schedule-complete" : "converged");
    }
  });

  it("ends 2-opt, Or-opt and annealing at a 2-opt local optimum", () => {
    for (const improvement of ["two-opt", "or-opt", "annealing"] as const) {
      expect(hasImprovingTwoOpt(solve(points, { improvement }).bestTour(), points)).toBe(false);
    }
  });

  it("Or-opt never ends worse than 2-opt from the same construction", () => {
    for (const kind of instanceKinds) {
      const set = generateInstance(kind, 120, 5);
      expect(solve(set, { improvement: "or-opt" }).bestLength).toBeLessThanOrEqual(solve(set, { improvement: "two-opt" }).bestLength + 1e-9);
    }
  });

  it("is deterministic for a seed", () => {
    const a = solve(points, { improvement: "annealing", construction: "random", seed: 77 });
    const b = solve(points, { improvement: "annealing", construction: "random", seed: 77 });
    expect(a.bestTour()).toEqual(b.bestTour());
  });

  it("handles tiny and degenerate inputs", () => {
    expect(solve([[0, 0], [5, 5], [9, 1]]).stopReason).toBe("converged");
    const same = solve([[3, 3], [3, 3], [3, 3], [3, 3], [3, 3]], { improvement: "or-opt" });
    expect(same.bestLength).toBe(0);
    expect(same.lowerBound).toBe(0);
    const dupes = solve([[0, 0], [0, 0], [10, 0], [10, 0], [10, 10]], { improvement: "annealing" });
    expect(isPermutation(dupes.bestTour(), 5)).toBe(true);
  });

  it("keeps the best tour when interrupted", () => {
    const solver = new TourSolver(generateInstance("uniform", 400, 1), options({ improvement: "annealing", annealingIterations: 3_000_000 }));
    solver.step(5);
    solver.interrupt();
    expect(solver.stopReason).toBe("deadline");
    expect(isPermutation(solver.bestTour(), 400)).toBe(true);
    expect(solver.done).toBe(true);
  });

  it("downsamples history keeping both ends", () => {
    const items = Array.from({ length: 500 }, (_, i) => i);
    const out = downsample(items, 120);
    expect(out).toHaveLength(120);
    expect(out[0]).toBe(0);
    expect(out.at(-1)).toBe(499);
    expect(downsample([1, 2], 120)).toEqual([1, 2]);
  });
});

describe("route-optimizer.solve capability", () => {
  it("applies defaults and rejects unknown fields", () => {
    const parsed = routeInputSchema.parse({ instance: { kind: "grid", count: 16 } });
    expect(parsed).toMatchObject({ construction: "nearest-neighbor", improvement: "two-opt", deadlineMs: 3000, startIndex: 0, seed: 1 });
    expect(routeInputSchema.safeParse({ instance: { kind: "grid", count: 16 }, magic: true }).success).toBe(false);
    expect(routeInputSchema.safeParse({}).success).toBe(false);
  });

  it("flags a start city outside the point set", () => {
    const input = routeInputSchema.parse({ points: [[0, 0], [1, 1], [2, 0]], startIndex: 5 });
    expect(routeOptimizerCapability.validate!(input)).toEqual([{ path: "input.startIndex", message: expect.stringContaining("3") }]);
  });

  it("echoes generated points but not supplied ones", async () => {
    const generated = await executeRun(routeOptimizerCapability, routeInputSchema.parse({ instance: { kind: "circle", count: 40 } }), { requestId: crypto.randomUUID(), deadlineMs: 3000 });
    expect(generated.output?.points).toHaveLength(40);
    const supplied = await executeRun(routeOptimizerCapability, routeInputSchema.parse({ points: generateInstance("circle", 40, 1) }), { requestId: crypto.randomUUID(), deadlineMs: 3000 });
    expect(supplied.output?.points).toBeUndefined();
    expect(supplied.output?.convergence.length).toBeLessThanOrEqual(120);
  });
});
