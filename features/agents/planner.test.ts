import { describe, expect, it } from "vitest";

import { createAgentPlanWithFallback } from "@/features/agents/planner";
import type { AgentGenerationConfig, AiProvider } from "@/lib/ai/types";

const config: AgentGenerationConfig = {
  plannerModel: "planner",
  workerModel: "worker",
  leaderModel: "leader",
  temperature: 0.5,
  plannerMaxOutputTokens: 1200,
  workerMaxOutputTokens: 1800,
  leaderMaxOutputTokens: 3200,
  requestTimeoutMs: 120000,
  totalTimeoutMs: 285000,
  dailyCredits: 6,
  plannerModelSource: "agent-planner",
  workerModelSource: "agent-worker",
  leaderModelSource: "agent-leader",
};

function providerFor(text: string, calls: string[]): AiProvider {
  return {
    async *streamText() {
      calls.push("call");
      yield text;
    },
  };
}

const validPlan = JSON.stringify({
  overview: "Dynamic architecture plan",
  workers: [
    { key: "architecture", name: "Architecture Worker", title: "Design", objective: "Design architecture", expectedDeliverable: "Architecture", priority: "HIGH", dependsOn: [] },
    { key: "security", name: "Security Worker", title: "Audit", objective: "Audit security", expectedDeliverable: "Threats", priority: "HIGH", dependsOn: [] },
    { key: "performance", name: "Performance Worker", title: "Measure", objective: "Analyze performance", expectedDeliverable: "Bottlenecks", priority: "MEDIUM", dependsOn: [] },
    { key: "delivery", name: "Delivery Worker", title: "Plan", objective: "Plan delivery", expectedDeliverable: "Milestones", priority: "MEDIUM", dependsOn: ["architecture"] },
  ],
});

describe("Agent Planner fallback", () => {
  it("accepts a strict dynamic plan with one Provider call", async () => {
    const calls: string[] = [];
    const result = await createAgentPlanWithFallback({
      provider: providerFor(validPlan, calls),
      config,
      context: { userProblem: "Design a system", mode: "STANDARD" },
    });
    expect(calls).toHaveLength(1);
    expect(result.fallback).toBe(false);
    expect(result.plan.workers[0].key).toBe("architecture");
  });

  it.each([
    ["invalid JSON", "not json"],
    ["markdown wrapper", `\`\`\`json\n${validPlan}\n\`\`\``],
    ["forbidden field", JSON.stringify({ ...JSON.parse(validPlan), model: "override" })],
  ])("uses deterministic fallback for %s without retry", async (_name, output) => {
    const calls: string[] = [];
    const result = await createAgentPlanWithFallback({
      provider: providerFor(output, calls),
      config,
      context: { userProblem: "Design a system", mode: "STANDARD" },
    });
    expect(calls).toHaveLength(1);
    expect(result.fallback).toBe(true);
    expect(result.plan.workers).toHaveLength(4);
  });

  it("uses fallback after a Provider failure without retry", async () => {
    let calls = 0;
    const provider: AiProvider = { async *streamText() { calls += 1; throw new Error("failed"); } };
    const result = await createAgentPlanWithFallback({ provider, config, context: { userProblem: "Plan", mode: "DEEP" } });
    expect(calls).toBe(1);
    expect(result.fallback).toBe(true);
    expect(result.plan.workers).toHaveLength(6);
  });
});
