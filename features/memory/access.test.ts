import { beforeEach, describe, expect, it, vi } from "vitest";

const { personaFindFirst, messageFindFirst } = vi.hoisted(() => ({
  personaFindFirst: vi.fn(),
  messageFindFirst: vi.fn(),
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    persona: { findFirst: personaFindFirst },
    message: { findFirst: messageFindFirst },
  },
}));

import { validateMemoryRelations } from "@/features/memory/access";

describe("memory relation ownership", () => {
  beforeEach(() => {
    personaFindFirst.mockReset();
    messageFindFirst.mockReset();
  });

  it("checks PERSONA scope against the current owner", async () => {
    personaFindFirst.mockResolvedValue(null);
    await expect(
      validateMemoryRelations("user-b", { scope: "PERSONA", personaId: "persona-a" }),
    ).resolves.toBe("人格不存在或无权访问。");
    expect(personaFindFirst).toHaveBeenCalledWith({
      where: { id: "persona-a", userId: "user-b" },
      select: { id: true },
    });
  });

  it("accepts only an active COMPLETE USER message from an owned conversation", async () => {
    messageFindFirst.mockResolvedValue({ id: "message-a" });
    await expect(
      validateMemoryRelations("user-a", {
        scope: "GLOBAL",
        sourceConversationId: "conversation-a",
        sourceMessageId: "message-a",
      }),
    ).resolves.toBeUndefined();
    expect(messageFindFirst).toHaveBeenCalledWith({
      where: {
        id: "message-a",
        conversationId: "conversation-a",
        role: "USER",
        status: "COMPLETE",
        supersededAt: null,
        conversation: { userId: "user-a" },
      },
      select: { id: true },
    });
  });

  it("rejects a message that does not match the owned active source", async () => {
    messageFindFirst.mockResolvedValue(null);
    await expect(
      validateMemoryRelations("user-b", {
        scope: "GLOBAL",
        sourceConversationId: "conversation-a",
        sourceMessageId: "message-a",
      }),
    ).resolves.toBe("只能保存自己对话中有效的用户消息。");
  });
});
