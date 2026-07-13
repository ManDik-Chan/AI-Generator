import { EmbeddingProviderError } from "@/lib/ai/embeddings/errors";
import type { EmbeddingProviderConfig, MemorySemanticConfig, MemorySemanticMode } from "@/lib/ai/embeddings/types";

type Environment = Record<string, string | undefined>;
export const MEMORY_EMBEDDING_DIMENSIONS = 512 as const;

function boundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function getEmbeddingConfigurationStatus(env: Environment = process.env) {
  const baseUrl = env.AI_EMBEDDING_BASE_URL?.trim() || env.AI_BASE_URL?.trim() || "";
  const apiKey = env.AI_EMBEDDING_API_KEY?.trim() || env.AI_API_KEY?.trim() || "";
  const model = env.AI_EMBEDDING_MODEL?.trim() || "embedding-3";
  const configuredDimensions = boundedNumber(env.AI_EMBEDDING_DIMENSIONS, MEMORY_EMBEDDING_DIMENSIONS, 1, 100_000);
  const missing = [!baseUrl && "AI_EMBEDDING_BASE_URL/AI_BASE_URL", !apiKey && "AI_EMBEDDING_API_KEY/AI_API_KEY"].filter(Boolean) as string[];
  return { configured: missing.length === 0 && configuredDimensions === MEMORY_EMBEDDING_DIMENSIONS, missing, model, dimensions: configuredDimensions };
}

export function requireEmbeddingProviderConfig(env: Environment = process.env): EmbeddingProviderConfig {
  const status = getEmbeddingConfigurationStatus(env);
  if (!status.configured) throw new EmbeddingProviderError("CONFIGURATION", "Embedding provider configuration is incomplete or dimensions are unsupported.");
  return {
    baseUrl: env.AI_EMBEDDING_BASE_URL?.trim() || env.AI_BASE_URL!.trim(),
    apiKey: env.AI_EMBEDDING_API_KEY?.trim() || env.AI_API_KEY!.trim(),
    model: status.model,
    dimensions: MEMORY_EMBEDDING_DIMENSIONS,
    timeoutMs: boundedNumber(env.AI_EMBEDDING_TIMEOUT_MS, 15_000, 1_000, 120_000),
  };
}

export function getMemorySemanticConfig(env: Environment = process.env): MemorySemanticConfig {
  const rawMode = env.MEMORY_SEMANTIC_MODE?.trim();
  const mode: MemorySemanticMode = rawMode === "off" || rawMode === "always" ? rawMode : "adaptive";
  return {
    mode,
    threshold: boundedNumber(env.MEMORY_SEMANTIC_THRESHOLD, 0.55, 0, 1),
    maxCandidates: Math.floor(boundedNumber(env.MEMORY_SEMANTIC_MAX_CANDIDATES, 20, 1, 50)),
  };
}
