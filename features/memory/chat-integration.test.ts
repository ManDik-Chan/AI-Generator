import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync("app/api/chat/route.ts", "utf8");
const messageItemSource = readFileSync("features/chat/components/message-item.tsx", "utf8");

describe("memory chat integration boundaries", () => {
  it("loads enabled owned memories and emits only the selected count", () => {
    expect(routeSource).toContain("userId: user.id, enabled: true");
    expect(routeSource).toContain('observer.send("memory", { count: selectedMemories.length })');
    expect(routeSource).not.toContain('encodeChatSse("memory", { memories:');
  });

  it("updates lastUsedAt only after the assistant is finalized COMPLETE", () => {
    const finalizedAt = routeSource.indexOf(
      'finalizeAssistantMessage(assistantMessageId, fullContent, "COMPLETE")',
    );
    const updatedAt = routeSource.indexOf("lastUsedAt: new Date()", finalizedAt);
    expect(finalizedAt).toBeGreaterThan(-1);
    expect(updatedAt).toBeGreaterThan(finalizedAt);
  });

  it("keeps memory retrieval best-effort and never logs memory content", () => {
    expect(routeSource).toContain('console.warn("memory_load_failed"');
    expect(routeSource).not.toContain("console.warn(selectedMemories");
  });

  it("does not present manual saving as a per-message primary action", () => {
    expect(messageItemSource).not.toContain("BookmarkPlus");
    expect(messageItemSource).not.toContain("保存为记忆");
  });
});
