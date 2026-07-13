export type ChatMessageRole = "user" | "assistant";
export type ChatMessageStatus = "pending" | "complete" | "error";

export interface ChatMessageView {
  id: string;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  createdAt: string;
  temporary?: boolean;
  memoryCount?: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  persona?: import("@/features/persona/types").PersonaChatIdentity;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessageView[];
}

export type ChatStreamEvent =
  | { event: "conversation"; data: { conversationId: string; updatedAt: string } }
  | { event: "turn"; data: { conversationId: string; userMessageId: string; assistantMessageId: string; editedMessageId?: string } }
  | { event: "memory"; data: { count: number } }
  | { event: "delta"; data: { text: string } }
  | { event: "done"; data: { messageId: string } }
  | { event: "error"; data: { message: string } };
