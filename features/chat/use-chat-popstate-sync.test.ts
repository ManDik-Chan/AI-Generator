import { describe, expect, it } from "vitest";

import { shouldRefreshPoppedChatRoute } from "@/features/chat/use-chat-popstate-sync";

const conversationA = "11111111-1111-4111-8111-111111111111";
const conversationB = "55555555-5555-4555-8555-555555555555";

describe("Chat popstate synchronization", () => {
  it("refreshes when browser history points at a different conversation", () => {
    expect(shouldRefreshPoppedChatRoute(`/chat/${conversationA}`, conversationB)).toBe(true);
    expect(shouldRefreshPoppedChatRoute(`/chat/${conversationA}`)).toBe(true);
    expect(shouldRefreshPoppedChatRoute("/chat", conversationA)).toBe(true);
  });

  it("keeps matching Chat state and unrelated routes untouched", () => {
    expect(shouldRefreshPoppedChatRoute(`/chat/${conversationA}`, conversationA)).toBe(false);
    expect(shouldRefreshPoppedChatRoute("/chat")).toBe(false);
    expect(shouldRefreshPoppedChatRoute("/tools", conversationA)).toBe(false);
  });
});
