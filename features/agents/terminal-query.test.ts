import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/database/prisma", () => ({
  prisma: { agentRun: { findFirst: mocks.findFirst } },
}));

import { getOwnedAgentRunTerminal } from "@/features/agents/queries";

describe("Agent terminal query", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads final Assistant content and Worker deliverables without full-detail overhead", async () => {
    const now = new Date("2026-07-19T00:00:00Z");
    mocks.findFirst.mockResolvedValue({
      id: "run-1", conversationId: "conversation-1", userMessageId: "user-message", assistantMessageId: "assistant-message",
      mode: "STANDARD", status: "COMPLETE", phase: "FINISHED", planOverview: "Plan", planFallback: false,
      plannedWorkerCount: 4, completedWorkerCount: 4, successfulWorkerCount: 4, providerCallCount: 6, errorCode: null,
      startedAt: now, completedAt: now, createdAt: now, updatedAt: now,
      assistantMessage: { content: "final answer", status: "COMPLETE", createdAt: now },
      workers: [{
        key: "worker-a", position: 0, name: "A", title: "Title", objective: "Objective", expectedDeliverable: "Expected",
        priority: "HIGH", status: "COMPLETE", dependsOnKeys: [], workSummary: "done", findings: ["fact"], assumptions: [],
        risks: [], recommendations: ["ship"], finalDeliverable: "deliverable", structured: true, errorCode: null,
        startedAt: now, completedAt: now, createdAt: now, updatedAt: now,
      }],
    });

    const snapshot = await getOwnedAgentRunTerminal("user-1", "run-1");
    const request = mocks.findFirst.mock.calls[0][0];
    expect(request.where).toEqual({ id: "run-1", userId: "user-1", status: { not: "PENDING" } });
    expect(request.select.assistantMessage.select).toHaveProperty("content", true);
    expect(request.select.workers.select).toHaveProperty("finalDeliverable", true);
    expect(request.select).not.toHaveProperty("events");
    expect(request.select).not.toHaveProperty("conversation");
    expect(request.select).not.toHaveProperty("userMessage");
    expect(snapshot).toMatchObject({ assistantMessage: { content: "final answer" }, workers: [{ finalDeliverable: "deliverable" }] });
  });
});
