import { AiProviderError } from "@/lib/ai/errors";
import type { AiProviderConfig, AiRuntimeLimits } from "@/lib/ai/types";

type Environment = Record<string, string | undefined>;

const DEFAULTS = {
  temperature: 0.7,
  maxOutputTokens: 4096,
  dailyMessageLimit: 50,
  maxInputChars: 8000,
  requestTimeoutMs: 120_000,
} as const;

function numberFromEnvironment(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function getAiRuntimeLimits(env: Environment = process.env): AiRuntimeLimits {
  return {
    dailyMessageLimit: numberFromEnvironment(env.AI_DAILY_MESSAGE_LIMIT, DEFAULTS.dailyMessageLimit, 1, 10_000),
    maxInputChars: numberFromEnvironment(env.AI_MAX_INPUT_CHARS, DEFAULTS.maxInputChars, 1, 100_000),
  };
}

export function getAiConfigurationStatus(env: Environment = process.env) {
  const missing = ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL"].filter((key) => !env[key]?.trim());
  const providerSupported = !env.AI_PROVIDER || env.AI_PROVIDER === "openai-compatible";

  return {
    configured: missing.length === 0 && providerSupported,
    missing,
    providerSupported,
  };
}

export function requireAiProviderConfig(env: Environment = process.env): AiProviderConfig {
  const status = getAiConfigurationStatus(env);

  if (!status.configured) {
    throw new AiProviderError("CONFIGURATION", "AI provider configuration is incomplete.");
  }

  return {
    provider: "openai-compatible",
    baseUrl: env.AI_BASE_URL!.trim(),
    apiKey: env.AI_API_KEY!.trim(),
    model: env.AI_MODEL!.trim(),
    temperature: numberFromEnvironment(env.AI_TEMPERATURE, DEFAULTS.temperature, 0, 2),
    maxOutputTokens: numberFromEnvironment(
      env.AI_MAX_OUTPUT_TOKENS,
      DEFAULTS.maxOutputTokens,
      1,
      128_000,
    ),
    requestTimeoutMs: numberFromEnvironment(
      env.AI_REQUEST_TIMEOUT_MS,
      DEFAULTS.requestTimeoutMs,
      1_000,
      600_000,
    ),
  };
}
