import { describe, expect, it } from "vitest";
import { AiProviderError } from "@/lib/ai/errors";
import { createToolRunTitle, encodeToolSse, escapeToolXml, publicToolError, startOfUtcDay } from "@/features/tools/utils";

describe("tool utilities", () => {
  it("escapes all XML boundary characters", () => expect(escapeToolXml(`<tag a="1">Tom & 'Sue'</tag>`)).toBe("&lt;tag a=&quot;1&quot;&gt;Tom &amp; &apos;Sue&apos;&lt;/tag&gt;"));
  it("creates bounded generic titles", () => expect(createToolRunTitle("SUMMARIZE", "x".repeat(200))).toHaveLength(100));
  it("encodes app-owned SSE events", () => expect(encodeToolSse("delta", { text: "你好" })).toBe('event: delta\ndata: {"text":"你好"}\n\n'));
  it("uses a UTC date boundary", () => expect(startOfUtcDay(new Date("2026-07-13T23:30:00-08:00")).toISOString()).toBe("2026-07-14T00:00:00.000Z"));
  it("normalizes provider errors without exposing provider text", () => expect(publicToolError(new AiProviderError("AUTHENTICATION", "secret provider response", 401))).toEqual({ code: "AUTHENTICATION", message: expect.not.stringContaining("secret") }));
});
