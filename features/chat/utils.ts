import type { AiMessage } from "@/lib/ai/types";
import { CHAT_CONTEXT_CHAR_BUDGET, CHAT_CONTEXT_MESSAGE_LIMIT, CHAT_TITLE_MAX_LENGTH } from "@/features/chat/constants";

export function createConversationTitle(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "新对话";
  return normalized.slice(0, CHAT_TITLE_MAX_LENGTH);
}

export function selectContextMessages(
  newestFirstMessages: AiMessage[],
  characterBudget = CHAT_CONTEXT_CHAR_BUDGET,
  messageLimit = CHAT_CONTEXT_MESSAGE_LIMIT,
) {
  const selected: AiMessage[] = [];
  let usedCharacters = 0;

  for (const message of newestFirstMessages.slice(0, messageLimit)) {
    if (usedCharacters + message.content.length > characterBudget) break;
    selected.push(message);
    usedCharacters += message.content.length;
  }

  return selected.reverse();
}

export function startOfUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function hasReachedDailyMessageLimit(role: "ADMIN" | "USER", count: number, limit: number) {
  return role !== "ADMIN" && count >= limit;
}

export function encodeChatSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
