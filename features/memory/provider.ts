import { AiProviderError } from "@/lib/ai/errors";
import type { AiProvider, AiStreamRequest } from "@/lib/ai/types";

interface MemoryProviderRequest {
  provider: AiProvider;
  request: AiStreamRequest;
  fallbackModel: string;
  allowProviderRetry?: boolean;
  sleep?: (milliseconds: number) => Promise<void>;
}

async function collectMemoryProviderText(provider: AiProvider, request: AiStreamRequest) {
  let text = "";
  try {
    for await (const chunk of provider.streamText(request)) text += chunk;
  } catch (error) {
    if (error instanceof AiProviderError && ["INVALID_RESPONSE", "EMPTY_RESPONSE"].includes(error.code) && text.trim()) return text.trim();
    throw error;
  }
  if (!text.trim()) throw new AiProviderError("EMPTY_RESPONSE", "Memory provider returned no text.");
  return text.trim();
}

export async function requestMemoryModelText({
  provider,
  request,
  fallbackModel,
  allowProviderRetry = true,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: MemoryProviderRequest) {
  const attempt = (model: string) => collectMemoryProviderText(provider, { ...request, model });
  try {
    return { text: await attempt(request.model), modelUsed: request.model };
  } catch (error) {
    if (!(error instanceof AiProviderError) || !allowProviderRetry) throw error;
    if (error.code === "NOT_FOUND" && request.model !== fallbackModel) {
      return { text: await attempt(fallbackModel), modelUsed: fallbackModel };
    }
    if (error.code === "RATE_LIMITED") {
      await sleep(2_000);
      return { text: await attempt(request.model), modelUsed: request.model };
    }
    throw error;
  }
}
