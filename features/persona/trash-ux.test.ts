import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("persona trash product language and safeguards", () => {
  const menu = readFileSync(new URL("./components/persona-actions-menu.tsx", import.meta.url), "utf8");
  const trash = readFileSync(new URL("../../app/personas/trash/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../app/api/chat/route.ts", import.meta.url), "utf8");

  it("uses a non-native confirmation dialog with the requested explanation", () => {
    expect(menu).toContain('role="dialog"'); expect(menu).not.toContain("window.confirm");
    expect(menu).toContain("已有聊天记录不会被删除"); expect(menu).toContain("移至回收站");
  });

  it("provides a separate owner-scoped trash page and restoration", () => {
    expect(trash).toContain("getPersonas(user.id, true)"); expect(trash).toContain("回收站为空");
    expect(trash).toContain("PersonaTrashList");
  });

  it("keeps server-side new and existing chat protections", () => {
    expect(route).toContain("activeOwnedPersonaWhere");
    expect(route).toContain("personaConversationUnavailableMessage");
    expect(route).toContain("return errorResponse(unavailableMessage, 409)");
  });
});
