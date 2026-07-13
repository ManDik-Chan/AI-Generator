import { AiProviderError } from "@/lib/ai/errors";
import type { AiProvider, AiProviderConfig, AiStreamRequest } from "@/lib/ai/types";

interface OpenAiCompatibleProviderOptions {
  fetchImplementation?: typeof fetch;
}

interface ParsedSseData {
  done: boolean;
  data?: unknown;
}

export function buildChatCompletionsUrl(baseUrl: string) {
  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new AiProviderError("CONFIGURATION", "AI_BASE_URL is invalid.");
  }

  if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) {
    throw new AiProviderError("CONFIGURATION", "AI_BASE_URL is invalid.");
  }

  const path = url.pathname.replace(/\/+$/, "");
  const apiRoot = path === "" ? "/v1" : path;
  url.pathname = `${apiRoot}/chat/completions`.replace(/\/{2,}/g, "/");
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function* parseSseDataStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<ParsedSseData> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        throw new AiProviderError("ABORTED", "Request aborted.");
      }

      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n")
          .trim();

        if (data === "[DONE]") {
          yield { done: true };
        } else if (data) {
          try {
            yield { done: false, data: JSON.parse(data) };
          } catch {
            // Compatibility services may emit non-JSON heartbeats. Ignore them.
          }
        }
        boundary = buffer.indexOf("\n\n");
      }

      if (done) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* parseOpenAiCompatibleSse(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let terminalEventReceived = false;
  let reasoningChunkCount = 0;
  let reasoningCharCount = 0;
  let contentChunkCount = 0;
  let contentCharCount = 0;
  let finishReason: string | undefined;

  for await (const event of parseSseDataStream(stream, signal)) {
    if (event.done) {
      terminalEventReceived = true;
      break;
    }

    const payload = event.data as {
      error?: unknown;
      choices?: Array<{
        delta?: { content?: unknown; reasoning_content?: unknown };
        finish_reason?: unknown;
      }>;
    };

    if (payload?.error) {
      throw new AiProviderError("UNAVAILABLE", "Provider returned a stream error.");
    }

    const choice = payload?.choices?.[0];
    if (choice?.finish_reason != null) {
      terminalEventReceived = true;
      finishReason = String(choice.finish_reason);
    }

    if (typeof choice?.delta?.reasoning_content === "string" && choice.delta.reasoning_content) {
      reasoningChunkCount += 1;
      reasoningCharCount += choice.delta.reasoning_content.length;
    }
    if (typeof choice?.delta?.content === "string" && choice.delta.content) {
      contentChunkCount += 1;
      contentCharCount += choice.delta.content.length;
      yield choice.delta.content;
    }
  }

  if (!terminalEventReceived) {
    throw new AiProviderError("INVALID_RESPONSE", "Provider stream ended before a terminal event.");
  }
  const diagnostics = {
    reasoningChunkCount,
    reasoningCharCount,
    contentChunkCount,
    contentCharCount,
    finishReason,
    terminalEventReceived,
  };
  if (contentCharCount === 0) {
    throw new AiProviderError(
      reasoningCharCount > 0 ? "REASONING_ONLY_RESPONSE" : "EMPTY_RESPONSE",
      reasoningCharCount > 0 ? "Provider returned reasoning without final text." : "Provider returned no text.",
      undefined,
      diagnostics,
    );
  }
}

export function sanitizeProviderErrorMessage(value: string, secrets: string[] = []) {
  let safe = value;
  for (const secret of secrets.filter(Boolean)) safe = safe.split(secret).join("[REDACTED]");
  safe = safe
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/(Authorization|Cookie)\s*[:=]\s*[^,;\n]+/gi, "$1: [REDACTED]")
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]+/gi, "$1?[REDACTED]")
    .replace(/(api[_ -]?key|token|secret)\s*[:=]\s*["']?[^\s,"']+/gi, "$1=[REDACTED]")
    .replace(/<(?:current_user_message|grounded_user_context|assistant_response|existing_memories)[^>]*>[\s\S]*?<\/(?:current_user_message|grounded_user_context|assistant_response|existing_memories)>/gi, "[PROMPT_REDACTED]")
    .replace(/[A-Za-z0-9_-]{40,}/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
  return safe.slice(0, 200);
}

async function invalidRequestError(response: Response, apiKey: string) {
  let providerErrorCode: string | undefined;
  let providerMessage: string | undefined;
  try {
    const raw = await response.text();
    const parsed = JSON.parse(raw) as { error?: { code?: unknown; message?: unknown }; code?: unknown; message?: unknown };
    const detail = parsed.error ?? parsed;
    if (typeof detail.code === "string" || typeof detail.code === "number") providerErrorCode = sanitizeProviderErrorMessage(String(detail.code), [apiKey]).slice(0, 100);
    if (typeof detail.message === "string") providerMessage = sanitizeProviderErrorMessage(detail.message, [apiKey]);
  } catch {
    // A non-JSON provider response is intentionally not retained.
  }
  return new AiProviderError("INVALID_REQUEST", "Provider rejected the request.", response.status, { providerErrorCode, providerMessage });
}

function errorForStatus(status: number) {
  if (status === 401 || status === 403) return new AiProviderError("AUTHENTICATION", "Provider authentication failed.", status);
  if (status === 404) return new AiProviderError("NOT_FOUND", "Provider endpoint or model was not found.", status);
  if (status === 429) return new AiProviderError("RATE_LIMITED", "Provider rate limit exceeded.", status);
  if (status >= 500) return new AiProviderError("UNAVAILABLE", "Provider is unavailable.", status);
  return new AiProviderError("UNKNOWN", "Provider request failed.", status);
}

export function createOpenAiCompatibleProvider(
  config: AiProviderConfig,
  options: OpenAiCompatibleProviderOptions = {},
): AiProvider {
  const fetchImplementation = options.fetchImplementation ?? fetch;

  return {
    async *streamText(request: AiStreamRequest) {
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, config.requestTimeoutMs);
      const abortFromCaller = () => controller.abort();
      request.signal?.addEventListener("abort", abortFromCaller, { once: true });
      let receivedContent = false;

      try {
        const response = await fetchImplementation(buildChatCompletionsUrl(config.baseUrl), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.maxOutputTokens,
            stream: true,
            ...(request.thinking ? { thinking: { type: request.thinking } } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw response.status === 400 ? await invalidRequestError(response, config.apiKey) : errorForStatus(response.status);
        }
        if (!response.body) {
          throw new AiProviderError("INVALID_RESPONSE", "Provider response did not contain a stream.");
        }

        for await (const delta of parseOpenAiCompatibleSse(response.body, controller.signal)) {
          receivedContent = true;
          yield delta;
        }

        if (!receivedContent) {
          throw new AiProviderError("EMPTY_RESPONSE", "Provider returned no text.");
        }
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        if (controller.signal.aborted) {
          throw new AiProviderError(timedOut ? "TIMEOUT" : "ABORTED", timedOut ? "Provider request timed out." : "Request aborted.");
        }
        throw new AiProviderError("UNAVAILABLE", "Unable to connect to provider.");
      } finally {
        clearTimeout(timeout);
        request.signal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}
