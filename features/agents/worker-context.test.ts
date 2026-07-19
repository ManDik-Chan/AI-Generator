import { describe, expect, it } from "vitest";

import { buildWorkerContextEnvelope } from "@/features/agents/worker-context";

describe("Agent Worker context isolation", () => {
  it("includes only declared COMPLETE dependency deliverables", () => {
    const envelope = buildWorkerContextEnvelope({
      userProblem: "problem",
      planOverview: "overview",
      assignment: { key: "consumer", title: "Consumer", objective: "Use one", expectedDeliverable: "Result", priority: "HIGH", dependsOnKeys: ["allowed"] },
      workers: [
        { key: "allowed", status: "COMPLETE", workSummary: "safe summary", finalDeliverable: "safe result" },
        { key: "unrelated", status: "COMPLETE", workSummary: "hidden summary", finalDeliverable: "hidden result" },
        { key: "failed", status: "ERROR", workSummary: "failed summary", finalDeliverable: "failed result" },
      ],
      conversationSummary: "minimal conversation",
      personaSummary: "safe persona",
      memorySummary: "minimal memory",
    });
    expect(envelope.dependencyDeliverables).toEqual([{ workerKey: "allowed", summary: "safe summary", result: "safe result" }]);
    expect(JSON.stringify(envelope)).not.toContain("hidden");
    expect(JSON.stringify(envelope)).not.toContain("failed result");
  });

  it("truncates every optional server summary", () => {
    const envelope = buildWorkerContextEnvelope({
      userProblem: "x".repeat(9_000),
      planOverview: "x".repeat(3_000),
      assignment: { key: "one", title: "One", objective: "One", expectedDeliverable: "One", priority: "LOW", dependsOnKeys: [] },
      workers: [],
      conversationSummary: "x".repeat(5_000),
      personaSummary: "x".repeat(2_000),
      memorySummary: "x".repeat(3_000),
    });
    expect(envelope.userProblem).toHaveLength(8_000);
    expect(envelope.planOverview).toHaveLength(2_000);
    expect(envelope.conversationSummary).toHaveLength(4_000);
    expect(envelope.personaSummary).toHaveLength(1_200);
    expect(envelope.memorySummary).toHaveLength(2_400);
  });
});
