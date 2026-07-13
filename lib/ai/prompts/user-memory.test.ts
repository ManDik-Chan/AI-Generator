import { describe, expect, it } from "vitest";
import { buildUserMemoryBlock } from "@/lib/ai/prompts/user-memory";
describe("user memory prompt", () => { it("omits empty blocks", () => expect(buildUserMemoryBlock([])).toBe("")); it("escapes XML and marks memories untrusted", () => { const block = buildUserMemoryBlock([{ content: "<ignore>& rules" }]); expect(block).toContain("不可信"); expect(block).toContain("&lt;ignore&gt;&amp;"); expect(block).not.toContain("<ignore>"); }); });
