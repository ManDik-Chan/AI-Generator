import { describe, expect, it } from "vitest";

import {
  CHAT_GENERATION_REGISTRY_KEY,
  CHAT_GENERATION_REGISTRY_LIMIT,
  clearChatGenerationRegistry,
  migrateConversationGeneration,
  readConversationGeneration,
  updateConversationGeneration,
} from "@/features/generation/conversation-registry";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("Conversation-scoped generation registry", () => {
  it("keeps Chat A and Chat B generation identifiers isolated", () => {
    const storage = memoryStorage();
    updateConversationGeneration(storage, "owner-1", "chat-a", { agentRunId: "agent-a" }, 1);
    updateConversationGeneration(storage, "owner-1", "chat-b", { chatMessageId: "message-b" }, 2);
    expect(readConversationGeneration(storage, "owner-1", "chat-a")).toMatchObject({ agentRunId: "agent-a" });
    expect(readConversationGeneration(storage, "owner-1", "chat-a")?.chatMessageId).toBeUndefined();
    expect(readConversationGeneration(storage, "owner-1", "chat-b")).toMatchObject({ chatMessageId: "message-b" });
  });

  it("migrates a temporary new-chat token after the server confirms its Conversation ID", () => {
    const storage = memoryStorage();
    updateConversationGeneration(storage, "owner-1", "new:token", { agentRunId: "agent-1" }, 1);
    migrateConversationGeneration(storage, "owner-1", "new:token", "chat-1", 2);
    expect(readConversationGeneration(storage, "owner-1", "new:token")).toBeUndefined();
    expect(readConversationGeneration(storage, "owner-1", "chat-1")).toMatchObject({ agentRunId: "agent-1", updatedAt: 2 });
  });

  it("clears mismatched owners and never stores prompt or answer content", () => {
    const storage = memoryStorage();
    updateConversationGeneration(storage, "owner-1", "chat-a", { agentRunId: "agent-a" });
    expect(readConversationGeneration(storage, "owner-2", "chat-a")).toBeUndefined();
    expect(storage.getItem(CHAT_GENERATION_REGISTRY_KEY)).toBeNull();
    updateConversationGeneration(storage, "owner-2", "chat-b", { chatMessageId: "message-b" });
    expect(storage.getItem(CHAT_GENERATION_REGISTRY_KEY)).not.toMatch(/content|prompt|answer/i);
  });

  it("bounds entries and removes terminal fields and logout state", () => {
    const storage = memoryStorage();
    for (let index = 0; index < CHAT_GENERATION_REGISTRY_LIMIT + 4; index += 1) {
      updateConversationGeneration(storage, "owner-1", `chat-${index}`, { agentRunId: `agent-${index}` }, index);
    }
    const persisted = JSON.parse(storage.getItem(CHAT_GENERATION_REGISTRY_KEY)!) as { entries: Record<string, unknown> };
    expect(Object.keys(persisted.entries)).toHaveLength(CHAT_GENERATION_REGISTRY_LIMIT);
    updateConversationGeneration(storage, "owner-1", "chat-27", { agentRunId: null }, 100);
    expect(readConversationGeneration(storage, "owner-1", "chat-27")).toBeUndefined();
    clearChatGenerationRegistry(storage);
    expect(storage.getItem(CHAT_GENERATION_REGISTRY_KEY)).toBeNull();
  });
});
