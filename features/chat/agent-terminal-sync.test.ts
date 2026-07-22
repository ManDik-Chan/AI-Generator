import { describe, expect, it } from "vitest";

import type { AgentRunTerminalSnapshot } from "@/features/agents/client-types";
import { applyAgentTerminalMessage } from "@/features/chat/client-state";
import type { ChatMessageView } from "@/features/chat/types";

function terminal(status: "COMPLETE" | "ERROR" | "CANCELLED", content = "final answer") {
  return {
    id: "run-a",
    conversationId: "conversation-a",
    assistantMessageId: "assistant-a",
    status,
    assistantMessage: { content, status, createdAt: "2026-07-19T00:00:00.000Z" },
  } as AgentRunTerminalSnapshot;
}

const pendingMessage: ChatMessageView = {
  id: "assistant-a",
  role: "assistant",
  content: "",
  status: "pending",
  createdAt: "2026-07-19T00:00:00.000Z",
};

describe("Agent terminal message synchronization", () => {
  it("hydrates the existing Assistant message immediately without adding a duplicate", () => {
    const messages = applyAgentTerminalMessage([pendingMessage], terminal("COMPLETE"));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ id: "assistant-a", content: "final answer", status: "complete" });
  });

  it.each(["ERROR", "CANCELLED"] as const)("syncs %s without inventing answer content", (status) => {
    const messages = applyAgentTerminalMessage([pendingMessage], terminal(status, ""));
    expect(messages).toEqual([{ ...pendingMessage, content: "", status: status.toLowerCase() }]);
  });

  it("cannot write Conversation A terminal content into Conversation B", () => {
    const conversationB: ChatMessageView[] = [{ ...pendingMessage, id: "assistant-b", content: "B answer" }];
    expect(applyAgentTerminalMessage(conversationB, terminal("COMPLETE"))).toEqual(conversationB);
  });

  it("hydrates Conversation A when its own message list is restored", () => {
    const restored = applyAgentTerminalMessage([pendingMessage], terminal("COMPLETE", "A restored answer"));
    expect(restored[0].content).toBe("A restored answer");
  });
});
