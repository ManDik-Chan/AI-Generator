import "server-only";

import { Prisma, type AgentRunMode } from "@prisma/client";

import { appendAgentEvent } from "@/features/agents/events";
import { getAgentModeLimits } from "@/features/agents/constants";
import type { AgentPlan } from "@/features/agents/types";
import { createConversationTitle, startOfUtcDay } from "@/features/chat/utils";
import { personaConversationUnavailableMessage } from "@/features/persona/chat";
import { prisma } from "@/lib/database/prisma";

export type AgentCreationErrorCode = "DAILY_CREDITS" | "CONVERSATION_NOT_FOUND" | "PERSONA_NOT_FOUND" | "PERSONA_UNAVAILABLE" | "CONFLICT";

export class AgentCreationError extends Error {
  constructor(
    public readonly code: AgentCreationErrorCode,
    message: string,
    public readonly details?: { limit: number; used: number; required: number },
  ) {
    super(message);
    this.name = "AgentCreationError";
  }
}

export async function createPendingAgentRun(input: {
  userId: string;
  content: string;
  conversationId?: string;
  personaId?: string;
  mode: AgentRunMode;
  dailyCredits: number;
}) {
  const limits = getAgentModeLimits(input.mode);
  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.profile.findUnique({
      where: { id: input.userId },
      select: { role: true },
    });
    if (!profile) throw new AgentCreationError("CONVERSATION_NOT_FOUND", "用户资料不存在。");

    const todayRuns = await transaction.agentRun.findMany({
      where: { userId: input.userId, createdAt: { gte: startOfUtcDay() } },
      select: { mode: true },
    });
    const used = todayRuns.reduce((total, run) => total + getAgentModeLimits(run.mode).creditCost, 0);
    const unlimited = profile.role === "ADMIN";
    if (!unlimited && used + limits.creditCost > input.dailyCredits) {
      throw new AgentCreationError(
        "DAILY_CREDITS",
        "今日 Agent Credits 已用完。",
        { limit: input.dailyCredits, used, required: limits.creditCost },
      );
    }

    let conversationId = input.conversationId;
    if (conversationId) {
      const conversation = await transaction.conversation.findFirst({
        where: { id: conversationId, userId: input.userId },
        select: { id: true, persona: { select: { archivedAt: true } } },
      });
      if (!conversation) throw new AgentCreationError("CONVERSATION_NOT_FOUND", "对话不存在或无权访问。");
      const unavailable = personaConversationUnavailableMessage(conversation.persona?.archivedAt);
      if (unavailable) throw new AgentCreationError("PERSONA_UNAVAILABLE", unavailable);
    } else {
      if (input.personaId) {
        const persona = await transaction.persona.findFirst({
          where: { id: input.personaId, userId: input.userId, archivedAt: null },
          select: { id: true },
        });
        if (!persona) throw new AgentCreationError("PERSONA_NOT_FOUND", "人格不存在、已删除或无权访问。");
      }
      const conversation = await transaction.conversation.create({
        data: {
          userId: input.userId,
          personaId: input.personaId,
          title: createConversationTitle(input.content),
        },
        select: { id: true },
      });
      conversationId = conversation.id;
    }

    const userMessage = await transaction.message.create({
      data: { conversationId, role: "USER", content: input.content, status: "COMPLETE" },
      select: { id: true },
    });
    const assistantMessage = await transaction.message.create({
      data: { conversationId, role: "ASSISTANT", content: "", status: "PENDING" },
      select: { id: true },
    });
    const run = await transaction.agentRun.create({
      data: {
        userId: input.userId,
        conversationId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        mode: input.mode,
        plannedWorkerCount: limits.workerCount,
      },
      select: { id: true, startedAt: true },
    });
    await appendAgentEvent(transaction, {
      userId: input.userId,
      runId: run.id,
      type: "RUN_CREATED",
      summaryText: `${input.mode} run created with ${limits.workerCount} planned Workers.`,
    });
    const conversation = await transaction.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
      select: { updatedAt: true },
    });
    return {
      runId: run.id,
      conversationId,
      conversationUpdatedAt: conversation.updatedAt,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      startedAt: run.startedAt,
      usage: {
        limit: input.dailyCredits,
        used: used + limits.creditCost,
        remaining: unlimited ? input.dailyCredits : Math.max(0, input.dailyCredits - used - limits.creditCost),
        unlimited,
        charged: limits.creditCost,
      },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function persistAgentPlan(input: {
  userId: string;
  runId: string;
  plan: AgentPlan;
  fallback: boolean;
  fallbackErrorCode?: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const run = await transaction.agentRun.findFirst({
      where: { id: input.runId, userId: input.userId, status: "PENDING", phase: "PLANNING" },
      select: { id: true, plannedWorkerCount: true, _count: { select: { workers: true } } },
    });
    if (!run || run._count.workers > 0 || input.plan.workers.length !== run.plannedWorkerCount) return false;

    await transaction.agentWorker.createMany({
      data: input.plan.workers.map((worker, position) => ({
        agentRunId: input.runId,
        userId: input.userId,
        key: worker.key,
        position,
        name: worker.name,
        title: worker.title,
        objective: worker.objective,
        expectedDeliverable: worker.expectedDeliverable,
        priority: worker.priority,
        dependsOnKeys: worker.dependsOn,
        status: "QUEUED",
      })),
    });
    await transaction.agentRun.update({
      where: { id: input.runId },
      data: {
        phase: "DISPATCHING",
        planOverview: input.plan.overview,
        planFallback: input.fallback,
        errorCode: input.fallback ? input.fallbackErrorCode?.slice(0, 100) ?? "PLAN_FALLBACK" : null,
      },
    });
    await appendAgentEvent(transaction, {
      userId: input.userId,
      runId: input.runId,
      type: input.fallback ? "PLAN_FALLBACK" : "PLAN_CREATED",
      summaryText: input.fallback ? "Deterministic safe fallback plan selected." : "Planner task graph validated.",
    });
    await appendAgentEvent(transaction, {
      userId: input.userId,
      runId: input.runId,
      type: "WORKERS_CREATED",
      summaryText: `${input.plan.workers.length} Workers created by the trusted server.`,
    });
    for (const worker of input.plan.workers) {
      await appendAgentEvent(transaction, {
        userId: input.userId,
        runId: input.runId,
        type: "WORKER_QUEUED",
        workerKey: worker.key,
        summaryText: "Worker queued.",
      });
    }
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
