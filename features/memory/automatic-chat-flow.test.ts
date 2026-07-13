import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/chat/route.ts", "utf8");
const layout = readFileSync("features/chat/components/chat-layout.tsx", "utf8");

describe("non-blocking automatic memory chat flow", () => {
  it("emits done before registering after and only on successful finalization", () => {
    const done = route.indexOf('encodeChatSse("done"');
    const schedule = route.indexOf("scheduleMemoryExtraction(after");
    expect(done).toBeGreaterThan(-1);
    expect(schedule).toBeGreaterThan(done);
    expect(route).toContain("if (finalized && (profile?.memoryEnabled ?? true))");
  });

  it("does not schedule extraction in stop or provider error handling", () => {
    expect(route.match(/scheduleMemoryExtraction\(/g)).toHaveLength(1);
    expect(route.indexOf("scheduleMemoryExtraction")).toBeLessThan(route.indexOf("} catch (error)"));
  });

  it("keeps chat state and uses shallow history for a new conversation", () => {
    expect(layout).toContain("window.history.replaceState");
    expect(layout).toContain("activeConversationRef.current.id");
    expect(layout).not.toContain("router.refresh");
    expect(layout).not.toContain("router.replace");
    expect(layout).not.toContain("setMessages(conversation");
  });

  it("does not expose a route-level full-screen loading boundary", () => {
    expect(existsSync("app/chat/loading.tsx")).toBe(false);
  });
});
