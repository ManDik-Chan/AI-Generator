import { z } from "zod";

export function createChatRequestSchema(maxInputChars: number) {
  return z.object({
    conversationId: z.uuid("conversationId 格式无效。").optional(),
    content: z
      .string({ error: "消息内容必须是字符串。" })
      .trim()
      .min(1, "请输入消息内容。")
      .max(maxInputChars, `消息内容不能超过 ${maxInputChars} 个字符。`),
  });
}

export const conversationIdSchema = z.uuid("对话 ID 格式无效。");
