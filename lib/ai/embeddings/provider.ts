import { requireEmbeddingProviderConfig } from "@/lib/ai/embeddings/config";
import { createOpenAiCompatibleEmbeddingProvider } from "@/lib/ai/embeddings/openai-compatible";

export function getEmbeddingProvider() {
  const config = requireEmbeddingProviderConfig();
  return { config, provider: createOpenAiCompatibleEmbeddingProvider(config) };
}
