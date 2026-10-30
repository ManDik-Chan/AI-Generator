import "server-only";

import { cache } from "react";

import { getShellViewer } from "@/components/layout/shell-viewer-data";
import type { HomeActivity, HomeConversationPreview, HomeMetrics } from "@/features/home/presentation";
import { toolTypeMeta } from "@/features/home/presentation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

export type { HomeActivity, HomeConversationPreview, HomeMetrics } from "@/features/home/presentation";

export interface HomePersonalization {
  displayName?: string;
  latestConversation?: HomeConversationPreview;
  recentConversations: HomeConversationPreview[];
  activity: HomeActivity[];
  isAdmin: boolean;
  metrics?: HomeMetrics;
}

const timeLabel = (date: Date) => new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Shanghai",
}).format(date);

const statusLabel: Record<string, string> = { PENDING: "进行中", COMPLETE: "已完成", ERROR: "失败", CANCELLED: "已停止" };

/** Every query settles independently: one unavailable table never blanks the whole home. */
function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

export const getHomePersonalization = cache(async (): Promise<HomePersonalization> => {
  try {
    const user = await getCurrentUser();
    if (!user) return { recentConversations: [], activity: [], isAdmin: false };
    const now = new Date();

    const results = await Promise.allSettled([
      getShellViewer(),
      prisma.conversation.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 4,
        select: { id: true, title: true, updatedAt: true, persona: { select: { name: true } } },
      }),
      prisma.toolRun.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { id: true, type: true, title: true, status: true, createdAt: true },
      }),
      prisma.agentRun.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, status: true, mode: true, planOverview: true, plannedWorkerCount: true, completedWorkerCount: true, createdAt: true },
      }),
      prisma.conversation.count({ where: { userId: user.id } }),
      prisma.persona.count({ where: { userId: user.id, archivedAt: null } }),
      prisma.memory.count({ where: { userId: user.id, enabled: true } }),
      prisma.generatedImage.count({ where: { userId: user.id, kind: "TOOL_GENERATION" } }),
      prisma.memoryProposal.count({ where: { userId: user.id, status: "PENDING", expiresAt: { gt: now } } }),
      prisma.toolRun.count({ where: { userId: user.id } }),
      prisma.agentRun.count({ where: { userId: user.id, status: "PENDING" } }),
    ]);

    const viewer = settled(results[0], undefined);
    const conversations = settled(results[1], []);
    const toolRuns = settled(results[2], []);
    const agentRuns = settled(results[3], []);
    const count = (index: number) => {
      const result = results[index];
      return result.status === "fulfilled" && typeof result.value === "number" ? result.value : undefined;
    };

    const recentConversations = conversations.map((conversation) => ({
      id: conversation.id,
      personaName: conversation.persona?.name,
      title: conversation.title,
      updatedLabel: timeLabel(conversation.updatedAt),
    }));

    const activity: HomeActivity[] = [
      ...conversations.map((conversation) => ({
        id: `chat-${conversation.id}`,
        kind: "chat" as const,
        title: conversation.title,
        meta: `对话 · ${conversation.persona?.name ?? "默认助手"}`,
        time: timeLabel(conversation.updatedAt),
        href: `/chat/${conversation.id}`,
        at: conversation.updatedAt.getTime(),
      })),
      ...toolRuns.map((run) => ({
        id: `tool-${run.id}`,
        kind: "tool" as const,
        title: run.title || toolTypeMeta[run.type].label,
        meta: `${toolTypeMeta[run.type].label} · ${statusLabel[run.status] ?? run.status}`,
        time: timeLabel(run.createdAt),
        href: `/tools/history?type=${run.type}`,
        at: run.createdAt.getTime(),
      })),
      ...agentRuns.map((run) => ({
        id: `agent-${run.id}`,
        kind: "agent" as const,
        title: run.planOverview?.trim() || "Agent 运行",
        meta: `Agent · ${statusLabel[run.status] ?? run.status} · Worker ${run.completedWorkerCount}/${run.plannedWorkerCount}`,
        time: timeLabel(run.createdAt),
        href: `/agents/${run.id}`,
        at: run.createdAt.getTime(),
      })),
    ].sort((a, b) => b.at - a.at).slice(0, 6);

    const conversationsCount = count(4);
    return {
      displayName: viewer?.displayName,
      latestConversation: recentConversations[0],
      recentConversations,
      activity,
      isAdmin: viewer?.role === "ADMIN",
      metrics: conversationsCount === undefined ? undefined : {
        conversations: conversationsCount,
        personas: count(5) ?? 0,
        memories: count(6) ?? 0,
        generatedImages: count(7) ?? 0,
        pendingProposals: count(8),
        toolRuns: count(9) ?? 0,
        activeAgentRuns: count(10) ?? 0,
      },
    };
  } catch {
    return { recentConversations: [], activity: [], isAdmin: false };
  }
});
