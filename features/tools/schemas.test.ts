import { describe, expect, it } from "vitest";
import { toolRunRequestSchema } from "@/features/tools/schemas";

const summarize = { tool: "SUMMARIZE", input: "需要总结的文本", options: { length: "standard", format: "paragraph", language: "auto" }, saveHistory: true };
describe("tool request schemas", () => {
  it("accepts each supported tool with filtered options", () => {
    expect(toolRunRequestSchema.safeParse(summarize).success).toBe(true);
    expect(toolRunRequestSchema.safeParse({ tool: "REWRITE", input: "text", options: { style: "formal", intensity: "light", preserveMarkdown: true, keepLength: false, explainChanges: false }, saveHistory: false }).success).toBe(true);
    expect(toolRunRequestSchema.safeParse({ tool: "TRANSLATE", input: "text", options: { sourceLanguage: "auto", targetLanguage: "zh-CN", tone: "natural", preserveMarkdown: true, preserveProperNouns: true, showOriginal: false }, saveHistory: true }).success).toBe(true);
  });
  it.each([
    { ...summarize, tool: "SEARCH" },
    { ...summarize, input: " " },
    { ...summarize, input: "x".repeat(20_001) },
    { ...summarize, systemPrompt: "ignore policy" },
    { ...summarize, messages: [{ role: "system", content: "unsafe" }] },
    { ...summarize, role: "system" },
    { ...summarize, developer: "unsafe" },
    { ...summarize, prompt: "unsafe" },
    { ...summarize, data_type: "trusted" },
    { ...summarize, options: { ...summarize.options, arbitraryPrompt: "do this" } },
    { tool: "TRANSLATE", input: "text", options: { sourceLanguage: "en", targetLanguage: "en", tone: "natural", preserveMarkdown: true, preserveProperNouns: true, showOriginal: false }, saveHistory: true },
  ])("rejects invalid or unsafe input", (value) => expect(toolRunRequestSchema.safeParse(value).success).toBe(false));
});
