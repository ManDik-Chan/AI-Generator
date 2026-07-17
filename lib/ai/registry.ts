import { getBrainstormGenerationConfig, getMemoryGenerationConfig, getPersonaGenerationConfig, getToolGenerationConfig, requireAiProviderConfig, requireBrainstormProviderConfig } from "@/lib/ai/config";
import { createOpenAiCompatibleProvider } from "@/lib/ai/providers/openai-compatible";

let memoryConfigLogged = false;

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
  const usesFallbackModel = generation.model === base.model;
  if (process.env.NODE_ENV === "development" && !memoryConfigLogged) {
    memoryConfigLogged = true;
    console.info("Memory AI config", { model: generation.model, timeoutMs: generation.requestTimeoutMs, usesFallbackModel });
  }
  return { config: generation, fallbackModel: base.model, usesFallbackModel, provider: createOpenAiCompatibleProvider({ ...base, requestTimeoutMs: generation.requestTimeoutMs }) };
}

export function getToolAiProvider() {
  const base = requireAiProviderConfig();
  const generation = getToolGenerationConfig();
  return {
    config: generation,
    provider: createOpenAiCompatibleProvider({ ...base, requestTimeoutMs: generation.requestTimeoutMs }),
  };
}

export function getBrainstormAiProvider() {
  const providerConfig = requireBrainstormProviderConfig();
  return {
    config: getBrainstormGenerationConfig(),
    provider: createOpenAiCompatibleProvider(providerConfig),
  };
}
