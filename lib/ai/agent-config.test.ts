import { describe, expect, it } from "vitest";

import { getAgentConfigurationStatus, getAgentGenerationConfig, getAgentStaleAfterMs } from "@/lib/ai/config";

const base = { AI_BASE_URL: "https://example.com/v1", AI_API_KEY: "secret", AI_MODEL: "base" };

describe("Agent AI configuration", () => {
  it("implements the documented model fallback chains", () => {
    const config = getAgentGenerationConfig({ ...base, AI_TOOL_MODEL: "tool", AI_BRAINSTORM_MODEL: "brain", AI_BRAINSTORM_SYNTHESIS_MODEL: "synth" });
    expect(config.plannerModel).toBe("brain");
    expect(config.workerModel).toBe("brain");
    expect(config.leaderModel).toBe("synth");
  });

  it("prefers dedicated Agent models and clamps total timeout", () => {
    const config = getAgentGenerationConfig({ ...base, AI_AGENT_PLANNER_MODEL: "planner", AI_AGENT_WORKER_MODEL: "worker", AI_AGENT_LEADER_MODEL: "leader", AI_AGENT_TOTAL_TIMEOUT_MS: "999999" });
    expect(config).toMatchObject({ plannerModel: "planner", workerModel: "worker", leaderModel: "leader", totalTimeoutMs: 285000, dailyCredits: 6 });
  });

  it("is build-safe when the service is not configured", () => {
    expect(getAgentConfigurationStatus({})).toMatchObject({ configured: false });
    expect(getAgentStaleAfterMs({})).toBe(300_000);
  });
});
