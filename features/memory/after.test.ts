import { describe, expect, it, vi } from "vitest";
import { scheduleMemoryExtraction } from "@/features/memory/after";
import { MemoryExtractionFailure } from "@/features/memory/diagnostics";
import { AiProviderError } from "@/lib/ai/errors";

describe("Next after memory scheduling", () => {
  it("registers without awaiting the extraction task", async () => {
    let callback: (() => Promise<void>) | undefined;
    const task = vi.fn(() => new Promise<void>(() => undefined));
    scheduleMemoryExtraction((scheduled) => { callback = scheduled; }, task, { requestId: "r", userId: "u", conversationId: "c", sourceMessageId: "m" });
    expect(task).not.toHaveBeenCalled();
    callback?.();
    expect(task).toHaveBeenCalledOnce();
  });

  it("catches background errors with safe identifiers only", async () => {
    let callback: (() => Promise<void>) | undefined;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    scheduleMemoryExtraction((scheduled) => { callback = scheduled; }, async () => { throw new Error("secret body"); }, { requestId: "r", userId: "u", conversationId: "c", sourceMessageId: "m" });
    await callback?.();
    expect(warning).toHaveBeenCalledWith("memory_extraction_failed", expect.objectContaining({ requestId: "r", userId: "u", conversationId: "c", sourceMessageId: "m", stage: "persist", errorCode: "Error" }));
    expect(JSON.stringify(warning.mock.calls)).not.toContain("secret body");
    warning.mockRestore();
  });

  it("logs the real provider code and status without prompt or credentials", async () => {
    let callback: (() => Promise<void>) | undefined;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failure = new MemoryExtractionFailure("provider_request", new AiProviderError("INVALID_REQUEST", "Bearer secret-key prompt-body", 400, { providerErrorCode: "bad_messages", providerMessage: "messages invalid" }), "PREVIOUS_CONTEXT", "memory-model");
    scheduleMemoryExtraction((scheduled) => { callback = scheduled; }, async () => { throw failure; }, { requestId: "r", userId: "u", conversationId: "c", sourceMessageId: "m" });
    await callback?.();
    expect(warning).toHaveBeenCalledWith("memory_extraction_failed", { requestId: "r", userId: "u", conversationId: "c", sourceMessageId: "m", stage: "provider_request", explicitIntent: "PREVIOUS_CONTEXT", providerCode: "INVALID_REQUEST", providerStatus: 400, providerErrorCode: "bad_messages", providerMessage: "messages invalid", configuredModel: "memory-model" });
    const logged = JSON.stringify(warning.mock.calls);
    expect(logged).not.toContain("secret-key");
    expect(logged).not.toContain("prompt-body");
    warning.mockRestore();
  });
});
