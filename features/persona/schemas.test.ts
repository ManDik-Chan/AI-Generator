import { describe, expect, it } from "vitest";
import { personaInputSchema } from "@/features/persona/schemas";

describe("persona input validation", () => {
  it("accepts a valid manual persona", () => {
    expect(personaInputSchema.safeParse({ name: "小岚", personality: "温和且严谨", avatarUrl: "/personas/avatar-1.svg" }).success).toBe(true);
  });

  it.each([
    { name: "", personality: "认真" },
    { name: "a".repeat(41), personality: "认真" },
    { name: "助手", personality: "" },
    { name: "助手", personality: "a".repeat(1001) },
    { name: "助手", personality: "认真", greeting: "a".repeat(1001) },
    { name: "助手", personality: "认真", systemPrompt: "a".repeat(4001) },
    { name: "助手", personality: "认真", avatarUrl: "https://evil.example/avatar.png" },
  ])("rejects invalid persona fields", (input) => expect(personaInputSchema.safeParse(input).success).toBe(false));
});
