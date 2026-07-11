"use server";

import { revalidatePath } from "next/cache";

import { deleteOwnedConversation } from "@/features/chat/access";
import { conversationIdSchema } from "@/features/chat/schemas";
import { getConversationList } from "@/features/chat/queries";
import { requireUser } from "@/lib/auth/session";

export async function deleteConversationAction(conversationId: string) {
  const parsed = conversationIdSchema.safeParse(conversationId);
  if (!parsed.success) return { success: false as const, message: "对话 ID 无效。" };

  const user = await requireUser();
  try {
    const deleted = await deleteOwnedConversation(user.id, parsed.data);
    if (!deleted) return { success: false as const, message: "对话不存在或无权删除。" };

    const nextConversation = (await getConversationList(user.id))[0] ?? null;
    revalidatePath("/chat", "layout");
    return { success: true as const, nextConversationId: nextConversation?.id ?? null };
  } catch {
    console.error("[chat] Unable to delete conversation", { conversationId: parsed.data, userId: user.id });
    return { success: false as const, message: "删除失败，请稍后重试。" };
  }
}
