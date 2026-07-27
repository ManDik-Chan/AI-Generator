import { describe, expect, it } from "vitest";

import {
  chatMemoryDisclosureSchema,
  createChatMemoryDisclosure,
} from "@/features/memory/disclosure";
import {
  buildUserMemoryBlock,
  escapeMemoryXml,
} from "@/lib/ai/prompts/user-memory";

const item = (id: number, content = `用户记忆 ${id}`) => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  content,
  category: "preference",
  scope: "GLOBAL" as const,
  verificationMethod: "MANUAL_ENTRY" as const,
  enabled: true,
  ownerId: "must-not-leak",
  topicKey: "must-not-leak",
  similarity: 0.99,
  proposalId: "must-not-leak",
  keywords: ["must-not-leak"],
  embedding: [0.1, 0.2],
  sourceConversationId: "must-not-leak",
  sourceMessageId: "must-not-leak",
  confidence: 0.99,
  reasonCode: "must-not-leak",
  providerDiagnostics: { model: "must-not-leak" },
  internalCandidateCount: 42,
});

describe("ChatMemoryDisclosure contract", () => {
  it("uses a versioned DTO whitelist from the final selected memories", () => {
    const disclosure = createChatMemoryDisclosure([
      item(1),
      {
        ...item(2),
        scope: "PERSONA",
        verificationMethod: "LEGACY_UNREVIEWED",
      },
    ]);
    expect(disclosure).toEqual({
      version: 1,
      count: 2,
      items: [
        {
          id: item(1).id,
          content: "用户记忆 1",
          category: "preference",
          scope: "GLOBAL",
          verificationMethod: "MANUAL_ENTRY",
        },
        {
          id: item(2).id,
          content: "用户记忆 2",
          category: "preference",
          scope: "PERSONA",
          verificationMethod: "LEGACY_UNREVIEWED",
        },
      ],
    });
    expect(Object.keys(disclosure.items[0]!).sort()).toEqual([
      "category",
      "content",
      "id",
      "scope",
      "verificationMethod",
    ]);
  });

  it("accepts zero references but rejects mismatched counts", () => {
    expect(chatMemoryDisclosureSchema.parse({
      version: 1,
      count: 0,
      items: [],
    })).toEqual({ version: 1, count: 0, items: [] });
    expect(chatMemoryDisclosureSchema.safeParse({
      version: 1,
      count: 1,
      items: [],
    }).success).toBe(false);
  });

  it("matches the exact Memory contents injected into the Prompt", () => {
    const selected = [
      item(1, "用户喜欢 A&B"),
      item(2, "用户使用 <TypeScript>"),
    ];
    const disclosure = createChatMemoryDisclosure(selected);
    const prompt = buildUserMemoryBlock(selected);
    const injected = [...prompt.matchAll(/<memory>(.*?)<\/memory>/g)]
      .map((match) => match[1]);

    expect(injected).toEqual(
      disclosure.items.map((memory) => escapeMemoryXml(memory.content)),
    );
  });

  it("enforces eight items and the 2400-character budget", () => {
    expect(() =>
      createChatMemoryDisclosure(
        Array.from({ length: 9 }, (_, index) => item(index + 1)),
      )).toThrow();
    expect(() =>
      createChatMemoryDisclosure(
        Array.from({ length: 5 }, (_, index) =>
          item(index + 1, "记".repeat(500))),
      )).toThrow();
  });

  it("rejects extra SSE fields instead of accepting diagnostics", () => {
    expect(chatMemoryDisclosureSchema.safeParse({
      version: 1,
      count: 1,
      items: [{
        ...createChatMemoryDisclosure([item(1)]).items[0],
        rrfScore: 0.5,
      }],
    }).success).toBe(false);
    expect(chatMemoryDisclosureSchema.safeParse({
      version: 1,
      count: 0,
      items: [],
      internalCandidateCount: 42,
    }).success).toBe(false);
  });
});
