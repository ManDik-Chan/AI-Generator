import { describe, expect, it } from "vitest";
import { activeOwnedPersonaWhere, newConversationPersonaData } from "@/features/persona/chat";

describe("persona chat binding", () => {
  it("requires a new-conversation persona to be owned and active", () => {
    expect(activeOwnedPersonaWhere("owner", "persona")).toEqual({ id: "persona", userId: "owner", archivedAt: null });
  });

  it("binds a selected persona once and keeps default assistant unbound", () => {
    expect(newConversationPersonaData("persona")).toEqual({ personaId: "persona" });
    expect(newConversationPersonaData()).toEqual({});
  });
});
