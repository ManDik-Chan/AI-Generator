import { Prisma, type ToolRunStatus, type ToolType } from "@prisma/client";

import { canBypassToolDailyLimit } from "@/features/tools/access";
import { startOfUtcDay } from "@/features/tools/utils";
import { prisma } from "@/lib/database/prisma";
import { BRAINSTORM_WORKERS } from "@/features/tools/brainstorm/constants";

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
    const unlimited = canBypassToolDailyLimit(profile?.role ?? "USER");
    if (!unlimited && used >= input.dailyLimit) throw new DailyToolLimitError(input.dailyLimit, used);
    const run = await transaction.toolRun.create({ data: { userId: input.userId, type: "IMAGE_ANALYZE", title: input.retainContent ? input.title : null, inputText: input.retainContent ? input.inputText : null, options: input.options, retainContent: input.retainContent }, select: { id: true } });
    return { runId: run.id, limit: input.dailyLimit, used: used + 1, remaining: unlimited ? input.dailyLimit : Math.max(0, input.dailyLimit - used - 1), unlimited };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getVisionUsage(userId: string, dailyLimit: number) {
  const [profile, used] = await Promise.all([
    prisma.profile.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.toolRun.count({ where: { userId, type: "IMAGE_ANALYZE", createdAt: { gte: startOfUtcDay() } } }),
  ]);
  const unlimited = canBypassToolDailyLimit(profile?.role ?? "USER");
  return { limit: dailyLimit, used, remaining: unlimited ? dailyLimit : Math.max(0, dailyLimit - used), unlimited };
}

export async function createPendingImageGenerationToolRun(input: {
  userId: string;
  title: string;
  inputText: string;
  options: Prisma.InputJsonValue;
  dailyLimit: number;
}) {
  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.profile.findUnique({
      where: { id: input.userId },
      select: { role: true },
    });
    const used = await transaction.toolRun.count({
      where: {
        userId: input.userId,
        type: "IMAGE_GENERATE",
        createdAt: { gte: startOfUtcDay() },
      },
    });
    const unlimited = canBypassToolDailyLimit(profile?.role ?? "USER");
    if (!unlimited && used >= input.dailyLimit) {
      throw new DailyToolLimitError(input.dailyLimit, used);
    }
    const run = await transaction.toolRun.create({
      data: {
        userId: input.userId,
        type: "IMAGE_GENERATE",
        title: input.title,
        inputText: input.inputText,
        options: input.options,
        retainContent: true,
      },
      select: { id: true },
    });
    return {
      runId: run.id,
      limit: input.dailyLimit,
      used: used + 1,
      remaining: unlimited
        ? input.dailyLimit
        : Math.max(0, input.dailyLimit - used - 1),
      unlimited,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getImageGenerationUsage(
  userId: string,
  dailyLimit: number,
) {
  const [profile, used] = await Promise.all([
    prisma.profile.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.toolRun.count({
      where: {
        userId,
        type: "IMAGE_GENERATE",
        createdAt: { gte: startOfUtcDay() },
      },
    }),
  ]);
  const unlimited = canBypassToolDailyLimit(profile?.role ?? "USER");
  return {
    limit: dailyLimit,
    used,
    remaining: unlimited ? dailyLimit : Math.max(0, dailyLimit - used),
    unlimited,
  };
}

export async function createPendingBrainstormToolRun(input: {
  userId: string;
  prompt: string;
  title: string;
  retainContent: boolean;
  dailyLimit: number;
  options: Prisma.InputJsonValue;
}) {
  await cleanupExpiredToolRunRecovery().catch(() => undefined);
  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.profile.findUnique({ where: { id: input.userId }, select: { role: true } });
    const used = await transaction.toolRun.count({ where: { userId: input.userId, type: "BRAINSTORM", createdAt: { gte: startOfUtcDay() } } });
    const unlimited = canBypassToolDailyLimit(profile?.role ?? "USER");
    if (!unlimited && used >= input.dailyLimit) throw new DailyToolLimitError(input.dailyLimit, used);
    const recoveryExpiresAt = input.retainContent ? null : new Date(Date.now() + RECOVERY_TTL_MS);
    const run = await transaction.toolRun.create({
      data: {
        userId: input.userId,
        type: "BRAINSTORM",
        title: input.retainContent ? input.title : null,
        inputText: input.prompt,
        options: input.options,
        retainContent: input.retainContent,
        recoveryExpiresAt,
        brainstormWorkers: {
          create: BRAINSTORM_WORKERS.map((worker) => ({ userId: input.userId, role: worker.role, position: worker.position })),
        },
      },
      select: { id: true },
    });
    return { runId: run.id, limit: input.dailyLimit, used: used + 1, remaining: unlimited ? input.dailyLimit : Math.max(0, input.dailyLimit - used - 1), unlimited };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getBrainstormUsage(userId: string, dailyLimit: number) {
  const [profile, used] = await Promise.all([
    prisma.profile.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.toolRun.count({ where: { userId, type: "BRAINSTORM", createdAt: { gte: startOfUtcDay() } } }),
  ]);
  const unlimited = canBypassToolDailyLimit(profile?.role ?? "USER");
  return { limit: dailyLimit, used, remaining: unlimited ? dailyLimit : Math.max(0, dailyLimit - used), unlimited };
}

export async function finishToolRun(userId: string, runId: string, status: Exclude<ToolRunStatus, "PENDING">, data: { outputText?: string; errorCode?: string } = {}) {
  return prisma.toolRun.updateMany({
    where: { id: runId, userId, status: "PENDING" },
    data: {
      status,
      outputText: data.outputText,
      errorCode: data.errorCode?.slice(0, 100),
    },
  });
}

export const RECOVERY_TTL_MS = 15 * 60_000;

export async function persistToolRunPartial(userId: string, runId: string, outputText: string) {
  const run = await prisma.toolRun.findFirst({ where: { id: runId, userId }, select: { retainContent: true } });
  if (!run) return { count: 0 };
  return prisma.toolRun.updateMany({
    where: { id: runId, userId, status: "PENDING" },
    data: { outputText, recoveryExpiresAt: run.retainContent ? null : new Date(Date.now() + RECOVERY_TTL_MS) },
  });
}

export async function finishRecoverableToolRun(
  userId: string,
  runId: string,
  status: Exclude<ToolRunStatus, "PENDING">,
  data: { outputText?: string; errorCode?: string } = {},
) {
  const run = await prisma.toolRun.findFirst({ where: { id: runId, userId }, select: { retainContent: true } });
  if (!run) return { count: 0 };
  return prisma.toolRun.updateMany({
    where: { id: runId, userId, status: "PENDING" },
    data: {
      status,
      outputText: data.outputText,
      errorCode: data.errorCode?.slice(0, 100),
      recoveryExpiresAt: run.retainContent ? null : new Date(Date.now() + RECOVERY_TTL_MS),
    },
  });
}

export async function isToolRunPending(userId: string, runId: string) {
  return Boolean(await prisma.toolRun.findFirst({ where: { id: runId, userId, status: "PENDING" }, select: { id: true } }));
}

export async function cleanupExpiredToolRunRecovery(now = new Date()) {
  return prisma.$transaction(async (transaction) => {
    const expired = await transaction.toolRun.findMany({
      where: { retainContent: false, recoveryExpiresAt: { lte: now } },
      select: { id: true },
    });
    if (!expired.length) return { count: 0 };
    const ids = expired.map((run) => run.id);
    await transaction.brainstormWorker.updateMany({
      where: { toolRunId: { in: ids } },
      data: { outputText: null },
    });
    return transaction.toolRun.updateMany({
      where: { id: { in: ids }, retainContent: false, recoveryExpiresAt: { lte: now } },
      data: { title: null, inputText: null, outputText: null, recoveryExpiresAt: null },
    });
  });
}

export async function cancelToolRun(userId: string, runId: string) {
  return prisma.$transaction(async (transaction) => {
    const cancelled = await transaction.toolRun.updateMany({
      where: { id: runId, userId, status: "PENDING" },
      data: { status: "CANCELLED", errorCode: "CANCELLED" },
    });
    if (cancelled.count) {
      await transaction.brainstormWorker.updateMany({
        where: { toolRunId: runId, userId, status: "PENDING" },
        data: { status: "CANCELLED", errorCode: "CANCELLED", completedAt: new Date() },
      });
    }
    return cancelled;
  });
}

export async function recoverStaleToolRuns(userId: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - 15 * 60_000);
  return prisma.$transaction(async (transaction) => {
    const stale = await transaction.toolRun.findMany({ where: { userId, status: "PENDING", updatedAt: { lt: cutoff } }, select: { id: true } });
    if (!stale.length) return { count: 0 };
    const ids = stale.map((run) => run.id);
    await transaction.brainstormWorker.updateMany({ where: { toolRunId: { in: ids }, userId, status: "PENDING" }, data: { status: "ERROR", errorCode: "TIMEOUT", completedAt: now } });
    return transaction.toolRun.updateMany({
      where: { id: { in: ids }, userId, status: "PENDING", updatedAt: { lt: cutoff } },
      data: { status: "ERROR", errorCode: "TIMEOUT" },
    });
  });
}
