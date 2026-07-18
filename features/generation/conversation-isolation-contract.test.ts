import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync("features/chat/components/chat-layout.tsx", "utf8");
const newChat = readFileSync("app/chat/page.tsx", "utf8");
const existingChat = readFileSync("app/chat/[conversationId]/page.tsx", "utf8");
const signOut = readFileSync("features/auth/components/sign-out-form.tsx", "utf8");

describe("Conversation generation isolation wiring", () => {
  it("remounts Chat state at Conversation boundaries and scopes recovery by viewer", () => {
    expect(newChat).toContain("key={conversationKey}");
    expect(existingChat).toContain("key={conversation.id}");
    expect(layout).toContain("readConversationGeneration(sessionStorage, viewerId, conversationKey)");
    expect(layout).toContain("migrateConversationGeneration(sessionStorage, viewerId");
    expect(layout).not.toContain('storageKey: "chat-generation"');
    expect(layout).not.toContain('storageKey: "agent-generation"');
  });

  it("does not let an unmounted Conversation rewrite the active browser URL", () => {
    expect(layout.match(/firstConfirmation && mountedRef\.current/g)).toHaveLength(2);
  });

  it("clears the bounded registry before logout", () => {
    expect(signOut).toContain("clearChatGenerationRegistry()");
  });
});
