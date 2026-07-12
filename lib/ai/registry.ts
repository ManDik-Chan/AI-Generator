import { getMemoryGenerationConfig, getPersonaGenerationConfig, requireAiProviderConfig } from "@/lib/ai/config";
import { createOpenAiCompatibleProvider } from "@/lib/ai/providers/openai-compatible";

export function getAiProvider() {
  const config = requireAiProviderConfig();
  return { config, provider: createOpenAiCompatibleProvider(config) };
}

export function getPersonaAiProvider() {
  const base = requireAiProviderConfig();
  const generation = getPersonaGenerationConfig();
  return { config: generation, provider: createOpenAiCompatibleProvider({ ...base, requestTimeoutMs: generation.requestTimeoutMs }) };
}

export function getMemoryAiProvider() {
  const base = requireAiProviderConfig();
  const generation = getMemoryGenerationConfig();
  return { config: generation, provider: createOpenAiCompatibleProvider({ ...base, requestTimeoutMs: generation.requestTimeoutMs }) };
}
