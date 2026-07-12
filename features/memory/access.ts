import { prisma } from "@/lib/database/prisma";

export async function validateMemoryRelations(userId: string, input: { scope: "GLOBAL" | "PERSONA"; personaId?: string; sourceConversationId?: string; sourceMessageId?: string }) {
  if (input.scope === "PERSONA") { const persona = await prisma.persona.findFirst({ where: { id: input.personaId, userId }, select: { id: true } }); if (!persona) return "人格不存在或无权访问。"; }
  if (input.sourceConversationId && input.sourceMessageId) { const message = await prisma.message.findFirst({ where: { id: input.sourceMessageId, conversationId: input.sourceConversationId, role: "USER", status: "COMPLETE", supersededAt: null, conversation: { userId } }, select: { id: true } }); if (!message) return "只能保存自己对话中有效的用户消息。"; }
  return undefined;
}
