import { describe, expect, it } from "vitest";

import { getAiConfigurationStatus, getAiRuntimeLimits, requireAiProviderConfig } from "@/lib/ai/config";

describe("AI configuration", () => {
  it("reports missing required server configuration", () => {
    expect(getAiConfigurationStatus({})).toEqual({
      configured: false,
      missing: ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL"],
      providerSupported: true,
    });
    expect(() => requireAiProviderConfig({})).toThrow("AI provider configuration is incomplete");
  });

  it("accepts an OpenAI-compatible configuration without provider-specific fields", () => {
    const result = requireAiProviderConfig({ AI_BASE_URL: "https://example.com/v1", AI_API_KEY: "secret", AI_MODEL: "model" });
    expect(result).toMatchObject({ provider: "openai-compatible", model: "model", temperature: 0.7, maxOutputTokens: 4096 });
  });

  it("uses safe defaults for invalid runtime limits", () => {
    expect(getAiRuntimeLimits({ AI_DAILY_MESSAGE_LIMIT: "0", AI_MAX_INPUT_CHARS: "invalid" })).toEqual({ dailyMessageLimit: 50, maxInputChars: 8000 });
  });
});
