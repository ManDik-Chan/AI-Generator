import type { AgentRunMode } from "@prisma/client";

import { getAgentModeLimits } from "@/features/agents/constants";
import { agentPlanSchema } from "@/features/agents/schemas";
import type { AgentPlan, AgentPlanWorker } from "@/features/agents/types";

export class AgentPlanValidationError extends Error {
  readonly code = "INVALID_PLAN";

  constructor(message = "Planner returned an invalid task graph.") {
    super(message);
    this.name = "AgentPlanValidationError";
  }
}

export function buildDependencyGraph(workers: AgentPlanWorker[]) {
  return new Map(workers.map((worker) => [worker.key, [...worker.dependsOn]]));
}

export function detectDependencyCycle(graph: Map<string, string[]>) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    for (const dependency of graph.get(key) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(key);
    visited.add(key);
    return false;
  };
  return [...graph.keys()].some(visit);
}

export function getDependencyDepth(graph: Map<string, string[]>) {
  const memo = new Map<string, number>();
  const depth = (key: string): number => {
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const dependencies = graph.get(key) ?? [];
    const value = dependencies.length ? 1 + Math.max(...dependencies.map(depth)) : 0;
    memo.set(key, value);
    return value;
  };
  return Math.max(0, ...[...graph.keys()].map(depth));
}

export function validateAgentPlan(value: unknown, mode: AgentRunMode): AgentPlan {
  const parsed = agentPlanSchema.safeParse(value);
  if (!parsed.success) throw new AgentPlanValidationError(parsed.error.issues[0]?.message);
  const plan = parsed.data;
  const limits = getAgentModeLimits(mode);
  if (plan.workers.length !== limits.workerCount) {
    throw new AgentPlanValidationError(`Planner must return exactly ${limits.workerCount} Workers.`);
  }
  const keys = new Set(plan.workers.map((worker) => worker.key));
  if (keys.size !== plan.workers.length) throw new AgentPlanValidationError("Worker keys must be unique.");
  for (const worker of plan.workers) {
    if (worker.dependsOn.includes(worker.key)) throw new AgentPlanValidationError("A Worker cannot depend on itself.");
    if (new Set(worker.dependsOn).size !== worker.dependsOn.length) throw new AgentPlanValidationError("Worker dependencies must be unique.");
    if (worker.dependsOn.some((dependency) => !keys.has(dependency))) {
      throw new AgentPlanValidationError("Worker dependency does not exist in the plan.");
    }
  }
  const graph = buildDependencyGraph(plan.workers);
  if (detectDependencyCycle(graph)) throw new AgentPlanValidationError("Worker dependencies must form a DAG.");
  if (getDependencyDepth(graph) > limits.maxDependencyDepth) {
    throw new AgentPlanValidationError("Worker dependency depth exceeds the mode limit.");
  }
  return plan;
}

export function getRunnableWorkers(
  workers: Array<Pick<AgentPlanWorker, "key" | "dependsOn"> & { status: string }>,
) {
  const complete = new Set(workers.filter((worker) => worker.status === "COMPLETE").map((worker) => worker.key));
  return workers.filter((worker) => worker.status === "QUEUED" && worker.dependsOn.every((key) => complete.has(key)));
}
