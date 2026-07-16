import { describe, expect, it, vi } from "vitest";

import { consumeImageGenerationDraft, parseImageGenerationDraft } from "@/features/tools/image-generation/draft";

describe("image generation history draft", () => {
  it("restores a valid prompt and style", () => {
    expect(parseImageGenerationDraft(JSON.stringify({ input: "山间小屋", options: { style: "CINEMATIC", size: "1280x1280" } }))).toEqual({ prompt: "山间小屋", style: "CINEMATIC" });
  });

  it("safely ignores malformed JSON and invalid styles", () => {
    expect(parseImageGenerationDraft("{" )).toBeNull();
    expect(parseImageGenerationDraft(JSON.stringify({ input: "山间小屋", options: { style: "SYSTEM_OVERRIDE" } }))).toBeNull();
  });

  it("consumes and removes session storage without starting a request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const storage = { getItem: vi.fn().mockReturnValue(JSON.stringify({ input: "海边日落", options: { style: "AUTO" } })), removeItem: vi.fn() };
    expect(consumeImageGenerationDraft(storage)).toEqual({ prompt: "海边日落", style: "AUTO" });
    expect(storage.removeItem).toHaveBeenCalledWith("ai-tool-draft:IMAGE_GENERATE");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
