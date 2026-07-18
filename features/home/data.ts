import "server-only";

import { cache } from "react";

import { getShellViewer } from "@/components/layout/shell-viewer-data";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

export interface HomeConversationPreview {
  id: string;
  title: string;
  updatedLabel: string;
  personaName?: string;
}

export interface HomePersonalization {
  displayName?: string;
  latestConversation?: HomeConversationPreview;
  recentConversations: HomeConversationPreview[];
  isAdmin: boolean;
  metrics?: {
    conversations: number;
    personas: number;
    memories: number;
    generatedImages: number;
  };
}

export const getHomePersonalization = cache(async (): Promise<HomePersonalization> => {
  try {
    const user = await getCurrentUser();
    if (!user) return { recentConversations: [], isAdmin: false };

    const [viewer, conversations, conversationCount, personaCount, memoryCount, generatedImageCount] = await Promise.all([
      getShellViewer(),
      prisma.conversation.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 2,
        select: {
          id: true,
          title: true,
          updatedAt: true,
          persona: { select: { name: true } },
        },
      }),
      prisma.conversation.count({ where: { userId: user.id } }),
      prisma.persona.count({ where: { userId: user.id, archivedAt: null } }),
      prisma.memory.count({ where: { userId: user.id, enabled: true } }),
      prisma.generatedImage.count({ where: { userId: user.id, kind: "TOOL_GENERATION" } }),
    ]);

    const recentConversations = conversations.map((conversation) => ({
      id: conversation.id,
      personaName: conversation.persona?.name,
      title: conversation.title,
      updatedLabel: new Intl.DateTimeFormat("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Shanghai",
      }).format(conversation.updatedAt),
    }));

    return {
      displayName: viewer?.displayName,
      latestConversation: recentConversations[0],
      recentConversations,
      isAdmin: viewer?.role === "ADMIN",
      metrics: {
        conversations: conversationCount,
        personas: personaCount,
        memories: memoryCount,
        generatedImages: generatedImageCount,
      },
    };
  } catch {
    return { recentConversations: [], isAdmin: false };
  }
});
