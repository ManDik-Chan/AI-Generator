import type { ToolType } from "@prisma/client";

import { TOOL_HISTORY_PAGE_SIZE } from "@/features/tools/constants";
import type { ToolRunDetail, ToolRunListItem } from "@/features/tools/types";
import { previewText } from "@/features/tools/utils";
import { prisma } from "@/lib/database/prisma";
import { cleanupExpiredToolRunRecovery } from "@/features/tools/usage";
import { imageGenerationHistoryOptionsSchema } from "@/features/tools/image-generation/schemas";
import type { GeneratedToolImageDto } from "@/features/tools/image-generation/types";

export function resolveRecoveryGeneratedImage(
  type: ToolType,
  options: unknown,
  image: { id: string; prompt: string; width: number | null; height: number | null; createdAt: Date } | null,
): GeneratedToolImageDto | undefined {
  if (type !== "IMAGE_GENERATE" || !image) return undefined;
  const parsed = imageGenerationHistoryOptionsSchema.safeParse(options);
  const style = parsed.success ? parsed.data.style : "AUTO";
  return {
    id: image.id,
    prompt: image.prompt,
    style,
    width: image.width,
    height: image.height,
    createdAt: image.createdAt.toISOString(),
    previewUrl: `/api/generated-images/${image.id}`,
    downloadUrl: `/api/generated-images/${image.id}?download=1`,
  };
}

export async function getToolHistory(userId: string, page = 1, type?: ToolType) {
  const safePage = Math.max(1, Math.floor(page));
  const where = { userId, retainContent: true, ...(type ? { type } : {}) };
  const [rows, total] = await Promise.all([
    prisma.toolRun.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (safePage - 1) * TOOL_HISTORY_PAGE_SIZE,
      take: TOOL_HISTORY_PAGE_SIZE,
      select: { id: true, type: true, status: true, title: true, inputText: true, outputText: true, createdAt: true, assets: { take: 1, select: { id: true, mimeType: true, width: true, height: true, expiresAt: true } }, generatedImage: { select: { id: true, width: true, height: true } } },
    }),
    prisma.toolRun.count({ where }),
  ]);
  const items: ToolRunListItem[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    title: row.title ?? undefined,
    inputPreview: previewText(row.inputText),
    outputPreview: previewText(row.outputText),
    createdAt: row.createdAt.toISOString(),
    asset: row.assets[0] ? { id: row.assets[0].id, mimeType: row.assets[0].mimeType, width: row.assets[0].width, height: row.assets[0].height, expired: row.assets[0].expiresAt <= new Date() } : undefined,
    generatedImage: row.generatedImage ?? undefined,
  }));
  return { items, page: safePage, pages: Math.max(1, Math.ceil(total / TOOL_HISTORY_PAGE_SIZE)), total };
}

export async function getToolRunDetail(userId: string, runId: string): Promise<ToolRunDetail | null> {
  const row = await prisma.toolRun.findFirst({
    where: { id: runId, userId, retainContent: true },
    select: { id: true, type: true, status: true, title: true, inputText: true, outputText: true, options: true, createdAt: true, assets: { take: 1, select: { id: true, mimeType: true, width: true, height: true, expiresAt: true } }, generatedImage: { select: { id: true, width: true, height: true } } },
  });
  if (!row?.inputText) return null;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    title: row.title ?? undefined,
    inputText: row.inputText,
    outputText: row.outputText ?? undefined,
    options: row.options as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    asset: row.assets[0] ? { id: row.assets[0].id, mimeType: row.assets[0].mimeType, width: row.assets[0].width, height: row.assets[0].height, expired: row.assets[0].expiresAt <= new Date() } : undefined,
    generatedImage: row.generatedImage ?? undefined,
  };
}

export async function getRecentToolRuns(userId: string) {
  return prisma.toolRun.findMany({
    where: { userId, retainContent: true },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, type: true, title: true, createdAt: true },
  });
}

export async function getToolRunRecovery(userId: string, runId: string) {
  const now = new Date();
  await cleanupExpiredToolRunRecovery(now).catch(() => undefined);
  const row = await prisma.toolRun.findFirst({
    where: { id: runId, userId },
    select: {
      id: true,
      type: true,
      status: true,
      retainContent: true,
      outputText: true,
      errorCode: true,
      recoveryExpiresAt: true,
      updatedAt: true,
      options: true,
      generatedImage: { select: { id: true, prompt: true, width: true, height: true, createdAt: true } },
    },
  });
  if (!row) return null;
  const canReadOutput = row.retainContent || Boolean(row.recoveryExpiresAt && row.recoveryExpiresAt > now);
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    outputText: canReadOutput ? row.outputText ?? "" : "",
    errorCode: row.errorCode ?? undefined,
    generatedImage: resolveRecoveryGeneratedImage(row.type, row.options, row.generatedImage),
    updatedAt: row.updatedAt.toISOString(),
  };
}
