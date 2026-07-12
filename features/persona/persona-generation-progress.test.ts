import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI persona generation progress client", () => {
  const source = readFileSync(new URL("./components/ai-persona-generator.tsx", import.meta.url), "utf8");
  it("guards late stream events after cancel and preserves prior draft on error", () => { expect(source).toContain("requestVersion.current"); expect(source).toContain("version !== requestVersion.current"); expect(source).toContain("controller.signal.aborted"); expect(source).not.toContain("setDraft(undefined)"); });
  it("shows completion feedback and uses the shared real progress component", () => { expect(source).toContain("GenerationProgress"); expect(source).toContain("人格草稿已生成，可以继续修改后保存。"); expect(source).not.toContain("setTimeout"); });
});
