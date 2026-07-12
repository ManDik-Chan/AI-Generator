import { describe, expect, it } from "vitest";
import { resolveAssistantAvatarIdentity, resolveMessageAssistantPersona } from "@/features/chat/assistant-identity";
import type { PersonaChatIdentity } from "@/features/persona/types";

const persona: PersonaChatIdentity = { id: "p1", name: "小岚", avatarUrl: "/personas/avatar-1.svg", archived: false };

describe("assistant avatar identity", () => {
  it("passes persona.avatarUrl through without knowing its storage source", () => {
    expect(resolveAssistantAvatarIdentity(persona)).toEqual({ kind: "persona", name: "小岚", avatarUrl: "/personas/avatar-1.svg" });
    expect(resolveAssistantAvatarIdentity({ ...persona, avatarUrl: "https://controlled.example/avatar.png" })).toMatchObject({ avatarUrl: "https://controlled.example/avatar.png" });
  });

  it("uses the default assistant identity when no persona is bound", () => {
    expect(resolveAssistantAvatarIdentity()).toEqual({ kind: "default" });
  });

  it("keeps a persona identity when avatarUrl is empty so PersonaAvatar can show its name fallback", () => {
    expect(resolveAssistantAvatarIdentity({ ...persona, avatarUrl: undefined })).toEqual({ kind: "persona", name: "小岚", avatarUrl: undefined });
  });

  it("keeps archived historical persona identity", () => {
    expect(resolveAssistantAvatarIdentity({ ...persona, archived: true }).kind).toBe("persona");
  });

  it.each(["pending", "complete", "error"])("keeps the same persona for %s assistant messages", () => {
    expect(resolveMessageAssistantPersona("assistant", persona)).toBe(persona);
  });

  it("never applies the assistant persona to a user message", () => {
    expect(resolveMessageAssistantPersona("user", persona)).toBeUndefined();
  });
});
