/*
 * `route-optimizer.solve` — the server-executed demo capability.
 *
 * The solver runs in 25 ms slices. Between slices the capability streams the best tour
 * (at most every 60 ms), yields to the event loop and checks for cancellation; at the
 * deadline it returns the best tour so far as a partial result (run → TIMED_OUT).
 */
import { defineServerCapability } from "@/features/demos/runtime/capability";
import { round } from "@/features/demos/route-optimizer/geometry";
import { generateInstance } from "@/features/demos/route-optimizer/instances";
import { DEFAULT_DEADLINE_MS, MAX_DEADLINE_MS, routeInputSchema, routeOutputSchema, type RouteInput, type RouteOutput, type RouteProgress } from "@/features/demos/route-optimizer/schema";
import { downsample, TourSolver } from "@/features/demos/route-optimizer/solver";

const SLICE_MS = 25;
const PROGRESS_EVERY_MS = 60;

export const ROUTE_CAPABILITY_ID = "route-optimizer.solve";

function summarize(solver: TourSolver, input: RouteInput, generated: [number, number][] | undefined, partial: boolean): RouteOutput {
  const length = solver.bestLength;
  return {
    ...(generated ? { points: generated } : {}),
    tour: solver.bestTour(),
    length: round(length),
    initialLength: round(solver.initialLength),
    improvement: solver.initialLength > 0 ? round(1 - length / solver.initialLength, 5) : 0,
    lowerBound: round(solver.lowerBound),
    gap: solver.lowerBound > 0 ? round(Math.max(0, length / solver.lowerBound - 1), 5) : 0,
    iterations: solver.iterations,
    appliedMoves: solver.appliedMoves,
    passes: solver.passes,
    stopReason: partial ? "deadline" : (solver.stopReason ?? "converged"),
    partial,
    elapsedMs: round(solver.elapsed(), 1),
    convergence: downsample(solver.history, 120).map((sample) => ({ at: round(sample.at, 1), length: round(sample.length) })),
  };
}

export const routeOptimizerCapability = defineServerCapability<RouteInput, RouteOutput>({
  descriptor: {
    id: ROUTE_CAPABILITY_ID,
    project: "route-optimizer",
    version: "1.0.0",
    title: "路线优化求解",
    summary: "为一组城市求一条尽量短的闭合路线：最近邻或随机构造，2-opt / Or-opt / 模拟退火改进，并给出最小生成树下界。",
    dataFlow: "platform",
    status: "demo",
    limits: {
      maxInputBytes: 64 * 1024,
      defaultDeadlineMs: DEFAULT_DEADLINE_MS,
      maxDeadlineMs: MAX_DEADLINE_MS,
      rateLimit: { requests: 20, windowSeconds: 60 },
      concurrentRunsPerClient: 2,
    },
    sourcePath: "features/demos/route-optimizer",
    docsPath: "/docs/api#route-optimizer-solve",
  },
  input: routeInputSchema,
  output: routeOutputSchema,
  validate(input) {
    const count = input.points?.length ?? input.instance?.count ?? 0;
    return input.startIndex >= count ? [{ path: "input.startIndex", message: `startIndex 必须小于点的数量（${count}）。` }] : [];
  },
  deadlineOf(input) {
    return input.deadlineMs;
  },
  async execute(input, ctx) {
    const generated = input.points ? undefined : generateInstance(input.instance!.kind, input.instance!.count, input.instance!.seed);
    const points = input.points ?? generated!;
    const solver = new TourSolver(points, {
      construction: input.construction,
      improvement: input.improvement,
      seed: input.seed,
      startIndex: input.startIndex,
      annealingIterations: input.annealingIterations,
    });
    let lastProgress = -Infinity;
    const report = (force = false) => {
      const now = ctx.now();
      if (!force && now - lastProgress < PROGRESS_EVERY_MS) return;
      lastProgress = now;
      const progress: RouteProgress = { phase: solver.phase, elapsedMs: round(solver.elapsed(), 1), length: round(solver.bestLength), iterations: solver.iterations, tour: solver.bestTour() };
      ctx.progress(progress);
    };
    report(true);
    while (!solver.done) {
      if (ctx.expired()) {
        solver.interrupt();
        return ctx.partial(summarize(solver, input, generated, true));
      }
      solver.step(Math.min(SLICE_MS, Math.max(1, ctx.timeLeft())));
      report();
      await ctx.checkpoint();
    }
    return summarize(solver, input, generated, false);
  },
});
