import "server-only";

import { type AgentEventType, Prisma } from "@prisma/client";

import { AGENT_EVENT_LIMIT, getAgentModeLimits } from "@/features/agents/constants";
import { prisma } from "@/lib/database/prisma";

type Transaction = Prisma.TransactionClient;

export async function appendAgentEvent(
  transaction: Transaction,
  input: {
    userId: string;
    runId: string;
    type: AgentEventType;
    workerKey?: string;
    summaryText?: string;
  },
) {
  const latest = await transaction.agentEvent.findFirst({
    where: { agentRunId: input.runId, userId: input.userId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const sequence = (latest?.sequence ?? 0) + 1;
  if (sequence > AGENT_EVENT_LIMIT) throw new Error("Agent event limit exceeded.");
  return transaction.agentEvent.create({
    data: {
      agentRunId: input.runId,
      userId: input.userId,
      sequence,
      type: input.type,
      workerKey: input.workerKey,
      summaryText: input.summaryText?.slice(0, 500),
    },
  });
}

export async function reservePlannerProviderCall(userId: string, runId: string) {
  return prisma.$transaction(async (transaction) => {
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
    });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
