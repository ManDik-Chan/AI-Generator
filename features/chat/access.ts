import { prisma } from "@/lib/database/prisma";

export function ownedConversationWhere(userId: string, conversationId: string) {
  return { id: conversationId, userId } as const;
}

export async function deleteOwnedConversation(userId: string, conversationId: string) {
  const result = await prisma.conversation.deleteMany({
    where: ownedConversationWhere(userId, conversationId),
  });
  return result.count === 1;
}
