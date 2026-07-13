import { describe, expect, it } from "vitest";
import { memoryInputSchema } from "@/features/memory/schemas";
import {
  containsHighConfidenceCredential,
  normalizeMemoryContent,
} from "@/features/memory/security";

const personaId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";

describe("memory input safety", () => {
  it("accepts global and persona-scoped manual memories", () => {
    expect(
      memoryInputSchema.safeParse({
        content: "用户偏好简洁回答",
        category: "preference",
        scope: "GLOBAL",
        importance: 4,
        enabled: true,
      }).success,
    ).toBe(true);
    expect(
      memoryInputSchema.safeParse({
        content: "和这个人格讨论项目进度",
        category: "project",
        scope: "PERSONA",
        personaId,
        importance: 3,
        enabled: true,
      }).success,
    ).toBe(true);
  });

  it("requires a persona only for PERSONA scope", () => {
    expect(
      memoryInputSchema.safeParse({
        content: "缺少人格",
        category: "other",
        scope: "PERSONA",
        importance: 3,
        enabled: true,
      }).success,
    ).toBe(false);
    expect(
      memoryInputSchema.safeParse({
        content: "全局不能关联人格",
        category: "other",
        scope: "GLOBAL",
        personaId,
        importance: 3,
        enabled: true,
      }).success,
    ).toBe(false);
  });

  it("requires complete chat source metadata", () => {
    expect(
      memoryInputSchema.safeParse({
        content: "来自聊天的记忆",
        category: "other",
        scope: "GLOBAL",
        importance: 3,
        enabled: true,
        origin: "CHAT_MESSAGE",
        sourceConversationId: conversationId,
        sourceMessageId: messageId,
      }).success,
    ).toBe(true);
    expect(
      memoryInputSchema.safeParse({
        content: "不完整来源",
        category: "other",
        scope: "GLOBAL",
        importance: 3,
        enabled: true,
        sourceMessageId: messageId,
      }).success,
    ).toBe(false);
  });

  it("normalizes exact duplicates and rejects high-confidence credentials", () => {
    expect(normalizeMemoryContent("  喜欢   简洁回答 ")).toBe("喜欢 简洁回答");
    expect(containsHighConfidenceCredential("api_key=abcdefghijklmnop1234")).toBe(true);
    expect(containsHighConfidenceCredential("我喜欢 TypeScript 和咖啡")).toBe(false);
  });
});
