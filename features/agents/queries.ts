import "server-only";

import { getAgentModeLimits } from "@/features/agents/constants";
import { startOfUtcDay } from "@/features/chat/utils";
import { prisma } from "@/lib/database/prisma";

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
      select: {
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
          orderBy: { position: "asc" },
          select: {
            key: true, position: true, name: true, title: true, objective: true, expectedDeliverable: true,
            priority: true, status: true, dependsOnKeys: true, workSummary: true, findings: true,
            assumptions: true, risks: true, recommendations: true, finalDeliverable: true, structured: true,
            errorCode: true, startedAt: true, completedAt: true, createdAt: true, updatedAt: true,
          },
        },
        events: {
          orderBy: { sequence: "asc" },
          select: { sequence: true, type: true, workerKey: true, summaryText: true, createdAt: true },
        },
      },
    }),
    getAgentUsage(userId, dailyLimit),
  ]);
  return run ? { run, usage } : null;
}
