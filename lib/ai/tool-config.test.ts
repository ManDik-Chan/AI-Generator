import { describe, expect, it } from "vitest";
import { getToolGenerationConfig } from "@/lib/ai/config";

const base = { AI_BASE_URL: "https://api.example.com/v1", AI_API_KEY: "test-key", AI_MODEL: "glm-5.2" };
describe("tool AI config", () => {
  it("falls back to the text model and safe defaults", () => expect(getToolGenerationConfig(base)).toEqual({ model: "glm-5.2", temperature: 0.3, maxOutputTokens: 4096, requestTimeoutMs: 120000, dailyLimit: 30 }));
  it("accepts a dedicated model and validated numeric values", () => expect(getToolGenerationConfig({ ...base, AI_TOOL_MODEL: "tool-model", AI_TOOL_TEMPERATURE: "0.5", AI_TOOL_MAX_OUTPUT_TOKENS: "2048", AI_TOOL_REQUEST_TIMEOUT_MS: "90000", AI_DAILY_TOOL_LIMIT: "12" })).toMatchObject({ model: "tool-model", temperature: 0.5, maxOutputTokens: 2048, requestTimeoutMs: 90000, dailyLimit: 12 }));
  it("rejects unsafe ranges by using defaults", () => expect(getToolGenerationConfig({ ...base, AI_TOOL_TEMPERATURE: "9", AI_TOOL_MAX_OUTPUT_TOKENS: "0", AI_DAILY_TOOL_LIMIT: "0" })).toMatchObject({ temperature: 0.3, maxOutputTokens: 4096, dailyLimit: 30 }));
});
