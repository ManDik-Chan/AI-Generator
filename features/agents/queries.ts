import "server-only";

import { Prisma } from "@prisma/client";

import { getAgentModeLimits } from "@/features/agents/constants";
import { startOfUtcDay } from "@/features/chat/utils";
import { prisma } from "@/lib/database/prisma";
import type { AgentModeView, AgentRunListItem, AgentRunStatusView, AgentRunView } from "@/features/agents/client-types";

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
  };
}

export async function getAgentUsage(userId: string, dailyLimit: number) {
  const [profile, runs] = await Promise.all([
    prisma.profile.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.agentRun.findMany({ where: { userId, createdAt: { gte: startOfUtcDay() } }, select: { mode: true } }),
  ]);
  const used = runs.reduce((total, run) => total + getAgentModeLimits(run.mode).creditCost, 0);
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
      successfulWorkerCount: true, providerCallCount: true, errorCode: true, startedAt: true, completedAt: true,
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
    errorCode: run.errorCode,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  }));
}
