import { describe, expect, it, vi } from "vitest";
import { AiProviderError } from "@/lib/ai/errors";
import type { AiProvider } from "@/lib/ai/types";
import { requestMemoryModelText } from "@/features/memory/provider";

const request = { messages: [{ role: "system" as const, content: "prompt" }], model: "memory-model", temperature: 0.1, maxOutputTokens: 1000 };

function providerFrom(attempts: Array<{ chunks?: string[]; error?: AiProviderError }>) {
  const models: string[] = [];
  const provider: AiProvider = {
    streamText(input) {
      models.push(input.model);
      const attempt = attempts.shift() ?? {};
      return (async function* () {
        for (const chunk of attempt.chunks ?? []) yield chunk;
        if (attempt.error) throw attempt.error;
      })();
    },
  };
  return { provider, models };
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

  it("keeps partial text from INVALID_RESPONSE for JSON parsing", async () => {
    const { provider } = providerFrom([{ chunks: ["{\"operations\":[]}"], error: new AiProviderError("INVALID_RESPONSE", "missing terminal") }]);
    await expect(requestMemoryModelText({ provider, request, fallbackModel: "shared-model" })).resolves.toMatchObject({ text: "{\"operations\":[]}" });
  });
});
