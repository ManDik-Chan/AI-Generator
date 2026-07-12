import { describe, expect, it } from "vitest";
import { buildFinalAvatarPrompt } from "@/features/persona/avatar-service";
import { buildPersonaAvatarStoragePath } from "@/features/persona/avatar-storage";

describe("persona avatar service rules", () => {
  it("keeps the final provider prompt within 1000 characters", () => expect(buildFinalAvatarPrompt("a".repeat(900)).length).toBeLessThanOrEqual(1000));
  it("rejects empty and overlong avatar prompts", () => { expect(() => buildFinalAvatarPrompt(" ")).toThrow(); expect(() => buildFinalAvatarPrompt("a".repeat(901))).toThrow(); });
  it("builds an owner-scoped storage path", () => expect(buildPersonaAvatarStoragePath("user-id", "persona-id", "image-id", "png")).toBe("user-id/persona-id/image-id.png"));
});
