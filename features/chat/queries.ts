import { prisma } from "@/lib/database/prisma";
import type { ConversationDetail, ConversationSummary } from "@/features/chat/types";

export async function getConversationList(userId: string): Promise<ConversationSummary[]> {
  const conversations = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true, persona: { select: { id: true, name: true, avatarUrl: true, description: true, greeting: true, archivedAt: true } } },
  });

  return conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
    persona: conversation.persona ? { id: conversation.persona.id, name: conversation.persona.name, avatarUrl: conversation.persona.avatarUrl ?? undefined, description: conversation.persona.description ?? undefined, greeting: conversation.persona.greeting ?? undefined, archived: Boolean(conversation.persona.archivedAt) } : undefined,
  }));
}

export async function getConversationDetail(
  userId: string,
  conversationId: string,
): Promise<ConversationDetail | null> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      persona: { select: { id: true, name: true, avatarUrl: true, description: true, greeting: true, archivedAt: true } },
      messages: {
        where: { supersededAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, content: true, status: true, createdAt: true },
      },
    },
  });

  if (!conversation) return null;

  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
    persona: conversation.persona ? { id: conversation.persona.id, name: conversation.persona.name, avatarUrl: conversation.persona.avatarUrl ?? undefined, description: conversation.persona.description ?? undefined, greeting: conversation.persona.greeting ?? undefined, archived: Boolean(conversation.persona.archivedAt) } : undefined,
    messages: conversation.messages
      .filter((message) => message.role === "USER" || message.role === "ASSISTANT")
      .map((message) => ({
        id: message.id,
        role: message.role === "USER" ? "user" : "assistant",
        content: message.content,
        status: message.status.toLowerCase() as "pending" | "complete" | "error",
        createdAt: message.createdAt.toISOString(),
      })),
  };
}
