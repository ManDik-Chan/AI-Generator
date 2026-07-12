import { z } from "zod";

export function createChatRequestSchema(maxInputChars: number) {
  return z.object({
    conversationId: z.uuid("conversationId 格式无效。").optional(),
    editMessageId: z.uuid("editMessageId 格式无效。").optional(),
    content: z
      .string({ error: "消息内容必须是字符串。" })
      .trim()
      .min(1, "请输入消息内容。")
      .max(maxInputChars, `消息内容不能超过 ${maxInputChars} 个字符。`),
  }).superRefine((value, context) => {
    if (value.editMessageId && !value.conversationId) {
      context.addIssue({ code: "custom", path: ["conversationId"], message: "编辑消息时必须指定对话。" });
    }
  });
}

export const conversationIdSchema = z.uuid("对话 ID 格式无效。");
