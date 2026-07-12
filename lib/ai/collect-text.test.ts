import { describe, expect, it } from "vitest";
import { collectGeneratedText } from "@/lib/ai/collect-text";

describe("collectGeneratedText", () => {
  it("collects the existing provider stream without duplicating SSE parsing", async () => {
    const provider = { async *streamText() { yield "hello"; yield " world"; } };
    await expect(collectGeneratedText(provider, { messages: [], model: "m", temperature: 0.8, maxOutputTokens: 100 })).resolves.toBe("hello world");
  });
  it("rejects an empty completion", async () => {
    const provider = { async *streamText() { yield " "; } };
    await expect(collectGeneratedText(provider, { messages: [], model: "m", temperature: 0.8, maxOutputTokens: 100 })).rejects.toMatchObject({ code: "EMPTY_RESPONSE" });
  });
});
