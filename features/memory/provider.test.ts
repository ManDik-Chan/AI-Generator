import { describe, expect, it, vi } from "vitest";
import { AiProviderError } from "@/lib/ai/errors";
import type { AiProvider } from "@/lib/ai/types";
import { requestMemoryModelText } from "@/features/memory/provider";

const request = { messages: [{ role: "system" as const, content: "prompt" }], model: "memory-model", temperature: 0.1, maxOutputTokens: 1000 };

function providerFrom(attempts: Array<{ chunks?: string[]; error?: AiProviderError }>) {
  const models: string[] = [];
  const requests: Parameters<AiProvider["streamText"]>[0][] = [];
  const provider: AiProvider = {
    streamText(input) {
      models.push(input.model);
      requests.push(input);
      const attempt = attempts.shift() ?? {};
      return (async function* () {
        for (const chunk of attempt.chunks ?? []) yield chunk;
        if (attempt.error) throw attempt.error;
      })();
    },
  };
  return { provider, models, requests };
}

describe("memory provider retry policy", () => {
  it("falls back once when a dedicated model is NOT_FOUND", async () => {
    const { provider, models } = providerFrom([{ error: new AiProviderError("NOT_FOUND", "missing", 404) }, { chunks: ["{\"operations\":[]}"] }]);
    await expect(requestMemoryModelText({ provider, request, fallbackModel: "shared-model" })).resolves.toMatchObject({ modelUsed: "shared-model" });
    expect(models).toEqual(["memory-model", "shared-model"]);
  });

  it("does not repeat NOT_FOUND when the models are identical", async () => {
    const { provider, models } = providerFrom([{ error: new AiProviderError("NOT_FOUND", "missing", 404) }]);
    await expect(requestMemoryModelText({ provider, request, fallbackModel: "memory-model" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(models).toEqual(["memory-model"]);
  });

  it("retries RATE_LIMITED once after at most two seconds", async () => {
    const { provider, models } = providerFrom([{ error: new AiProviderError("RATE_LIMITED", "slow", 429) }, { chunks: ["ok"] }]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(requestMemoryModelText({ provider, request, fallbackModel: "shared-model", sleep })).resolves.toMatchObject({ text: "ok" });
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(models).toHaveLength(2);
  });

  it("does not retry TIMEOUT or AUTHENTICATION", async () => {
    for (const code of ["TIMEOUT", "AUTHENTICATION"] as const) {
      const { provider, models } = providerFrom([{ error: new AiProviderError(code, "failed", code === "AUTHENTICATION" ? 401 : undefined) }]);
      await expect(requestMemoryModelText({ provider, request, fallbackModel: "shared-model" })).rejects.toMatchObject({ code });
      expect(models).toHaveLength(1);
    }
  });

  it("does not retry or fall back for HTTP 400 INVALID_REQUEST", async () => {
    const { provider, models } = providerFrom([{ error: new AiProviderError("INVALID_REQUEST", "bad request", 400, { providerErrorCode: "bad_parameter", providerMessage: "messages invalid" }) }]);
    await expect(requestMemoryModelText({ provider, request, fallbackModel: "shared-model" })).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
    expect(models).toEqual(["memory-model"]);
  });

  it("keeps partial text from INVALID_RESPONSE for JSON parsing", async () => {
    const { provider } = providerFrom([{ chunks: ["{\"operations\":[]}"], error: new AiProviderError("INVALID_RESPONSE", "missing terminal") }]);
    await expect(requestMemoryModelText({ provider, request, fallbackModel: "shared-model" })).resolves.toMatchObject({ text: "{\"operations\":[]}" });
  });

  it("retries an empty response once with thinking disabled and temperature zero", async () => {
    const { provider, requests } = providerFrom([
      { error: new AiProviderError("REASONING_ONLY_RESPONSE", "reasoning only", undefined, { reasoningCharCount: 120, contentCharCount: 0 }) },
      { chunks: ["{\"operations\":[]}"] },
    ]);
    await expect(requestMemoryModelText({ provider, request, fallbackModel: "shared-model" })).resolves.toMatchObject({ text: "{\"operations\":[]}", modelUsed: "memory-model" });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ model: "memory-model", thinking: "disabled", temperature: 0, messages: request.messages });
  });

  it("stops after one empty-response fallback", async () => {
    const { provider, requests } = providerFrom([
      { error: new AiProviderError("EMPTY_RESPONSE", "empty") },
      { error: new AiProviderError("REASONING_ONLY_RESPONSE", "reasoning only") },
    ]);
    await expect(requestMemoryModelText({ provider, request, fallbackModel: "shared-model" })).rejects.toMatchObject({ code: "REASONING_ONLY_RESPONSE" });
    expect(requests).toHaveLength(2);
  });
});
