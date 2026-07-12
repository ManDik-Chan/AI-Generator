import { describe, expect, it, vi } from "vitest";
import { buildPersonaAvatarPlan, extractFirstJsonObject, generatedPersonaSchema, parseGeneratedPersona, personaDescriptionSchema, toClientPersonaDraft } from "@/features/persona/generation";
import { generatePersonaDraftWithRepair } from "@/features/persona/generate-draft";

const valid = { name: "林老师", personality: "温和但严格", avatarPrompt: "一位大学教师，统一插画风格，专注表情，衬衫，简洁校园背景，半身头像构图", avatarPresetId: "teacher" };

describe("AI persona generation", () => {
  it.each(["", "   ", "太短"])("rejects an invalid description", (description) => expect(personaDescriptionSchema.safeParse({ description }).success).toBe(false));
  it("rejects an overlong description", () => expect(personaDescriptionSchema.safeParse({ description: "a".repeat(1501) }).success).toBe(false));
  it("parses valid JSON and fenced JSON", () => {
    expect(parseGeneratedPersona(JSON.stringify(valid)).name).toBe("林老师");
    expect(parseGeneratedPersona(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``).name).toBe("林老师");
  });
  it("extracts the first balanced object", () => expect(JSON.parse(extractFirstJsonObject(`note ${JSON.stringify(valid)} tail`)).name).toBe("林老师"));
  it.each(["", "not json", JSON.stringify({ personality: "x", avatarPrompt: "x" }), JSON.stringify({ name: "x", avatarPrompt: "x" })])("rejects empty, invalid, or incomplete output", (output) => expect(() => parseGeneratedPersona(output)).toThrow());
  it("rejects overlong fields and strips schema extras", () => {
    expect(() => parseGeneratedPersona(JSON.stringify({ ...valid, name: "x".repeat(41) }))).toThrow();
    expect(parseGeneratedPersona(JSON.stringify({ ...valid, avatarUrl: "javascript:bad", systemPrompt: "unsafe" }))).not.toHaveProperty("avatarUrl");
  });
  it("maps a valid preset and safely replaces an invalid preset", () => {
    expect(toClientPersonaDraft(valid).avatarUrl).toBe("/personas/avatar-3.svg");
    expect(toClientPersonaDraft({ ...valid, avatarPresetId: "javascript:bad" }).avatarUrl).toMatch(/^\/personas\/avatar-/);
  });
  it("never returns model systemPrompt or a server system prompt", () => {
    const draft = toClientPersonaDraft(parseGeneratedPersona(JSON.stringify({ ...valid, systemPrompt: "unsafe" })));
    expect(draft).not.toHaveProperty("systemPrompt"); expect(draft).not.toHaveProperty("systemPromptPreview");
  });
  it("repairs invalid JSON exactly once", async () => {
    const generate = vi.fn().mockResolvedValueOnce("bad").mockResolvedValueOnce(JSON.stringify(valid));
    const progress = vi.fn();
    await expect(generatePersonaDraftWithRepair(generate, progress)).resolves.toMatchObject({ name: "林老师" });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(progress.mock.calls.map(([stage]) => stage)).toEqual(["validating", "repairing", "validating"]);
  });
  it("does not report repairing or make another call for valid output", async () => { const generate = vi.fn().mockResolvedValue(JSON.stringify(valid)); const progress = vi.fn(); await generatePersonaDraftWithRepair(generate, progress); expect(generate).toHaveBeenCalledTimes(1); expect(progress).toHaveBeenCalledWith("validating"); expect(progress).not.toHaveBeenCalledWith("repairing"); });
  it("stops after a failed repair", async () => {
    const generate = vi.fn().mockResolvedValue("bad");
    await expect(generatePersonaDraftWithRepair(generate)).rejects.toThrow("格式不完整");
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("validates avatarPrompt", () => expect(generatedPersonaSchema.safeParse({ ...valid, avatarPrompt: "" }).success).toBe(false));
  it.each(["https://evil.example/a.png", "OpenAI image API", "javascript:alert(1)", "1024x1024 portrait"])("rejects unsafe avatarPrompt content: %s", (avatarPrompt) => expect(generatedPersonaSchema.safeParse({ ...valid, avatarPrompt }).success).toBe(false));
  it("builds a provider-agnostic future avatar plan", () => expect(buildPersonaAvatarPlan(valid)).toEqual({ prompt: valid.avatarPrompt, personaName: "林老师", suggestedPresetId: "teacher" }));
});
