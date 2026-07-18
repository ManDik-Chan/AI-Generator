import "server-only";

import { getAiConfigurationStatus, getBrainstormConfigurationStatus } from "@/lib/ai/config";
import { getImageConfigurationStatus, getImageGenerationConfigurationStatus } from "@/lib/ai/image/config";
import { prisma } from "@/lib/database/prisma";

const USER_LIST_LIMIT = 50;

function statusCounts<T extends string>(rows: Array<{ status: T; _count: { _all: number } }>) {
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all])) as Partial<Record<T, number>>;
}

export async function getAdminOverview() {
  const [
    profiles,
    profileCount,
    adminCount,
    conversationCount,
    messageCount,
    memoryCount,
    imageCount,
    toolRunCount,
    toolRunsByStatus,
    toolRunsByType,
    generationRunsByStatus,
    brainstormWorkersByStatus,
    recentRuns,
    modelConfigCount,
    appSettingCount,
    storedAssetBytes,
    generatedImageBytes,
  ] = await Promise.all([
    prisma.profile.findMany({
      orderBy: { createdAt: "desc" },
      take: USER_LIST_LIMIT,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        _count: { select: { conversations: true, personas: true, memories: true, toolRuns: true } },
      },
    }),
    prisma.profile.count(),
    prisma.profile.count({ where: { role: "ADMIN" } }),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.memory.count(),
    prisma.generatedImage.count(),
    prisma.toolRun.count(),
    prisma.toolRun.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.toolRun.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.generationRun.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.brainstormWorker.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.toolRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        errorCode: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { email: true, displayName: true } },
      },
    }),
    prisma.modelConfig.count(),
    prisma.appSetting.count(),
    prisma.toolAsset.aggregate({ _sum: { sizeBytes: true } }),
    prisma.generatedImage.aggregate({ _sum: { sizeBytes: true } }),
  ]);

  return {
    users: { items: profiles, total: profileCount, admins: adminCount, limit: USER_LIST_LIMIT },
    totals: { conversations: conversationCount, messages: messageCount, memories: memoryCount, images: imageCount, toolRuns: toolRunCount },
    toolRuns: { byStatus: statusCounts(toolRunsByStatus), byType: Object.fromEntries(toolRunsByType.map((row) => [row.type, row._count._all])), recent: recentRuns },
    generationRuns: statusCounts(generationRunsByStatus),
    brainstormWorkers: statusCounts(brainstormWorkersByStatus),
    storageBytes: (storedAssetBytes._sum.sizeBytes ?? 0) + (generatedImageBytes._sum.sizeBytes ?? 0),
    system: {
      database: true,
      ai: getAiConfigurationStatus().configured,
      imageAnalysis: getImageConfigurationStatus().configured,
      imageGeneration: getImageGenerationConfigurationStatus().configured,
      brainstorm: getBrainstormConfigurationStatus().configured,
      modelConfigCount,
      appSettingCount,
    },
  };
}
