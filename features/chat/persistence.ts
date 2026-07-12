import { prisma } from "@/lib/database/prisma";

export async function finalizeAssistantMessage(
  messageId: string,
  content: string,
  status: "COMPLETE" | "ERROR",
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
