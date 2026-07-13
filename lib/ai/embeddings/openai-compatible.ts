import { EmbeddingProviderError } from "@/lib/ai/embeddings/errors";
import type { EmbeddingProvider, EmbeddingProviderConfig, EmbeddingRequest } from "@/lib/ai/embeddings/types";

interface Options { fetchImplementation?: typeof fetch }

export function buildEmbeddingsUrl(baseUrl: string) {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new EmbeddingProviderError("CONFIGURATION", "Embedding base URL is invalid."); }
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) throw new EmbeddingProviderError("CONFIGURATION", "Embedding base URL is invalid.");
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = `${path || "/v1"}/embeddings`.replace(/\/{2,}/g, "/");
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function validateEmbeddingVector(value: unknown, dimensions: number): number[] {
  if (!Array.isArray(value) || value.length !== dimensions || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    throw new EmbeddingProviderError("INVALID_RESPONSE", "Embedding vector has an invalid dimension or value.");
  }
  return value as number[];
}

export function parseEmbeddingResponse(payload: unknown, inputCount: number, dimensions: number) {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) throw new EmbeddingProviderError("INVALID_RESPONSE", "Embedding response data is missing.");
  const data = (payload as { data: unknown[] }).data;
  if (data.length !== inputCount || data.length === 0) throw new EmbeddingProviderError("INVALID_RESPONSE", "Embedding response count is invalid.");
  const ordered: number[][] = new Array(inputCount);
  for (const item of data) {
    if (!item || typeof item !== "object") throw new EmbeddingProviderError("INVALID_RESPONSE", "Embedding response item is invalid.");
    const { index, embedding } = item as { index?: unknown; embedding?: unknown };
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= inputCount || ordered[index as number]) throw new EmbeddingProviderError("INVALID_RESPONSE", "Embedding response index is invalid.");
    ordered[index as number] = validateEmbeddingVector(embedding, dimensions);
  }
  if (ordered.some((embedding) => !embedding)) throw new EmbeddingProviderError("INVALID_RESPONSE", "Embedding response indexes are incomplete.");
  return ordered;
}

function statusError(status: number) {
  if (status === 401 || status === 403) return new EmbeddingProviderError("AUTHENTICATION", "Embedding provider authentication failed.", status);
  if (status === 404) return new EmbeddingProviderError("NOT_FOUND", "Embedding endpoint or model was not found.", status);
  if (status === 429) return new EmbeddingProviderError("RATE_LIMITED", "Embedding provider rate limit exceeded.", status);
  if (status >= 500) return new EmbeddingProviderError("UNAVAILABLE", "Embedding provider is unavailable.", status);
  return new EmbeddingProviderError("UNKNOWN", "Embedding provider request failed.", status);
}

export function createOpenAiCompatibleEmbeddingProvider(config: EmbeddingProviderConfig, options: Options = {}): EmbeddingProvider {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  return {
    async embed(request: EmbeddingRequest) {
      const inputs = typeof request.input === "string" ? [request.input] : request.input;
      if (!inputs.length || inputs.length > 32 || inputs.some((input) => typeof input !== "string" || !input.trim())) throw new EmbeddingProviderError("CONFIGURATION", "Embedding input must contain 1 to 32 non-empty strings.");
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeoutMs);
      const abortFromCaller = () => controller.abort();
      request.signal?.addEventListener("abort", abortFromCaller, { once: true });
      try {
        const response = await fetchImplementation(buildEmbeddingsUrl(config.baseUrl), {
          method: "POST",
          headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: request.model, input: request.input, dimensions: request.dimensions }),
          signal: controller.signal,
        });
        if (!response.ok) throw statusError(response.status);
        let payload: unknown;
        try { payload = await response.json(); } catch { throw new EmbeddingProviderError("INVALID_RESPONSE", "Embedding provider returned invalid JSON."); }
        return parseEmbeddingResponse(payload, inputs.length, request.dimensions);
      } catch (error) {
        if (error instanceof EmbeddingProviderError) throw error;
        if (controller.signal.aborted) throw new EmbeddingProviderError(timedOut ? "TIMEOUT" : "UNAVAILABLE", timedOut ? "Embedding request timed out." : "Embedding request aborted.");
        throw new EmbeddingProviderError("UNAVAILABLE", "Unable to connect to embedding provider.");
      } finally {
        clearTimeout(timeout);
        request.signal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}
