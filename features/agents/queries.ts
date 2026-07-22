import "server-only";

import { Prisma } from "@prisma/client";

import { startOfUtcDay } from "@/features/chat/utils";
import { AGENT_USAGE_CAPABILITIES, usageUnits } from "@/features/usage/ledger";
import { prisma } from "@/lib/database/prisma";
import type { AgentModeView, AgentRunListItem, AgentRunStatusSnapshot, AgentRunStatusView, AgentRunTerminalSnapshot, AgentRunView } from "@/features/agents/client-types";

const agentRunStatusSelect = {
  id: true,
  conversationId: true,
  userMessageId: true,
  assistantMessageId: true,
  mode: true,
  status: true,
  phase: true,
  planOverview: true,
  planFallback: true,
  plannedWorkerCount: true,
  completedWorkerCount: true,
  successfulWorkerCount: true,
  providerCallCount: true,
  errorCode: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  assistantMessage: { select: { status: true, createdAt: true } },
  workers: {
    orderBy: { position: "asc" as const },
    select: {
      key: true,
      position: true,
      name: true,
      title: true,
      objective: true,
      expectedDeliverable: true,
      priority: true,
      status: true,
      dependsOnKeys: true,
      errorCode: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.AgentRunSelect;

type SelectedAgentRunStatus = Prisma.AgentRunGetPayload<{ select: typeof agentRunStatusSelect }>;

function serializeAgentRunStatus(run: SelectedAgentRunStatus): AgentRunStatusSnapshot {
  return {
    ...run,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    assistantMessage: { ...run.assistantMessage, createdAt: run.assistantMessage.createdAt.toISOString() },
    workers: run.workers.map((worker) => ({
      ...worker,
      startedAt: worker.startedAt?.toISOString() ?? null,
      completedAt: worker.completedAt?.toISOString() ?? null,
      createdAt: worker.createdAt.toISOString(),
      updatedAt: worker.updatedAt.toISOString(),
    })),
  };
}

const agentRunTerminalSelect = {
  id: true,
  conversationId: true,
  userMessageId: true,
  assistantMessageId: true,
  mode: true,
  status: true,
  phase: true,
  planOverview: true,
  planFallback: true,
  plannedWorkerCount: true,
  completedWorkerCount: true,
  successfulWorkerCount: true,
  providerCallCount: true,
  errorCode: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  assistantMessage: { select: { content: true, status: true, createdAt: true } },
  workers: {
    orderBy: { position: "asc" as const },
    select: {
      key: true, position: true, name: true, title: true, objective: true, expectedDeliverable: true,
      priority: true, status: true, dependsOnKeys: true, workSummary: true, findings: true,
      assumptions: true, risks: true, recommendations: true, finalDeliverable: true, structured: true,
      errorCode: true, startedAt: true, completedAt: true, createdAt: true, updatedAt: true,
    },
  },
} satisfies Prisma.AgentRunSelect;

type SelectedAgentRunTerminal = Prisma.AgentRunGetPayload<{ select: typeof agentRunTerminalSelect }>;

function serializeAgentRunTerminal(run: SelectedAgentRunTerminal): AgentRunTerminalSnapshot {
  return {
    ...run,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    assistantMessage: { ...run.assistantMessage, createdAt: run.assistantMessage.createdAt.toISOString() },
    workers: run.workers.map((worker) => ({
      ...worker,
      startedAt: worker.startedAt?.toISOString() ?? null,
      completedAt: worker.completedAt?.toISOString() ?? null,
      createdAt: worker.createdAt.toISOString(),
      updatedAt: worker.updatedAt.toISOString(),
    })),
  };
}

const agentRunSnapshotSelect = {
  id: true,
  conversationId: true,
  userMessageId: true,
  assistantMessageId: true,
  mode: true,
  status: true,
  phase: true,
  planOverview: true,
  planFallback: true,
  plannedWorkerCount: true,
  completedWorkerCount: true,
  successfulWorkerCount: true,
  providerCallCount: true,
  errorCode: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  conversation: { select: { title: true } },
  userMessage: { select: { content: true } },
  assistantMessage: { select: { content: true, status: true, createdAt: true } },
  workers: {
    orderBy: { position: "asc" as const },
    select: {
      key: true, position: true, name: true, title: true, objective: true, expectedDeliverable: true,
      priority: true, status: true, dependsOnKeys: true, workSummary: true, findings: true,
      assumptions: true, risks: true, recommendations: true, finalDeliverable: true, structured: true,
      errorCode: true, startedAt: true, completedAt: true, createdAt: true, updatedAt: true,
    },
  },
  events: {
    orderBy: { sequence: "asc" as const },
    select: { sequence: true, type: true, workerKey: true, summaryText: true, createdAt: true },
  },
} satisfies Prisma.AgentRunSelect;

type SelectedAgentRun = Prisma.AgentRunGetPayload<{ select: typeof agentRunSnapshotSelect }>;

function serializeAgentRun(run: SelectedAgentRun, usage?: AgentRunView["usage"]): AgentRunView {
  return {
    id: run.id,
    conversationId: run.conversationId,
    conversationTitle: run.conversation.title,
    userMessageId: run.userMessageId,
    userProblem: run.userMessage.content,
    assistantMessageId: run.assistantMessageId,
    mode: run.mode,
    status: run.status,
    phase: run.phase,
    planOverview: run.planOverview,
    planFallback: run.planFallback,
    plannedWorkerCount: run.plannedWorkerCount,
    completedWorkerCount: run.completedWorkerCount,
    successfulWorkerCount: run.successfulWorkerCount,
    providerCallCount: run.providerCallCount,
    errorCode: run.errorCode,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    assistantMessage: { ...run.assistantMessage, createdAt: run.assistantMessage.createdAt.toISOString() },
    workers: run.workers.map((worker) => ({
      ...worker,
      startedAt: worker.startedAt?.toISOString() ?? null,
      completedAt: worker.completedAt?.toISOString() ?? null,
      createdAt: worker.createdAt.toISOString(),
      updatedAt: worker.updatedAt.toISOString(),
    })),
    events: run.events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    usage,
    detailLevel: "FULL",
  };
}

export async function getOwnedAgentRunStatus(userId: string, runId: string) {
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, userId },
    select: agentRunStatusSelect,
  });
  return run ? serializeAgentRunStatus(run) : null;
}

export async function getOwnedAgentRunTerminal(userId: string, runId: string) {
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, userId, status: { not: "PENDING" } },
    select: agentRunTerminalSelect,
  });
  return run ? serializeAgentRunTerminal(run) : null;
}

export async function getAgentUsage(userId: string, dailyLimit: number) {
  const [profile, aggregate] = await Promise.all([
    prisma.profile.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.usageLedger.aggregate({ where: { userId, capability: { in: [...AGENT_USAGE_CAPABILITIES] }, createdAt: { gte: startOfUtcDay() } }, _sum: { units: true } }),
  ]);
  const used = usageUnits(aggregate);
  const unlimited = profile?.role === "ADMIN";
  return { limit: dailyLimit, used, remaining: unlimited ? dailyLimit : Math.max(0, dailyLimit - used), unlimited };
}

export async function getOwnedAgentRunSnapshot(userId: string, runId: string, dailyLimit: number) {
  const [run, usage] = await Promise.all([
    prisma.agentRun.findFirst({
      where: { id: runId, userId },
      select: agentRunSnapshotSelect,
    }),
    getAgentUsage(userId, dailyLimit),
  ]);
  if (!run) return null;
  return serializeAgentRun(run, usage);
}

export async function getConversationAgentRuns(userId: string, conversationId: string) {
  const runs = await prisma.agentRun.findMany({
    where: { userId, conversationId },
    orderBy: { createdAt: "asc" },
    select: agentRunSnapshotSelect,
  });
  return runs.map((run) => serializeAgentRun(run));
}

export async function getAgentRunList(input: {
  userId: string;
  mode?: AgentModeView;
  status?: AgentRunStatusView;
  query?: string;
}): Promise<AgentRunListItem[]> {
  const runs = await prisma.agentRun.findMany({
    where: {
      userId: input.userId,
      ...(input.mode ? { mode: input.mode } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.query ? { userMessage: { content: { contains: input.query.slice(0, 200), mode: "insensitive" } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, conversationId: true, mode: true, status: true, phase: true, plannedWorkerCount: true,
      successfulWorkerCount: true, providerCallCount: true, planFallback: true, errorCode: true, startedAt: true, completedAt: true,
      userMessage: { select: { content: true } },
    },
  });
  return runs.map((run) => ({
    id: run.id,
    conversationId: run.conversationId,
    userProblem: run.userMessage.content,
    mode: run.mode,
    status: run.status,
    phase: run.phase,
    plannedWorkerCount: run.plannedWorkerCount,
    successfulWorkerCount: run.successfulWorkerCount,
    providerCallCount: run.providerCallCount,
    planFallback: run.planFallback,
    errorCode: run.errorCode,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  }));
}
