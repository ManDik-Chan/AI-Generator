import { requireAiProviderConfig } from "@/lib/ai/config";
import { createOpenAiCompatibleProvider } from "@/lib/ai/providers/openai-compatible";

export function getAiProvider() {
  const config = requireAiProviderConfig();
  return { config, provider: createOpenAiCompatibleProvider(config) };
}
