import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Agent Mode UI and route contracts", () => {
  it("keeps the full Worker panel out of the ordinary Chat initial module graph", () => {
    const messageList = read("features/chat/components/message-list.tsx");
    expect(messageList).toContain("dynamic(");
    expect(messageList).toContain('import("@/features/agents/components/agent-worker-panel")');
    expect(messageList).not.toContain('import { AgentWorkerPanel } from "@/features/agents/components/agent-worker-panel"');
  });

  it("scopes Agent mode to one send and restores rejected optimistic requests", () => {
    const chatLayout = read("features/chat/components/chat-layout.tsx");
    expect(chatLayout).toContain('if (!messageToEdit) setGenerationMode("CHAT")');
    expect(chatLayout).toContain("if (!confirmedBusinessRun)");
    expect(chatLayout).toContain("setMessages(messages)");
    expect(chatLayout).toContain("setGenerationMode(requestedMode)");
  });

  it("prevents deleting a running Agent while preserving owner-scoped deletion", () => {
    const route = read("app/api/agents/[agentRunId]/route.ts");
    const detail = read("features/agents/components/agent-run-detail.tsx");
    expect(route).toContain('ownedRun.status === "PENDING"');
    expect(route).toContain('where: { id: agentRunId, userId, status: { not: "PENDING" } }');
    expect(detail).toContain('run.status === "PENDING"');
    expect(detail).toContain("请先停止 Agent");
  });

  it("keeps dynamic Agent history links from prefetching details", () => {
    expect(read("app/agents/page.tsx")).toContain('prefetch={false}');
    expect(read("features/agents/components/agent-worker-panel.tsx")).toContain('prefetch={false}');
  });
});
