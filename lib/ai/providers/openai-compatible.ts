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
    }

    if (typeof choice?.delta?.content === "string" && choice.delta.content) {
      yield choice.delta.content;
    }
  }

  if (!terminalEventReceived) {
    throw new AiProviderError("INVALID_RESPONSE", "Provider stream ended before a terminal event.");
  }
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
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw errorForStatus(response.status);
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
