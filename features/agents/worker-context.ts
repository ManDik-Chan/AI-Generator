import "server-only";

import type { AgentWorker, AgentPriority } from "@prisma/client";

import type { WorkerContextEnvelope } from "@/features/agents/worker-contracts";

type Assignment = Pick<AgentWorker, "key" | "title" | "objective" | "expectedDeliverable" | "priority" | "dependsOnKeys">;
type Dependency = Pick<AgentWorker, "key" | "status" | "workSummary" | "finalDeliverable">;

function compact(value: string | null | undefined, maximum: number) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maximum) : undefined;
}

export function buildWorkerContextEnvelope(input: {
  userProblem: string;
  planOverview: string;
  assignment: Assignment;
  workers: Dependency[];
  conversationSummary?: string;
  personaSummary?: string;
  memorySummary?: string;
}): WorkerContextEnvelope {
  const dependencies = new Set(input.assignment.dependsOnKeys);
  const dependencyDeliverables = input.workers
    .filter((worker) => dependencies.has(worker.key) && worker.status === "COMPLETE")
    .map((worker) => ({
      workerKey: worker.key,
      summary: compact(worker.workSummary, 1_200) ?? "该依赖 Worker 未提供工作摘要。",
      result: compact(worker.finalDeliverable, 12_000) ?? "该依赖 Worker 未提供最终交付物。",
    }));
  return {
    userProblem: input.userProblem.slice(0, 8_000),
    planOverview: input.planOverview.slice(0, 2_000),
    assignment: {
      key: input.assignment.key,
      title: input.assignment.title,
      objective: input.assignment.objective,
      expectedDeliverable: input.assignment.expectedDeliverable,
      priority: input.assignment.priority as AgentPriority,
    },
    dependencyDeliverables,
    conversationSummary: compact(input.conversationSummary, 4_000),
    personaSummary: compact(input.personaSummary, 1_200),
    memorySummary: compact(input.memorySummary, 2_400),
  };
}
