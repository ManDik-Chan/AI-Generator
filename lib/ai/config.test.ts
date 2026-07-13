import { describe, expect, it } from "vitest";

import { getAiConfigurationStatus, getAiRuntimeLimits, getMemoryGenerationConfig, getPersonaGenerationConfig, requireAiProviderConfig } from "@/lib/ai/config";

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

  it("uses persona overrides while falling back to the same provider model", () => {
    const base = { AI_BASE_URL: "https://example.com/v1", AI_API_KEY: "secret", AI_MODEL: "shared" };
    expect(getPersonaGenerationConfig(base)).toMatchObject({ model: "shared", temperature: 0.8, maxOutputTokens: 1800, requestTimeoutMs: 90000 });
    expect(getPersonaGenerationConfig({ ...base, AI_PERSONA_MODEL: "persona-model", AI_PERSONA_TEMPERATURE: "1.1" })).toMatchObject({ model: "persona-model", temperature: 1.1 });
  });

  it("uses low-cost memory defaults and an optional model override", () => {
    const base = { AI_BASE_URL: "https://example.com/v1", AI_API_KEY: "secret", AI_MODEL: "shared" };
    expect(getMemoryGenerationConfig(base)).toMatchObject({ model: "shared", temperature: 0.1, maxOutputTokens: 1000, requestTimeoutMs: 90000 });
    expect(getMemoryGenerationConfig({ ...base, AI_MEMORY_MODEL: "memory-model", AI_MEMORY_MAX_OUTPUT_TOKENS: "700" })).toMatchObject({ model: "memory-model", maxOutputTokens: 700 });
  });
});
