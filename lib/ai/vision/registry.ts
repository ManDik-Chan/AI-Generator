import { requireVisionConfig } from "@/lib/ai/vision/config";
import { createOpenAiCompatibleVisionProvider } from "@/lib/ai/vision/openai-compatible";

export function getVisionProvider() {
  const config = requireVisionConfig();
  return { config, provider: createOpenAiCompatibleVisionProvider(config) };
}
