import { describe, expect, it } from "vitest";
import { buildPersonaPreview, buildPersonaSystemPrompt } from "@/features/persona/prompt";

describe("persona prompt builder", () => {
  const persona = { name: "阿策", identity: "历史研究员", personality: "谨慎、好奇", speakingStyle: "先结论后证据", expertise: "中国史" };

  it("builds a structured prompt without an AI request", () => {
    const prompt = buildPersonaSystemPrompt(persona);
    expect(prompt).toContain("阿策"); expect(prompt).toContain("身份设定"); expect(prompt).toContain("性格特征"); expect(prompt).toContain("擅长领域");
  });

  it("prefers a manual advanced prompt in preview", () => {
    expect(buildPersonaPreview({ ...persona, systemPrompt: "保持简洁" })).toBe("保持简洁");
  });
});
