import "server-only";

import type { AgentWorkerStatus } from "@prisma/client";

import { createDurableCancellationController } from "@/features/generation/durable-cancellation";
import { getAgentModeLimits } from "@/features/agents/constants";
import { buildWorkerContextEnvelope } from "@/features/agents/worker-context";
import { collectWorkerDeliverable } from "@/features/agents/worker-output";
import {
  AGENT_WORKER_TERMINAL_STATUSES,
  finishAgentWorker,
  finishQueuedAgentWorker,
  isAgentWorkerRunning,
  reserveWorkerProviderCall,
} from "@/features/agents/worker-state";
import { AiProviderError } from "@/lib/ai/errors";
import type { AgentGenerationConfig, AiProvider } from "@/lib/ai/types";
import { prisma } from "@/lib/database/prisma";

const failedDependencyStatuses = new Set<AgentWorkerStatus>(["BLOCKED", "ERROR", "CANCELLED", "TIMEOUT"]);

export async function runWorkerPool<T>(tasks: Array<() => Promise<T>>, maximum: number) {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  const consume = async () => {
    while (next < tasks.length) {
      const index = next++;
      try { results[index] = { status: "fulfilled", value: await tasks[index]() }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(maximum, tasks.length) }, consume));
  return results;
}

export function getRunnableWorkers<T extends { key: string; status: AgentWorkerStatus; dependsOnKeys: string[] }>(workers: T[]) {
  const complete = new Set(workers.filter((worker) => worker.status === "COMPLETE").map((worker) => worker.key));
  return workers.filter((worker) => worker.status === "QUEUED" && worker.dependsOnKeys.every((key) => complete.has(key)));
}

export function getBlockedWorkers<T extends { key: string; status: AgentWorkerStatus; dependsOnKeys: string[] }>(workers: T[]) {
  const byKey = new Map(workers.map((worker) => [worker.key, worker.status]));
  return workers.filter((worker) => worker.status === "QUEUED" && worker.dependsOnKeys.some((key) => failedDependencyStatuses.has(byKey.get(key) ?? "BLOCKED")));
}

function safeWorkerErrorCode(error: unknown) {
  if (error instanceof AiProviderError) return error.code;
  if (error instanceof Error && error.name === "UnsafeToolOutputError") return "UNSAFE_OUTPUT";
  return "WORKER_ERROR";
}

export async function runAgentWorkerPool(input: {
  userId: string;
  runId: string;
  userProblem: string;
  planOverview: string;
  conversationSummary?: string;
  personaSummary?: string;
  memorySummary?: string;
  provider: AiProvider;
  config: AgentGenerationConfig;
  signal?: AbortSignal;
  didTimeout?(): boolean;
}) {
  const run = await prisma.agentRun.findFirst({
    where: { id: input.runId, userId: input.userId, status: "PENDING", phase: "DISPATCHING" },
    select: { mode: true },
  });
  if (!run) return [];
  await prisma.agentRun.updateMany({
    where: { id: input.runId, userId: input.userId, status: "PENDING", phase: "DISPATCHING" },
    data: { phase: "WORKING" },
  });
  const concurrency = getAgentModeLimits(run.mode).maxConcurrency;

  const runOne = async (workerKey: string) => {
    const workerStartedAt = Date.now();
    const cancellation = await createDurableCancellationController({
      isPending: () => isAgentWorkerRunning(input.userId, input.runId, workerKey),
      taskType: "AGENT_WORKER",
      taskId: `${input.runId}:${workerKey}`,
    });
    const signal = input.signal ? AbortSignal.any([input.signal, cancellation.signal]) : cancellation.signal;
    try {
      const workers = await prisma.agentWorker.findMany({
        where: { agentRunId: input.runId, userId: input.userId },
        select: { key: true, status: true, workSummary: true, finalDeliverable: true },
      });
      const assignment = await prisma.agentWorker.findFirst({
        where: { agentRunId: input.runId, userId: input.userId, key: workerKey, status: "RUNNING" },
        select: { key: true, title: true, objective: true, expectedDeliverable: true, priority: true, dependsOnKeys: true },
      });
      if (!assignment) return;
      const context = buildWorkerContextEnvelope({
        userProblem: input.userProblem,
        planOverview: input.planOverview,
        assignment,
        workers,
        conversationSummary: input.conversationSummary,
        personaSummary: input.personaSummary,
        memorySummary: input.memorySummary,
      });
      const deliverable = await collectWorkerDeliverable({ provider: input.provider, config: input.config, context, signal });
      await finishAgentWorker({ userId: input.userId, runId: input.runId, workerKey, status: "COMPLETE", deliverable });
      console.info("agent_worker_completed", { runId: input.runId, workerKey, status: "COMPLETE", durationMs: Date.now() - workerStartedAt });
    } catch (error) {
      const code = input.didTimeout?.() || error instanceof AiProviderError && error.code === "TIMEOUT" ? "TIMEOUT" : safeWorkerErrorCode(error);
      const status = code === "TIMEOUT" ? "TIMEOUT" : "ERROR";
      const finished = await finishAgentWorker({ userId: input.userId, runId: input.runId, workerKey, status, errorCode: code });
      if (finished) console.warn("agent_worker_finished", { runId: input.runId, workerKey, status, errorCode: code, durationMs: Date.now() - workerStartedAt });
    } finally {
      cancellation.dispose();
    }
  };

  while (true) {
    const workers = await prisma.agentWorker.findMany({
      where: { agentRunId: input.runId, userId: input.userId },
      orderBy: { position: "asc" },
      select: { key: true, status: true, dependsOnKeys: true },
    });
    if (workers.every((worker) => (AGENT_WORKER_TERMINAL_STATUSES as readonly AgentWorkerStatus[]).includes(worker.status))) break;
    if (input.signal?.aborted) {
      if (input.didTimeout?.()) {
        for (const worker of workers.filter((item) => item.status === "QUEUED")) {
          await finishQueuedAgentWorker({ userId: input.userId, runId: input.runId, workerKey: worker.key, status: "TIMEOUT", errorCode: "TIMEOUT" });
        }
      }
      break;
    }
    const blocked = getBlockedWorkers(workers);
    for (const worker of blocked) {
      await finishQueuedAgentWorker({ userId: input.userId, runId: input.runId, workerKey: worker.key, status: "BLOCKED", errorCode: "DEPENDENCY_FAILED" });
    }
    if (blocked.length) continue;

    const runnable = getRunnableWorkers(workers);
    if (!runnable.length) {
      for (const worker of workers.filter((item) => item.status === "QUEUED")) {
        await finishQueuedAgentWorker({ userId: input.userId, runId: input.runId, workerKey: worker.key, status: "BLOCKED", errorCode: "DEPENDENCY_DEADLOCK" });
      }
      break;
    }
    const reserved: string[] = [];
    for (const worker of runnable) {
      if (await reserveWorkerProviderCall(input.userId, input.runId, worker.key)) reserved.push(worker.key);
    }
    if (!reserved.length) continue;
    await runWorkerPool(reserved.map((workerKey) => () => runOne(workerKey)), concurrency);
  }
  return prisma.agentWorker.findMany({
    where: { agentRunId: input.runId, userId: input.userId },
    orderBy: { position: "asc" },
  });
}
