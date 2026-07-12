import type { ChatMessageView } from "@/features/chat/types";

interface EditTargetInput {
  message: ChatMessageView;
  conversationId?: string;
  conversationUpdatedAt?: string;
}

export function createEditRequestTarget(input: EditTargetInput) {
  if (!input.conversationId) return null;
  if (input.message.temporary) {
    if (!input.conversationUpdatedAt) return null;
    return {
      conversationId: input.conversationId,
      editLastMessage: true as const,
      editConversationUpdatedAt: input.conversationUpdatedAt,
    };
  }
  return { conversationId: input.conversationId, editMessageId: input.message.id };
}

export function confirmOptimisticTurn(
  messages: ChatMessageView[],
  temporaryUserId: string,
  temporaryAssistantId: string,
  userMessageId: string,
  assistantMessageId: string,
) {
  const confirmed = messages.map((message) => {
    if (message.id === temporaryUserId) return { ...message, id: userMessageId, temporary: false };
    if (message.id === temporaryAssistantId) return { ...message, id: assistantMessageId, temporary: false };
    return message;
  });
  return confirmed.filter((message, index) => confirmed.findIndex((candidate) => candidate.id === message.id) === index);
}
