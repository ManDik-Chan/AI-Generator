import { Prisma, type ToolRunStatus, type ToolType } from "@prisma/client";

import { canBypassToolDailyLimit } from "@/features/tools/access";
import { startOfUtcDay } from "@/features/tools/utils";
import { prisma } from "@/lib/database/prisma";

export class DailyToolLimitError extends Error {
  constructor(public readonly limit: number, public readonly used: number) {
    super("Daily tool limit reached");
    this.name = "DailyToolLimitError";
  }
}

export async function createPendingToolRun(input: {
  userId: string;
  tool: ToolType;
  title: string | null;
  inputText: string | null;
  options: Prisma.InputJsonValue;
  retainContent: boolean;
  dailyLimit: number;
}) {
  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.profile.findUnique({ where: { id: input.userId }, select: { role: true } });
    const used = await transaction.toolRun.count({ where: { userId: input.userId, createdAt: { gte: startOfUtcDay() } } });
    if (!canBypassToolDailyLimit(profile?.role ?? "USER") && used >= input.dailyLimit) {
      throw new DailyToolLimitError(input.dailyLimit, used);
    }
    const run = await transaction.toolRun.create({
      data: {
        userId: input.userId,
        type: input.tool,
        title: input.retainContent ? input.title : null,
        inputText: input.retainContent ? input.inputText : null,
        options: input.options,
        retainContent: input.retainContent,
      },
      select: { id: true },
    });
    return { runId: run.id, limit: input.dailyLimit, used: used + 1, remaining: canBypassToolDailyLimit(profile?.role ?? "USER") ? input.dailyLimit : Math.max(0, input.dailyLimit - used - 1) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createPendingVisionToolRun(input: Omit<Parameters<typeof createPendingToolRun>[0], "tool">) {
  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.profile.findUnique({ where: { id: input.userId }, select: { role: true } });
    const used = await transaction.toolRun.count({ where: { userId: input.userId, type: "IMAGE_ANALYZE", createdAt: { gte: startOfUtcDay() } } });
    if (!canBypassToolDailyLimit(profile?.role ?? "USER") && used >= input.dailyLimit) throw new DailyToolLimitError(input.dailyLimit, used);
    const run = await transaction.toolRun.create({ data: { userId: input.userId, type: "IMAGE_ANALYZE", title: input.retainContent ? input.title : null, inputText: input.retainContent ? input.inputText : null, options: input.options, retainContent: input.retainContent }, select: { id: true } });
    return { runId: run.id, limit: input.dailyLimit, used: used + 1, remaining: canBypassToolDailyLimit(profile?.role ?? "USER") ? input.dailyLimit : Math.max(0, input.dailyLimit - used - 1) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getVisionUsage(userId: string, dailyLimit: number) {
  const [profile, used] = await Promise.all([
    prisma.profile.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.toolRun.count({ where: { userId, type: "IMAGE_ANALYZE", createdAt: { gte: startOfUtcDay() } } }),
  ]);
  return { limit: dailyLimit, used, remaining: canBypassToolDailyLimit(profile?.role ?? "USER") ? dailyLimit : Math.max(0, dailyLimit - used) };
}

export async function finishToolRun(userId: string, runId: string, status: Exclude<ToolRunStatus, "PENDING">, data: { outputText?: string; errorCode?: string } = {}) {
  return prisma.toolRun.updateMany({
    where: { id: runId, userId, status: "PENDING" },
    data: {
      status,
      outputText: status === "COMPLETE" ? data.outputText : undefined,
      errorCode: data.errorCode?.slice(0, 100),
    },
  });
}

export async function cancelToolRun(userId: string, runId: string) {
  return finishToolRun(userId, runId, "CANCELLED", { errorCode: "CANCELLED" });
}

export async function recoverStaleToolRuns(userId: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - 15 * 60_000);
  return prisma.toolRun.updateMany({
    where: { userId, status: "PENDING", updatedAt: { lt: cutoff } },
    data: { status: "ERROR", errorCode: "TIMEOUT" },
  });
}
