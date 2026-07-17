import "server-only";

import type { GenerationRunStatus, GenerationRunType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";

const DEFAULT_TTL_MS = 24 * 60 * 60_000;

export async function createGenerationRun(input: {
  userId: string;
  personaId?: string;
  type: GenerationRunType;
  input: Prisma.InputJsonValue;
}) {
  return prisma.generationRun.create({
    data: { ...input, expiresAt: new Date(Date.now() + DEFAULT_TTL_MS) },
    select: { id: true },
  });
}

export async function isGenerationRunPending(userId: string, runId: string) {
  return Boolean(await prisma.generationRun.findFirst({ where: { id: runId, userId, status: "PENDING" }, select: { id: true } }));
}

export async function finishGenerationRun(
  userId: string,
  runId: string,
  status: Exclude<GenerationRunStatus, "PENDING">,
  data: { result?: Prisma.InputJsonValue; errorCode?: string } = {},
) {
  return prisma.generationRun.updateMany({
    where: { id: runId, userId, status: "PENDING" },
    data: { status, result: data.result, errorCode: data.errorCode?.slice(0, 100) },
  });
}

export async function cancelGenerationRun(userId: string, runId: string) {
  return finishGenerationRun(userId, runId, "CANCELLED", { errorCode: "CANCELLED" });
}

export async function getGenerationRun(userId: string, runId: string) {
  return prisma.generationRun.findFirst({
    where: { id: runId, userId, expiresAt: { gt: new Date() } },
    select: { id: true, personaId: true, type: true, status: true, result: true, errorCode: true, expiresAt: true, createdAt: true, updatedAt: true },
  });
}

export async function cleanupExpiredGenerationRuns(now = new Date()) {
  return prisma.generationRun.deleteMany({ where: { expiresAt: { lte: now } } });
}
