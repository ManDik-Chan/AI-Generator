import "server-only";

import { type AgentEventType, Prisma } from "@prisma/client";

import { AGENT_EVENT_LIMIT, getAgentModeLimits } from "@/features/agents/constants";
import { prisma } from "@/lib/database/prisma";

type Transaction = Prisma.TransactionClient;

export interface AgentEventInput {
  type: AgentEventType;
  workerKey?: string;
  summaryText?: string;
}

export async function lockAgentEventStream(transaction: Transaction, userId: string, runId: string) {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM public.agent_runs WHERE id = ${runId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`,
  );
  return rows.length > 0;
}

export async function appendAgentEvents(
  transaction: Transaction,
  input: {
    userId: string;
    runId: string;
    events: AgentEventInput[];
  },
  options: { runLocked?: boolean } = {},
) {
  if (!input.events.length) return 0;
  if (!options.runLocked && !(await lockAgentEventStream(transaction, input.userId, input.runId))) {
    throw new Error("Agent run not found while appending events.");
  }
  const latest = await transaction.agentEvent.findFirst({
    where: { agentRunId: input.runId, userId: input.userId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const firstSequence = (latest?.sequence ?? 0) + 1;
  if (firstSequence + input.events.length - 1 > AGENT_EVENT_LIMIT) throw new Error("Agent event limit exceeded.");
  const created = await transaction.agentEvent.createMany({
    data: input.events.map((event, index) => ({
      agentRunId: input.runId,
      userId: input.userId,
      sequence: firstSequence + index,
      type: event.type,
      workerKey: event.workerKey,
      summaryText: event.summaryText?.slice(0, 500),
    })),
  });
  return created.count;
}

export async function appendAgentEvent(
  transaction: Transaction,
  input: {
    userId: string;
    runId: string;
    type: AgentEventType;
    workerKey?: string;
    summaryText?: string;
  },
  options: { runLocked?: boolean } = {},
) {
  return appendAgentEvents(transaction, {
    userId: input.userId,
    runId: input.runId,
    events: [{ type: input.type, workerKey: input.workerKey, summaryText: input.summaryText }],
  }, options);
}

export async function reservePlannerProviderCall(userId: string, runId: string) {
  return prisma.$transaction(async (transaction) => {
    if (!(await lockAgentEventStream(transaction, userId, runId))) return false;
    const run = await transaction.agentRun.findFirst({
      where: { id: runId, userId, status: "PENDING", phase: "PLANNING" },
      select: { id: true, mode: true, providerCallCount: true },
    });
    if (!run) return false;
    const existing = await transaction.agentEvent.findFirst({
      where: { agentRunId: runId, userId, type: "PLANNING_STARTED" },
      select: { id: true },
    });
    if (existing || run.providerCallCount >= getAgentModeLimits(run.mode).maxProviderCalls) return false;
    const reserved = await transaction.agentRun.updateMany({
      where: { id: runId, userId, status: "PENDING", phase: "PLANNING", providerCallCount: run.providerCallCount },
      data: { providerCallCount: { increment: 1 } },
    });
    if (!reserved.count) return false;
    await appendAgentEvent(transaction, {
      userId,
      runId,
      type: "PLANNING_STARTED",
      summaryText: "Planner started with one reserved Provider call.",
    }, { runLocked: true });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reserveLeaderProviderCall(userId: string, runId: string) {
  return prisma.$transaction(async (transaction) => {
    if (!(await lockAgentEventStream(transaction, userId, runId))) return false;
    const run = await transaction.agentRun.findFirst({
      where: { id: runId, userId, status: "PENDING", phase: "WORKING" },
      select: { mode: true, providerCallCount: true },
    });
    if (!run || run.providerCallCount >= getAgentModeLimits(run.mode).maxProviderCalls) return false;
    const workers = await transaction.agentWorker.findMany({
      where: { agentRunId: runId, userId },
      select: { status: true },
    });
    const terminal = new Set(["BLOCKED", "COMPLETE", "ERROR", "CANCELLED", "TIMEOUT"]);
    if (workers.filter((worker) => worker.status === "COMPLETE").length < 2 || workers.some((worker) => !terminal.has(worker.status))) return false;
    const reserved = await transaction.agentRun.updateMany({
      where: { id: runId, userId, status: "PENDING", phase: "WORKING", providerCallCount: run.providerCallCount },
      data: { phase: "SYNTHESIZING", providerCallCount: { increment: 1 } },
    });
    if (!reserved.count) return false;
    await appendAgentEvent(transaction, {
      userId,
      runId,
      type: "SYNTHESIS_STARTED",
      summaryText: "Leader started with one reserved Provider call.",
    }, { runLocked: true });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
