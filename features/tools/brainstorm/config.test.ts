import { describe, expect, it } from "vitest";

import { getBrainstormConfigurationStatus, getBrainstormDailyLimit, getBrainstormGenerationConfig } from "@/lib/ai/config";

const base = { AI_BASE_URL: "https://provider.invalid/v1", AI_API_KEY: "test-placeholder", AI_MODEL: "base-model" };

describe("brainstorm configuration", () => {
  it("falls back worker and synthesis models through the documented chain", () => {
    expect(getBrainstormGenerationConfig(base)).toMatchObject({ workerModel: "base-model", synthesisModel: "base-model", workerModelSource: "base", synthesisModelSource: "base" });
    expect(getBrainstormGenerationConfig({ ...base, AI_TOOL_MODEL: "tool-model", AI_BRAINSTORM_MODEL: "worker-model", AI_BRAINSTORM_SYNTHESIS_MODEL: "synthesis-model" })).toMatchObject({ workerModel: "worker-model", synthesisModel: "synthesis-model", workerModelSource: "brainstorm", synthesisModelSource: "synthesis" });
  });

  it("uses the independent daily default without requiring an AI key", () => {
    expect(getBrainstormDailyLimit({})).toBe(3);
    expect(getBrainstormDailyLimit({ AI_DAILY_BRAINSTORM_LIMIT: "7" })).toBe(7);
    expect(getBrainstormConfigurationStatus({})).toMatchObject({ configured: false });
  });

  it("reserves shutdown time by capping the overall run budget below maxDuration", () => {
    expect(getBrainstormGenerationConfig(base).totalTimeoutMs).toBe(285_000);
    expect(getBrainstormGenerationConfig({ ...base, AI_BRAINSTORM_TOTAL_TIMEOUT_MS: "999999" }).totalTimeoutMs).toBe(285_000);
  });
});
