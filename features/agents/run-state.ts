import "server-only";

import { Prisma, type AgentEventType, type AgentWorkerStatus } from "@prisma/client";

import { appendAgentEvents, lockAgentEventStream } from "@/features/agents/events";
import { prisma } from "@/lib/database/prisma";

const terminalStatuses = new Set<AgentWorkerStatus>(["BLOCKED", "COMPLETE", "ERROR", "CANCELLED", "TIMEOUT"]);

export async function isAgentRunPending(userId: string, runId: string) {
  return Boolean(await prisma.agentRun.findFirst({
    where: { id: runId, userId, status: "PENDING" },
    select: { id: true },
  }));
}

export async function getAgentRunTerminalState(userId: string, runId: string) {
  return prisma.agentRun.findFirst({
    where: { id: runId, userId },
    select: { status: true, errorCode: true },
  });
}

export async function persistAgentAssistantPartial(userId: string, runId: string, content: string) {
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, userId, status: "PENDING", phase: "SYNTHESIZING" },
    select: { assistantMessageId: true },
  });
  if (!run) return false;
  const updated = await prisma.message.updateMany({
    where: { id: run.assistantMessageId, status: "PENDING", supersededAt: null },
    data: { content },
  });
  return updated.count === 1;
}

export async function finishAgentRun(input: {
  userId: string;
  runId: string;
  status: "COMPLETE" | "ERROR";
  content: string;
  errorCode?: string;
  timeout?: boolean;
}) {
  return prisma.$transaction(async (transaction) => {
    if (!(await lockAgentEventStream(transaction, input.userId, input.runId))) return false;
    const run = await transaction.agentRun.findFirst({
      where: { id: input.runId, userId: input.userId, status: "PENDING" },
      select: { assistantMessageId: true, planFallback: true, errorCode: true },
    });
    if (!run) return false;

    const unfinished = await transaction.agentWorker.findMany({
      where: { agentRunId: input.runId, userId: input.userId, status: { in: ["QUEUED", "RUNNING"] } },
      select: { key: true, status: true },
    });
    const completedAt = new Date();
    if (input.timeout) {
      await transaction.agentWorker.updateMany({
        where: { agentRunId: input.runId, userId: input.userId, status: { in: ["QUEUED", "RUNNING"] } },
        data: { status: "TIMEOUT", errorCode: "TIMEOUT", completedAt },
      });
    } else {
      await Promise.all([
        transaction.agentWorker.updateMany({
          where: { agentRunId: input.runId, userId: input.userId, status: "RUNNING" },
          data: { status: "ERROR", errorCode: "RUN_ABORTED", completedAt },
        }),
        transaction.agentWorker.updateMany({
          where: { agentRunId: input.runId, userId: input.userId, status: "QUEUED" },
          data: { status: "BLOCKED", errorCode: "RUN_FAILED", completedAt },
        }),
      ]);
    }

    const message = await transaction.message.updateMany({
      where: { id: run.assistantMessageId, status: "PENDING", supersededAt: null },
      data: { content: input.content, status: input.status === "COMPLETE" ? "COMPLETE" : "ERROR" },
    });
    if (!message.count) return false;
    const workers = await transaction.agentWorker.groupBy({
      by: ["status"],
      where: { agentRunId: input.runId, userId: input.userId },
      _count: { _all: true },
    });
    const completedWorkerCount = workers.reduce((total, worker) => total + (terminalStatuses.has(worker.status) ? worker._count._all : 0), 0);
    const successfulWorkerCount = workers.find((worker) => worker.status === "COMPLETE")?._count._all ?? 0;
    const finished = await transaction.agentRun.updateMany({
      where: { id: input.runId, userId: input.userId, status: "PENDING" },
      data: {
        status: input.status,
        phase: "FINISHED",
        completedAt,
        completedWorkerCount,
        successfulWorkerCount,
        errorCode: input.status === "COMPLETE"
          ? run.planFallback ? run.errorCode : null
          : input.errorCode?.slice(0, 100) ?? "AGENT_ERROR",
      },
    });
    if (!finished.count) throw new Error("Agent run terminal state changed concurrently.");
    await appendAgentEvents(transaction, {
      userId: input.userId,
      runId: input.runId,
      events: [
        ...unfinished.map((worker) => {
          const status: AgentWorkerStatus = input.timeout ? "TIMEOUT" : worker.status === "RUNNING" ? "ERROR" : "BLOCKED";
          const errorCode = input.timeout ? "TIMEOUT" : worker.status === "RUNNING" ? "RUN_ABORTED" : "RUN_FAILED";
          const type: AgentEventType = status === "TIMEOUT" ? "WORKER_TIMEOUT" : status === "BLOCKED" ? "WORKER_BLOCKED" : "WORKER_FAILED";
          return { type, workerKey: worker.key, summaryText: `Worker finished with ${errorCode}.` };
        }),
        {
          type: input.status === "COMPLETE" ? "RUN_COMPLETED" : input.timeout ? "RUN_TIMEOUT" : "RUN_FAILED",
          summaryText: input.status === "COMPLETE" ? "Leader answer persisted to the Assistant Message." : `Agent run failed with ${input.errorCode ?? "AGENT_ERROR"}.`,
        },
      ],
    }, { runLocked: true });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelAgentRun(userId: string, runId: string) {
  return prisma.$transaction(async (transaction) => {
    if (!(await lockAgentEventStream(transaction, userId, runId))) return null;
    const run = await transaction.agentRun.findFirst({
      where: { id: runId, userId },
      select: { status: true, assistantMessageId: true },
    });
    if (!run) return null;
    if (run.status !== "PENDING") return run.status;
    const activeWorkers = await transaction.agentWorker.findMany({
      where: { agentRunId: runId, userId, status: { in: ["QUEUED", "RUNNING"] } },
      select: { key: true },
    });
    await transaction.agentWorker.updateMany({
      where: { agentRunId: runId, userId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", errorCode: "CANCELLED", completedAt: new Date() },
    });
    const workerCounts = await transaction.agentWorker.groupBy({
      by: ["status"],
      where: { agentRunId: runId, userId },
      _count: { _all: true },
    });
    const completedWorkerCount = workerCounts.reduce((total, row) => total + (terminalStatuses.has(row.status) ? row._count._all : 0), 0);
    const successfulWorkerCount = workerCounts.find((row) => row.status === "COMPLETE")?._count._all ?? 0;
    await transaction.message.updateMany({
      where: { id: run.assistantMessageId, status: "PENDING", supersededAt: null },
      data: { status: "CANCELLED" },
    });
    await transaction.agentRun.update({
      where: { id: runId },
      data: { status: "CANCELLED", phase: "FINISHED", errorCode: "CANCELLED", completedAt: new Date(), completedWorkerCount, successfulWorkerCount },
    });
    await appendAgentEvents(transaction, {
      userId,
      runId,
      events: [
        ...activeWorkers.map((worker) => ({ type: "WORKER_CANCELLED" as const, workerKey: worker.key, summaryText: "Worker cancelled with its Agent run." })),
        { type: "RUN_CANCELLED", summaryText: "Agent run cancellation confirmed by the server." },
      ],
    }, { runLocked: true });
    return "CANCELLED" as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reconcileStaleAgentRun(userId: string, runId: string, staleBefore: Date) {
  return prisma.$transaction(async (transaction) => {
    if (!(await lockAgentEventStream(transaction, userId, runId))) return null;
    const run = await transaction.agentRun.findFirst({
      where: { id: runId, userId },
      select: { status: true, startedAt: true, assistantMessageId: true },
    });
    if (!run) return null;
    if (run.status !== "PENDING" || run.startedAt > staleBefore) return run.status;

    const completedAt = new Date();
    const activeWorkers = await transaction.agentWorker.findMany({
      where: { agentRunId: runId, userId, status: { in: ["QUEUED", "RUNNING"] } },
      select: { key: true },
    });
    await transaction.agentWorker.updateMany({
      where: { agentRunId: runId, userId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "TIMEOUT", errorCode: "STALE_RUN", completedAt },
    });
    await transaction.message.updateMany({
      where: { id: run.assistantMessageId, status: "PENDING", supersededAt: null },
      data: {
        status: "ERROR",
        content: "Agent 运行超过安全时限，已由服务器收敛到终态。已完成的 Worker 结果仍保留在运行详情中。",
      },
    });
    const workerCounts = await transaction.agentWorker.groupBy({
      by: ["status"],
      where: { agentRunId: runId, userId },
      _count: { _all: true },
    });
    const completedWorkerCount = workerCounts.reduce((total, row) => total + (terminalStatuses.has(row.status) ? row._count._all : 0), 0);
    const successfulWorkerCount = workerCounts.find((row) => row.status === "COMPLETE")?._count._all ?? 0;
    const finished = await transaction.agentRun.updateMany({
      where: { id: runId, userId, status: "PENDING", startedAt: { lte: staleBefore } },
      data: {
        status: "ERROR",
        phase: "FINISHED",
        errorCode: "STALE_RUN",
        completedAt,
        completedWorkerCount,
        successfulWorkerCount,
      },
    });
    if (!finished.count) return "PENDING" as const;
    await appendAgentEvents(transaction, {
      userId,
      runId,
      events: [
        ...activeWorkers.map((worker) => ({ type: "WORKER_TIMEOUT" as const, workerKey: worker.key, summaryText: "Stale Worker reconciled after the Agent run deadline." })),
        { type: "RUN_TIMEOUT", summaryText: "Stale Agent run reconciled after total timeout plus grace." },
      ],
    }, { runLocked: true });
    return "ERROR" as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
