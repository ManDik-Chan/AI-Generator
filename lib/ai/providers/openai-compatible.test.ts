import { describe, expect, it } from "vitest";

import { AiProviderError } from "@/lib/ai/errors";
import { buildChatCompletionsUrl, createOpenAiCompatibleProvider, parseOpenAiCompatibleSse } from "@/lib/ai/providers/openai-compatible";
import type { AiProviderConfig } from "@/lib/ai/types";

const config: AiProviderConfig = {
  provider: "openai-compatible",
  baseUrl: "https://example.com/v1",
  apiKey: "test-only-key",
  model: "test-model",
  temperature: 0.7,
  maxOutputTokens: 100,
  requestTimeoutMs: 5000,
};

function sseStream(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

async function collect(stream: AsyncIterable<string>) {
  const values: string[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

describe("OpenAI-compatible URL normalization", () => {
  it("adds v1 to an origin-only URL", () => {
    expect(buildChatCompletionsUrl("https://api.example.com")).toBe("https://api.example.com/v1/chat/completions");
  });

  it("does not duplicate an existing v1", () => {
    expect(buildChatCompletionsUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1/chat/completions");
  });

  it("preserves a vendor-specific API root", () => {
    expect(buildChatCompletionsUrl("https://api.example.com/api/paas/v4")).toBe("https://api.example.com/api/paas/v4/chat/completions");
  });
});

describe("OpenAI-compatible SSE parsing", () => {
  it("parses normal and multi-part deltas", async () => {
    const stream = sseStream([
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    await expect(collect(parseOpenAiCompatibleSse(stream))).resolves.toEqual(["你", "好"]);
  });

  it("tolerates split chunks, empty deltas, invalid JSON, usage and reasoning fields", async () => {
    const stream = sseStream([
      'data: {"choices":[{"delta":{}}]}\n\ndata: not-json\n\ndata: {"choices":[{"delta":{"reasoning_content":"hidden"}}],"usage":{"total_tokens":1}}\n\nda',
      'ta: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n',
    ]);
    await expect(collect(parseOpenAiCompatibleSse(stream))).resolves.toEqual(["ok"]);
  });

  it("rejects a stream that ends before DONE or finish_reason", async () => {
    const stream = sseStream(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n']);
    await expect(collect(parseOpenAiCompatibleSse(stream))).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("normalizes an HTTP error without exposing the raw body", async () => {
    const provider = createOpenAiCompatibleProvider(config, {
      fetchImplementation: async () => new Response('{"secret":"raw-provider-error"}', { status: 429 }),
    });
    await expect(collect(provider.streamText({ messages: [], model: config.model, temperature: 0.7, maxOutputTokens: 10 })))
      .rejects.toEqual(expect.objectContaining<Partial<AiProviderError>>({ code: "RATE_LIMITED", status: 429 }));
  });

  it("maps HTTP 400 to a sanitized INVALID_REQUEST diagnostic", async () => {
    const provider = createOpenAiCompatibleProvider(config, {
      fetchImplementation: async () => new Response(JSON.stringify({ error: { code: "1214", message: `Authorization: Bearer ${config.apiKey}; invalid messages https://api.example.com/path?token=secret <current_user_message>private prompt</current_user_message> ${"x".repeat(300)}` } }), { status: 400 }),
    });
    let failure: AiProviderError;
    try {
      await collect(provider.streamText({ messages: [{ role: "system", content: "policy" }, { role: "user", content: "input" }], model: config.model, temperature: 0.1, maxOutputTokens: 10 }));
      throw new Error("Expected provider request to fail.");
    } catch (error) {
      failure = error as AiProviderError;
    }
    expect(failure).toMatchObject({ code: "INVALID_REQUEST", status: 400, diagnostics: { providerErrorCode: "1214" } });
    expect(failure.diagnostics?.providerMessage?.length).toBeLessThanOrEqual(200);
    expect(failure.diagnostics?.providerMessage).not.toContain(config.apiKey);
    expect(failure.diagnostics?.providerMessage).not.toContain("private prompt");
    expect(failure.diagnostics?.providerMessage).not.toContain("?token=secret");
  });
});
