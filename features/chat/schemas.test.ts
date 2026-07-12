import { describe, expect, it } from "vitest";

import { createChatRequestSchema } from "@/features/chat/schemas";

const schema = createChatRequestSchema(8);

describe("chat request validation", () => {
  it("accepts valid content and an optional UUID", () => {
    expect(schema.safeParse({ content: "hello" }).success).toBe(true);
    expect(schema.safeParse({ conversationId: "550e8400-e29b-41d4-a716-446655440000", content: "hello" }).success).toBe(true);
    expect(schema.safeParse({ conversationId: "550e8400-e29b-41d4-a716-446655440000", editMessageId: "550e8400-e29b-41d4-a716-446655440001", content: "hello" }).success).toBe(true);
    expect(schema.safeParse({
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
      editLastMessage: true,
      editConversationUpdatedAt: "2026-07-12T12:00:00.000Z",
      content: "hello",
    }).success).toBe(true);
  });

  it.each([
    { content: "" },
    { content: "   " },
    { content: 123 },
    { content: "123456789" },
    { conversationId: "not-a-uuid", content: "hello" },
    { editMessageId: "550e8400-e29b-41d4-a716-446655440001", content: "hello" },
    { conversationId: "550e8400-e29b-41d4-a716-446655440000", editMessageId: "not-a-uuid", content: "hello" },
    { conversationId: "550e8400-e29b-41d4-a716-446655440000", editMessageId: "user-550e8400-e29b-41d4-a716-446655440001", content: "hello" },
    { editLastMessage: true, editConversationUpdatedAt: "2026-07-12T12:00:00.000Z", content: "hello" },
    { conversationId: "550e8400-e29b-41d4-a716-446655440000", editLastMessage: true, content: "hello" },
    { conversationId: "550e8400-e29b-41d4-a716-446655440000", editMessageId: "550e8400-e29b-41d4-a716-446655440001", editLastMessage: true, editConversationUpdatedAt: "2026-07-12T12:00:00.000Z", content: "hello" },
  ])("rejects invalid input: $content", (input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });
});
