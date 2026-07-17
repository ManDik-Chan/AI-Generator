import { prisma } from "@/lib/database/prisma";

export async function finalizeAssistantMessage(
  messageId: string,
  content: string,
  status: "COMPLETE" | "ERROR" | "CANCELLED",
) {
  try {
    const result = await prisma.message.updateMany({
      where: { id: messageId, status: "PENDING", supersededAt: null },
      data: { content, status },
    });
    return result.count === 1;
  } catch {
    console.error("[chat] Unable to finalize assistant message", { messageId, status });
    return false;
  }
}

export async function persistAssistantPartial(messageId: string, content: string) {
  try {
    const result = await prisma.message.updateMany({
      where: { id: messageId, status: "PENDING", supersededAt: null },
      data: { content },
    });
    return result.count === 1;
  } catch {
    console.error("[chat] Unable to persist assistant partial", { messageId });
    return false;
  }
}

export async function isAssistantMessagePending(messageId: string) {
  return Boolean(await prisma.message.findFirst({
    where: { id: messageId, role: "ASSISTANT", status: "PENDING", supersededAt: null },
    select: { id: true },
  }));
}
