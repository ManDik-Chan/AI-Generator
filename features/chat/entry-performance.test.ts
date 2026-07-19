import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Chat entry performance boundaries", () => {
  it("keeps new Chat server rendering free of sidebar, Persona, and Agent queries", () => {
    const page = read("app/chat/page.tsx");
    expect(page).not.toContain("getConversationList");
    expect(page).not.toContain("getActivePersonaChoices");
    expect(page).not.toContain("getConversationAgentRuns");
    expect(page).toContain("requireUser()");
    expect(page).toContain("conversations={[]}");
  });

  it("keeps existing Chat free of full Agent snapshots and the global sidebar query", () => {
    const page = read("app/chat/[conversationId]/page.tsx");
    expect(page).toContain("getConversationDetail");
    expect(page).not.toContain("getConversationList");
    expect(page).not.toContain("getConversationAgentRuns");
  });

  it("renders an immediate Lumen Chat shell fallback with a composer-shaped surface", () => {
    const loading = read("app/chat/loading.tsx");
    expect(loading).toContain("data-chat-loading-shell");
    expect(loading).toContain("premium-panel-strong");
    expect(loading).toContain("正在准备对话空间");
  });

  it("loads non-critical navigation data after the interactive ChatLayout mounts", () => {
    const layout = read("features/chat/components/chat-layout.tsx");
    expect(layout).toContain("/api/chat/bootstrap");
    expect(layout).toContain("return () => controller.abort()");
    expect(layout).toContain("loading={bootstrapLoading}");
  });
});
