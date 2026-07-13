import { AiProviderError } from "@/lib/ai/errors";
import { buildChatCompletionsUrl, parseOpenAiCompatibleSse } from "@/lib/ai/providers/openai-compatible";
import type { VisionConfig, VisionProvider, VisionRequest } from "@/lib/ai/vision/types";

function statusError(status: number) {
  if (status === 401 || status === 403) return new AiProviderError("AUTHENTICATION", "Vision provider authentication failed", status);
  if (status === 404) return new AiProviderError("NOT_FOUND", "Vision model was not found", status);
  if (status === 429) return new AiProviderError("RATE_LIMITED", "Vision provider rate limited", status);
  if (status >= 500) return new AiProviderError("UNAVAILABLE", "Vision provider unavailable", status);
  return new AiProviderError(status === 400 ? "INVALID_REQUEST" : "UNKNOWN", "Vision provider rejected request", status);
}

export function createOpenAiCompatibleVisionProvider(config: VisionConfig, fetcher: typeof fetch = fetch): VisionProvider {
  return { async *streamImageAnalysis(request: VisionRequest) {
    const controller = new AbortController(); let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, config.requestTimeoutMs);
    const abort = () => controller.abort(); request.signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetcher(buildChatCompletionsUrl(config.baseUrl), {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.model, stream: true, temperature: config.temperature, max_tokens: config.maxOutputTokens, thinking: { type: "disabled" }, messages: [
          { role: "system", content: request.system },
          { role: "user", content: [
            { type: "text", text: request.question },
            { type: "image_url", image_url: { url: `data:${request.mimeType};base64,${Buffer.from(request.image).toString("base64")}`, detail: "auto" } },
          ] },
        ] }),
      });
      if (!response.ok) throw statusError(response.status);
      if (!response.body) throw new AiProviderError("INVALID_RESPONSE", "Vision response had no stream");
      yield* parseOpenAiCompatibleSse(response.body, controller.signal);
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (controller.signal.aborted) throw new AiProviderError(timedOut ? "TIMEOUT" : "ABORTED", "Vision request aborted");
      throw new AiProviderError("UNAVAILABLE", "Unable to connect to vision provider");
    } finally { clearTimeout(timer); request.signal?.removeEventListener("abort", abort); }
  } };
}
