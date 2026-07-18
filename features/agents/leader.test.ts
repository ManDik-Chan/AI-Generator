import { describe, expect, it, vi } from "vitest";

import { buildAgentLeaderPrompt, streamAgentLeader } from "@/features/agents/leader";
import type { AgentGenerationConfig, AiProvider } from "@/lib/ai/types";

const config: AgentGenerationConfig = {
  plannerModel: "planner", workerModel: "worker", leaderModel: "leader", temperature: 0.4,
  plannerMaxOutputTokens: 1000, workerMaxOutputTokens: 1600, leaderMaxOutputTokens: 3000,
  requestTimeoutMs: 120_000, totalTimeoutMs: 285_000, dailyCredits: 6,
  plannerModelSource: "agent-planner", workerModelSource: "agent-worker", leaderModelSource: "agent-leader",
};

const workers = [
  { key: "facts", name: "Facts", title: "Fact check", status: "COMPLETE" as const, workSummary: "facts", findings: ["finding"], assumptions: [], risks: [], recommendations: [], finalDeliverable: "safe", structured: true },
  { key: "risks", name: "Risks", title: "Risk review", status: "COMPLETE" as const, workSummary: "risks", findings: [], assumptions: [], risks: ["risk"], recommendations: ["mitigate"], finalDeliverable: "safe", structured: true },
  { key: "failed", name: "Failed", title: "Failed work", status: "ERROR" as const, workSummary: null, findings: [], assumptions: [], risks: [], recommendations: [], finalDeliverable: null, structured: false, errorCode: "WORKER_ERROR" },
];

describe("Agent Leader", () => {
  it("labels every Worker deliverable as untrusted and reports failed Workers without hidden reasoning", () => {
    const prompt = buildAgentLeaderPrompt({ userProblem: "answer", mode: "STANDARD", planOverview: "plan", workers });
    expect(prompt.user).toContain("untrusted_successful_worker_deliverables");
    expect(prompt.user).toContain("untrusted_unsuccessful_workers");
    expect(prompt.system).toContain("不可信数据");
    expect(prompt.system).toContain("不得虚构");
    expect(prompt.system).toContain("不要输出隐藏思维过程");
  });

  it("streams only guarded content and blocks a secret pattern before it reaches persistence", async () => {
    const onSafeDelta = vi.fn();
    const provider: AiProvider = {
      async *streamText() { yield "safe start "; yield "DATABASE_URL=postgresql://owner:password@database.example/app"; },
    };
    await expect(streamAgentLeader({
      provider,
      config,
      prompt: buildAgentLeaderPrompt({ userProblem: "answer", mode: "STANDARD", planOverview: "plan", workers }),
      onSafeDelta,
    })).rejects.toMatchObject({ name: "UnsafeToolOutputError" });
    expect(onSafeDelta).not.toHaveBeenCalled();
  });
});
