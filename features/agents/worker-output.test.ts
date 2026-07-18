import { describe, expect, it } from "vitest";

import { collectWorkerDeliverable } from "@/features/agents/worker-output";
import type { AgentGenerationConfig, AiProvider } from "@/lib/ai/types";

const config: AgentGenerationConfig = {
  plannerModel: "planner", workerModel: "worker", leaderModel: "leader", temperature: 0.5,
  plannerMaxOutputTokens: 1200, workerMaxOutputTokens: 1800, leaderMaxOutputTokens: 3200,
  requestTimeoutMs: 120000, totalTimeoutMs: 285000, dailyCredits: 6,
  plannerModelSource: "agent-planner", workerModelSource: "agent-worker", leaderModelSource: "agent-leader",
};
const context = {
  userProblem: "problem", planOverview: "overview",
  assignment: { key: "worker", title: "Worker", objective: "Analyze", expectedDeliverable: "Report", priority: "HIGH" },
  dependencyDeliverables: [],
};
function provider(text: string): AiProvider { return { async *streamText() { yield text; } }; }

describe("Agent Worker deliverable protocol", () => {
  it("accepts strict guarded structured output", async () => {
    const result = await collectWorkerDeliverable({
      provider: provider(JSON.stringify({ workSummary: "Completed review", findings: ["Finding"], assumptions: [], risks: ["Risk"], recommendations: ["Action"], finalDeliverable: "Report" })),
      config,
      context,
    });
    expect(result).toMatchObject({ structured: true, findings: ["Finding"], finalDeliverable: "Report" });
  });

  it("persists safe invalid JSON as structured=false without fabricated arrays", async () => {
    const result = await collectWorkerDeliverable({ provider: provider("A safe plain-text deliverable"), config, context });
    expect(result).toMatchObject({ structured: false, findings: [], assumptions: [], risks: [], recommendations: [] });
    expect(result.finalDeliverable).toBe("A safe plain-text deliverable");
  });

  it("rejects credential leakage before persistence", async () => {
    await expect(collectWorkerDeliverable({
      provider: provider("DATABASE_URL=postgresql://user:very-secret-password@example.com/db"),
      config,
      context,
    })).rejects.toMatchObject({ name: "UnsafeToolOutputError" });
  });
});
