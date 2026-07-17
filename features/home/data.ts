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
}

export const getHomePersonalization = cache(async (): Promise<HomePersonalization> => {
  try {
    const user = await getCurrentUser();
    if (!user) return {};

    const [viewer, conversation] = await Promise.all([
      getShellViewer(),
      prisma.conversation.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          persona: { select: { name: true } },
        },
      }),
    ]);

    return {
      displayName: viewer?.displayName,
      latestConversation: conversation ? {
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
      } : undefined,
    };
  } catch {
    return {};
  }
});
