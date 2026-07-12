import { describe, expect, it, vi } from "vitest";
import { scheduleMemoryExtraction } from "@/features/memory/after";

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
    expect(warning).toHaveBeenCalledWith("memory_extraction_failed", { requestId: "r", userId: "u", conversationId: "c", sourceMessageId: "m", errorCode: "Error" });
    expect(JSON.stringify(warning.mock.calls)).not.toContain("secret body");
    warning.mockRestore();
  });
});
