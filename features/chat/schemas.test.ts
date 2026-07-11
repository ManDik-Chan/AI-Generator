import { describe, expect, it } from "vitest";

import { createChatRequestSchema } from "@/features/chat/schemas";

const schema = createChatRequestSchema(8);

describe("chat request validation", () => {
  it("accepts valid content and an optional UUID", () => {
    expect(schema.safeParse({ content: "hello" }).success).toBe(true);
    expect(schema.safeParse({ conversationId: "550e8400-e29b-41d4-a716-446655440000", content: "hello" }).success).toBe(true);
  });

  it.each([
    { content: "" },
    { content: "   " },
    { content: 123 },
    { content: "123456789" },
    { conversationId: "not-a-uuid", content: "hello" },
  ])("rejects invalid input: $content", (input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });
});
