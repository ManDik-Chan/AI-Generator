import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/database/prisma", () => ({
  prisma: { agentRun: { findFirst: mocks.findFirst } },
}));

import { getOwnedAgentRunStatus } from "@/features/agents/queries";

describe("Agent status query", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses one owner-scoped compact query without Event, Credits, content, or deliverables", async () => {
    const now = new Date("2026-07-19T00:00:00Z");
    mocks.findFirst.mockResolvedValue({
      id: "run-1", conversationId: "conversation-1", userMessageId: "user-message", assistantMessageId: "assistant-message",
      mode: "STANDARD", status: "PENDING", phase: "WORKING", planOverview: "Plan", planFallback: false,
      plannedWorkerCount: 4, completedWorkerCount: 1, successfulWorkerCount: 1, providerCallCount: 3, errorCode: null,
      startedAt: now, completedAt: null, createdAt: now, updatedAt: now,
      assistantMessage: { status: "PENDING", createdAt: now },
      workers: [{
        key: "worker-a", position: 0, name: "A", title: "Title", objective: "Objective", expectedDeliverable: "Expected",
        priority: "HIGH", status: "RUNNING", dependsOnKeys: [], errorCode: null,
        startedAt: now, completedAt: null, createdAt: now, updatedAt: now,
      }],
    });

    const snapshot = await getOwnedAgentRunStatus("user-1", "run-1");

    expect(mocks.findFirst).toHaveBeenCalledOnce();
    const request = mocks.findFirst.mock.calls[0][0];
    expect(request.where).toEqual({ id: "run-1", userId: "user-1" });
    expect(request.select).not.toHaveProperty("events");
    expect(request.select).not.toHaveProperty("conversation");
    expect(request.select).not.toHaveProperty("userMessage");
    expect(request.select.assistantMessage.select).not.toHaveProperty("content");
    expect(request.select.workers.select).not.toHaveProperty("finalDeliverable");
    expect(request.select.workers.select).not.toHaveProperty("findings");
    expect(snapshot).toMatchObject({ id: "run-1", startedAt: now.toISOString(), workers: [{ key: "worker-a", status: "RUNNING" }] });
  });
});
