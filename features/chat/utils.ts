import type { AiMessage } from "@/lib/ai/types";
import { CHAT_CONTEXT_CHAR_BUDGET, CHAT_CONTEXT_MESSAGE_LIMIT, CHAT_TITLE_MAX_LENGTH } from "@/features/chat/constants";

export interface ContextMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
  status: "PENDING" | "COMPLETE" | "ERROR" | "CANCELLED";
  content: string;
  createdAt: Date;
  supersededAt: Date | null;
}

export function createConversationTitle(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "新对话";
  return normalized.slice(0, CHAT_TITLE_MAX_LENGTH);
}

export function buildCompleteTurnContext(
  newestFirstMessages: ContextMessage[],
  currentUserMessageId: string,
  characterBudget = CHAT_CONTEXT_CHAR_BUDGET,
  messageLimit = CHAT_CONTEXT_MESSAGE_LIMIT,
): AiMessage[] {
  const active = newestFirstMessages
    .filter((message) => !message.supersededAt)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const current = active.find((message) => message.id === currentUserMessageId && message.role === "USER");
  if (!current) return [];

  const turns: AiMessage[][] = [];
  for (let index = 0; index < active.length; index += 1) {
    const user = active[index];
    if (user.id === current.id) break;
    const assistant = active[index + 1];
    if (
      user.role === "USER" && user.status === "COMPLETE" && user.content.trim()
      && assistant?.role === "ASSISTANT" && assistant.status === "COMPLETE" && assistant.content.trim()
    ) {
      turns.push([
        { role: "user", content: user.content },
        { role: "assistant", content: assistant.content },
      ]);
      index += 1;
    }
  }

  const currentMessage: AiMessage = { role: "user", content: current.content };
  const selected: AiMessage[] = [currentMessage];
  let characters = current.content.length;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const turnCharacters = turn.reduce((sum, message) => sum + message.content.length, 0);
    if (selected.length + turn.length > messageLimit || characters + turnCharacters > characterBudget) break;
    selected.unshift(...turn);
    characters += turnCharacters;
  }
  return selected;
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
