import "server-only";

import { type AgentEventType, type AgentWorkerStatus, Prisma } from "@prisma/client";

import { appendAgentEvent } from "@/features/agents/events";
import { getAgentModeLimits } from "@/features/agents/constants";
import { prisma } from "@/lib/database/prisma";

export const AGENT_WORKER_TERMINAL_STATUSES = ["BLOCKED", "COMPLETE", "ERROR", "CANCELLED", "TIMEOUT"] as const;

export function isAgentWorkerTerminal(status: AgentWorkerStatus) {
  return (AGENT_WORKER_TERMINAL_STATUSES as readonly AgentWorkerStatus[]).includes(status);
}

export async function isAgentWorkerRunning(userId: string, runId: string, workerKey: string) {
  return Boolean(await prisma.agentWorker.findFirst({
    where: { agentRunId: runId, userId, key: workerKey, status: "RUNNING", agentRun: { status: "PENDING" } },
    select: { id: true },
  }));
}

export async function reserveWorkerProviderCall(userId: string, runId: string, workerKey: string) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM public.agent_runs WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`,
    );
    const run = await transaction.agentRun.findFirst({
      where: { id: runId, userId, status: "PENDING", phase: "WORKING" },
      select: { mode: true, providerCallCount: true },
    });
    const worker = await transaction.agentWorker.findFirst({
      where: { agentRunId: runId, userId, key: workerKey, status: "QUEUED", providerCallCount: 0 },
      select: { id: true, key: true, dependsOnKeys: true },
    });
    if (!run || !worker || run.providerCallCount >= getAgentModeLimits(run.mode).maxProviderCalls) return false;
    const dependencies = worker.dependsOnKeys.length
      ? await transaction.agentWorker.findMany({
        where: { agentRunId: runId, userId, key: { in: worker.dependsOnKeys } },
        select: { key: true, status: true },
      })
      : [];
    if (dependencies.length !== worker.dependsOnKeys.length || dependencies.some((dependency) => dependency.status !== "COMPLETE")) return false;
    const started = await transaction.agentWorker.updateMany({
      where: { id: worker.id, agentRunId: runId, userId, status: "QUEUED", providerCallCount: 0 },
      data: { status: "RUNNING", providerCallCount: 1, startedAt: new Date() },
    });
    if (!started.count) return false;
    const counted = await transaction.agentRun.updateMany({
      where: { id: runId, userId, status: "PENDING", phase: "WORKING", providerCallCount: run.providerCallCount },
      data: { providerCallCount: { increment: 1 } },
    });
    if (!counted.count) throw new Error("Agent Provider call budget changed concurrently.");
    await appendAgentEvent(transaction, { userId, runId, type: "WORKER_STARTED", workerKey, summaryText: "Worker started one Provider call." });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function finishAgentWorker(input: {
  userId: string;
  runId: string;
  workerKey: string;
  status: "COMPLETE" | "ERROR" | "TIMEOUT";
  deliverable?: {
    workSummary: string;
    findings: string[];
    assumptions: string[];
    risks: string[];
    recommendations: string[];
    finalDeliverable: string;
    structured: boolean;
  };
  errorCode?: string;
}) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM public.agent_runs WHERE id = ${input.runId}::uuid AND user_id = ${input.userId}::uuid FOR UPDATE`,
    );
    const completed = await transaction.agentWorker.updateMany({
      where: { agentRunId: input.runId, userId: input.userId, key: input.workerKey, status: "RUNNING", agentRun: { status: "PENDING" } },
      data: {
        status: input.status,
        workSummary: input.deliverable?.workSummary,
        findings: input.deliverable?.findings ?? [],
        assumptions: input.deliverable?.assumptions ?? [],
        risks: input.deliverable?.risks ?? [],
        recommendations: input.deliverable?.recommendations ?? [],
        finalDeliverable: input.deliverable?.finalDeliverable,
        structured: input.deliverable?.structured ?? false,
        errorCode: input.errorCode?.slice(0, 100),
        completedAt: new Date(),
      },
    });
    if (!completed.count) return false;
    await transaction.agentRun.updateMany({
      where: { id: input.runId, userId: input.userId, status: "PENDING" },
      data: {
        completedWorkerCount: { increment: 1 },
        ...(input.status === "COMPLETE" ? { successfulWorkerCount: { increment: 1 } } : {}),
      },
    });
    const eventType: AgentEventType = input.status === "COMPLETE" ? "WORKER_COMPLETED" : input.status === "TIMEOUT" ? "WORKER_TIMEOUT" : "WORKER_FAILED";
    await appendAgentEvent(transaction, {
      userId: input.userId,
      runId: input.runId,
      type: eventType,
      workerKey: input.workerKey,
      summaryText: input.status === "COMPLETE" ? "Worker completed with a guarded deliverable." : `Worker finished with ${input.errorCode ?? input.status}.`,
    });
    return true;
  });
}

export async function finishQueuedAgentWorker(input: {
  userId: string;
  runId: string;
  workerKey: string;
  status: "BLOCKED" | "CANCELLED" | "TIMEOUT";
  errorCode: string;
}) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM public.agent_runs WHERE id = ${input.runId}::uuid AND user_id = ${input.userId}::uuid FOR UPDATE`,
    );
    const finished = await transaction.agentWorker.updateMany({
      where: { agentRunId: input.runId, userId: input.userId, key: input.workerKey, status: "QUEUED", agentRun: { status: "PENDING" } },
      data: { status: input.status, errorCode: input.errorCode.slice(0, 100), completedAt: new Date() },
    });
    if (!finished.count) return false;
    await transaction.agentRun.updateMany({
      where: { id: input.runId, userId: input.userId, status: "PENDING" },
      data: { completedWorkerCount: { increment: 1 } },
    });
    const eventType: AgentEventType = input.status === "BLOCKED" ? "WORKER_BLOCKED" : input.status === "TIMEOUT" ? "WORKER_TIMEOUT" : "WORKER_CANCELLED";
    await appendAgentEvent(transaction, {
      userId: input.userId,
      runId: input.runId,
      type: eventType,
      workerKey: input.workerKey,
      summaryText: `Worker finished with ${input.errorCode}.`,
    });
    return true;
  });
}

export async function cancelAgentWorker(userId: string, runId: string, workerKey: string) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM public.agent_runs WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`,
    );
    const worker = await transaction.agentWorker.findFirst({
      where: { agentRunId: runId, userId, key: workerKey },
      select: { status: true },
    });
    if (!worker) return null;
    if (worker.status !== "QUEUED" && worker.status !== "RUNNING") return worker.status;
    const cancelled = await transaction.agentWorker.updateMany({
      where: { agentRunId: runId, userId, key: workerKey, status: { in: ["QUEUED", "RUNNING"] }, agentRun: { status: "PENDING" } },
      data: { status: "CANCELLED", errorCode: "CANCELLED", completedAt: new Date() },
    });
    if (!cancelled.count) {
      return (await transaction.agentWorker.findFirst({ where: { agentRunId: runId, userId, key: workerKey }, select: { status: true } }))?.status ?? null;
    }
    await transaction.agentRun.updateMany({
      where: { id: runId, userId, status: "PENDING" },
      data: { completedWorkerCount: { increment: 1 } },
    });
    await appendAgentEvent(transaction, { userId, runId, type: "WORKER_CANCELLED", workerKey, summaryText: "Worker cancellation confirmed by the server." });
    return "CANCELLED" as const;
  });
}

export function countProviderCalls(run: { providerCallCount: number }) {
  return run.providerCallCount;
}

export function shouldStartSynthesis(workers: Array<{ status: AgentWorkerStatus }>) {
  return workers.filter((worker) => worker.status === "COMPLETE").length >= 2
    && workers.every((worker) => isAgentWorkerTerminal(worker.status));
}
