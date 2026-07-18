import "server-only";

import { Prisma, type AgentEventType, type AgentWorkerStatus } from "@prisma/client";

import { appendAgentEvent } from "@/features/agents/events";
import { prisma } from "@/lib/database/prisma";

const terminalStatuses = new Set<AgentWorkerStatus>(["BLOCKED", "COMPLETE", "ERROR", "CANCELLED", "TIMEOUT"]);

export async function isAgentRunPending(userId: string, runId: string) {
  return Boolean(await prisma.agentRun.findFirst({
    where: { id: runId, userId, status: "PENDING" },
    select: { id: true },
  }));
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
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM public.agent_runs WHERE id = ${input.runId}::uuid AND user_id = ${input.userId}::uuid FOR UPDATE`,
    );
    const run = await transaction.agentRun.findFirst({
      where: { id: input.runId, userId: input.userId, status: "PENDING" },
      select: { assistantMessageId: true },
    });
    if (!run) return false;

    const unfinished = await transaction.agentWorker.findMany({
      where: { agentRunId: input.runId, userId: input.userId, status: { in: ["QUEUED", "RUNNING"] } },
      select: { key: true, status: true },
    });
    for (const worker of unfinished) {
      const status: AgentWorkerStatus = input.timeout ? "TIMEOUT" : worker.status === "RUNNING" ? "ERROR" : "BLOCKED";
      const errorCode = input.timeout ? "TIMEOUT" : worker.status === "RUNNING" ? "RUN_ABORTED" : "RUN_FAILED";
      const changed = await transaction.agentWorker.updateMany({
        where: { agentRunId: input.runId, userId: input.userId, key: worker.key, status: worker.status },
        data: { status, errorCode, completedAt: new Date() },
      });
      if (changed.count) {
        const type: AgentEventType = status === "TIMEOUT" ? "WORKER_TIMEOUT" : status === "BLOCKED" ? "WORKER_BLOCKED" : "WORKER_FAILED";
        await appendAgentEvent(transaction, { userId: input.userId, runId: input.runId, type, workerKey: worker.key, summaryText: `Worker finished with ${errorCode}.` });
      }
    }

    const message = await transaction.message.updateMany({
      where: { id: run.assistantMessageId, status: "PENDING", supersededAt: null },
      data: { content: input.content, status: input.status === "COMPLETE" ? "COMPLETE" : "ERROR" },
    });
    if (!message.count) return false;
    const workers = await transaction.agentWorker.findMany({
      where: { agentRunId: input.runId, userId: input.userId },
      select: { status: true },
    });
    const completedWorkerCount = workers.filter((worker) => terminalStatuses.has(worker.status)).length;
    const successfulWorkerCount = workers.filter((worker) => worker.status === "COMPLETE").length;
    const finished = await transaction.agentRun.updateMany({
      where: { id: input.runId, userId: input.userId, status: "PENDING" },
      data: {
        status: input.status,
        phase: "FINISHED",
        completedAt: new Date(),
        completedWorkerCount,
        successfulWorkerCount,
        errorCode: input.status === "COMPLETE" ? null : input.errorCode?.slice(0, 100) ?? "AGENT_ERROR",
      },
    });
    if (!finished.count) throw new Error("Agent run terminal state changed concurrently.");
    await appendAgentEvent(transaction, {
      userId: input.userId,
      runId: input.runId,
      type: input.status === "COMPLETE" ? "RUN_COMPLETED" : input.timeout ? "RUN_TIMEOUT" : "RUN_FAILED",
      summaryText: input.status === "COMPLETE" ? "Leader answer persisted to the Assistant Message." : `Agent run failed with ${input.errorCode ?? "AGENT_ERROR"}.`,
    });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelAgentRun(userId: string, runId: string) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM public.agent_runs WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`,
    );
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
    for (const worker of activeWorkers) {
      await appendAgentEvent(transaction, { userId, runId, type: "WORKER_CANCELLED", workerKey: worker.key, summaryText: "Worker cancelled with its Agent run." });
    }
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
    await appendAgentEvent(transaction, { userId, runId, type: "RUN_CANCELLED", summaryText: "Agent run cancellation confirmed by the server." });
    return "CANCELLED" as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
