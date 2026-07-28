import type { ChatMessageView } from "@/features/chat/types";
import type { AgentRunTerminalSnapshot } from "@/features/agents/client-types";
import { chatMemoryDisclosureSchema } from "@/features/memory/disclosure";

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

export function applyAgentTerminalMessage(messages: ChatMessageView[], terminal: AgentRunTerminalSnapshot) {
  return messages.map((message) => message.id === terminal.assistantMessageId ? {
    ...message,
    content: terminal.assistantMessage.content,
    status: terminal.assistantMessage.status.toLowerCase() as ChatMessageView["status"],
  } : message);
}

export function applyChatRecoverySnapshot(
  messages: ChatMessageView[],
  snapshot: { id: string; status: string; content: string },
) {
  const status = snapshot.status.toLowerCase() as ChatMessageView["status"];
  return messages.map((message) => {
    if (message.id !== snapshot.id) return message;
    if (snapshot.status === "PENDING") {
      if (message.status !== "pending") return message;
      return {
        ...message,
        content: snapshot.content || message.content,
        status,
      };
    }
    return { ...message, content: snapshot.content, status };
  });
}

export function applyChatMemoryDisclosure(
  messages: ChatMessageView[],
  assistantMessageId: string,
  payload: unknown,
) {
  const parsed = chatMemoryDisclosureSchema.safeParse(payload);
  if (!parsed.success || parsed.data.count === 0) return messages;
  return messages.map((message) =>
    message.id === assistantMessageId
      && message.role === "assistant"
      && message.status !== "error"
      && message.status !== "cancelled"
      ? { ...message, memoryDisclosure: parsed.data }
      : message);
}
