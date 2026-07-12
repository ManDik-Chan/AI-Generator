import { describe, expect, it } from "vitest";
import { confirmOptimisticTurn, createEditRequestTarget } from "@/features/chat/client-state";
import type { ChatMessageView } from "@/features/chat/types";

const temporaryUser: ChatMessageView = { id: "user-temp", role: "user", content: "question", status: "complete", createdAt: "2026-07-12T00:00:00Z", temporary: true };
const confirmedUser: ChatMessageView = { ...temporaryUser, id: "550e8400-e29b-41d4-a716-446655440001", temporary: false };

describe("chat client message identity", () => {
  it("uses a database UUID after turn confirmation", () => {
    expect(createEditRequestTarget({ message: confirmedUser, conversationId: "c1" })).toEqual({ conversationId: "c1", editMessageId: confirmedUser.id });
  });

  it("uses editLastMessage before turn and never sends a temporary id", () => {
    const result = createEditRequestTarget({ message: temporaryUser, conversationId: "c1", conversationUpdatedAt: "2026-07-12T00:00:00.000Z" });
    expect(result).toEqual({ conversationId: "c1", editLastMessage: true, editConversationUpdatedAt: "2026-07-12T00:00:00.000Z" });
    expect(result).not.toHaveProperty("editMessageId");
  });

  it("waits rather than sending editLastMessage without a confirmed conversation", () => {
    expect(createEditRequestTarget({ message: temporaryUser })).toBeNull();
    expect(createEditRequestTarget({ message: temporaryUser, conversationId: "c1" })).toBeNull();
  });

  it("replaces both temporary ids without duplicate messages", () => {
    const assistant: ChatMessageView = { ...temporaryUser, id: "assistant-temp", role: "assistant", content: "", status: "pending" };
    const result = confirmOptimisticTurn([temporaryUser, assistant, { ...confirmedUser }], "user-temp", "assistant-temp", confirmedUser.id, "550e8400-e29b-41d4-a716-446655440002");
    expect(result.map((message) => message.id)).toEqual([confirmedUser.id, "550e8400-e29b-41d4-a716-446655440002"]);
    expect(result.every((message) => !message.temporary)).toBe(true);
  });
});
