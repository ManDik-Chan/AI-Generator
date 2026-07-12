import { describe, expect, it } from "vitest";
import { activeOwnedPersonaWhere, newConversationPersonaData, personaConversationUnavailableMessage } from "@/features/persona/chat";

describe("persona chat binding", () => {
  it("requires a new-conversation persona to be owned and active", () => {
    expect(activeOwnedPersonaWhere("owner", "persona")).toEqual({ id: "persona", userId: "owner", archivedAt: null });
  });

  it("binds a selected persona once and keeps default assistant unbound", () => {
    expect(newConversationPersonaData("persona")).toEqual({ personaId: "persona" });
    expect(newConversationPersonaData()).toEqual({});
  });

  it("blocks an existing conversation while its persona is in the trash", () => {
    expect(personaConversationUnavailableMessage(new Date())).toContain("恢复人格后");
    expect(personaConversationUnavailableMessage(null)).toBeUndefined();
  });
});
