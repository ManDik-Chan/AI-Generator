import { AiProviderError } from "@/lib/ai/errors";
import type { AiProvider, AiStreamRequest } from "@/lib/ai/types";

export async function collectGeneratedText(provider: AiProvider, request: AiStreamRequest) {
  let text = "";
  for await (const chunk of provider.streamText(request)) text += chunk;
  if (!text.trim()) throw new AiProviderError("EMPTY_RESPONSE", "Provider returned no text.");
  return text.trim();
}
