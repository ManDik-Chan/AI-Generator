export interface EditableMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
  status: "PENDING" | "COMPLETE" | "ERROR";
  content: string;
  supersededAt: Date | null;
}

export class ChatEditConflictError extends Error {
  constructor(message = "对话内容已发生变化，请刷新后重试。") {
    super(message);
    this.name = "ChatEditConflictError";
  }
}

export function assertSupersedeCount(expected: number, actual: number) {
  if (expected !== actual) throw new ChatEditConflictError();
}

export function assertConversationVersion(actual: Date, expected: string) {
  if (actual.toISOString() !== expected) throw new ChatEditConflictError();
}

export function resolveEditMessageId(
  messages: EditableMessage[],
  explicitMessageId: string | undefined,
  editLastMessage: boolean,
) {
  if (explicitMessageId) return explicitMessageId;
  if (!editLastMessage) return undefined;
  return [...messages].reverse().find((message) => !message.supersededAt && message.role === "USER")?.id;
}

export function planLastUserMessageEdit(messages: EditableMessage[], targetId: string) {
  const activeMessages = messages.filter((message) => !message.supersededAt);
  const targetIndex = activeMessages.findIndex((message) => message.id === targetId);
  const target = activeMessages[targetIndex];
  if (!target || target.role !== "USER") throw new ChatEditConflictError();

  const lastUser = [...activeMessages].reverse().find((message) => message.role === "USER");
  if (lastUser?.id !== targetId) throw new ChatEditConflictError();

  const firstUser = activeMessages.find((message) => message.role === "USER");
  return {
    supersedeIds: activeMessages.slice(targetIndex).map((message) => message.id),
    updateTitle: firstUser?.id === targetId,
  };
}
