import { z } from "zod";

export function createChatRequestSchema(maxInputChars: number) {
  return z.object({
    conversationId: z.uuid("conversationId 格式无效。").optional(),
    personaId: z.uuid("personaId 格式无效。").optional(),
    editMessageId: z.uuid("editMessageId 格式无效。").optional(),
    editLastMessage: z.literal(true, { error: "editLastMessage 必须为 true。" }).optional(),
    editConversationUpdatedAt: z.iso.datetime({ error: "editConversationUpdatedAt 格式无效。" }).optional(),
    content: z
      .string({ error: "消息内容必须是字符串。" })
      .trim()
      .min(1, "请输入消息内容。")
      .max(maxInputChars, `消息内容不能超过 ${maxInputChars} 个字符。`),
  }).superRefine((value, context) => {
    if ((value.editMessageId || value.editLastMessage) && !value.conversationId) {
      context.addIssue({ code: "custom", path: ["conversationId"], message: "编辑消息时必须指定对话。" });
    }
    if (value.editMessageId && value.editLastMessage) {
      context.addIssue({ code: "custom", path: ["editLastMessage"], message: "editMessageId 和 editLastMessage 不能同时使用。" });
    }
    if (value.editLastMessage && !value.editConversationUpdatedAt) {
      context.addIssue({ code: "custom", path: ["editConversationUpdatedAt"], message: "编辑最后一条消息时缺少对话版本。" });
    }
    if (!value.editLastMessage && value.editConversationUpdatedAt) {
      context.addIssue({ code: "custom", path: ["editConversationUpdatedAt"], message: "对话版本只能用于 editLastMessage。" });
    }
    if (value.conversationId && value.personaId) {
      context.addIssue({ code: "custom", path: ["personaId"], message: "已有对话不能切换人格。" });
    }
  });
}

export const conversationIdSchema = z.uuid("对话 ID 格式无效。");
