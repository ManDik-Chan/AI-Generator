import { describe, expect, it } from "vitest";
import { assertSupersedeCount, ChatEditConflictError, planLastUserMessageEdit, type EditableMessage } from "@/features/chat/edit";

const row = (id: string, role: "USER" | "ASSISTANT", status: "PENDING" | "COMPLETE" | "ERROR" = "COMPLETE", supersededAt: Date | null = null): EditableMessage => ({ id, role, status, content: id, supersededAt });

describe("last user message editing", () => {
  it.each(["PENDING", "COMPLETE", "ERROR"] as const)("supersedes the target and its %s assistant", (status) => {
    expect(planLastUserMessageEdit([row("u1", "USER"), row("a1", "ASSISTANT"), row("u2", "USER"), row("a2", "ASSISTANT", status)], "u2")).toEqual({ supersedeIds: ["u2", "a2"], updateTitle: false });
  });

  it.each(["", "partial output"])("supersedes a pending assistant with content %j", (content) => {
    const assistant = { ...row("a1", "ASSISTANT", "PENDING"), content };
    expect(planLastUserMessageEdit([row("u1", "USER"), assistant], "u1").supersedeIds).toEqual(["u1", "a1"]);
  });

  it("updates the title only when editing the first active user message", () => {
    expect(planLastUserMessageEdit([row("u1", "USER"), row("a1", "ASSISTANT")], "u1").updateTitle).toBe(true);
    expect(planLastUserMessageEdit([row("u1", "USER"), row("a1", "ASSISTANT"), row("u2", "USER")], "u2").updateTitle).toBe(false);
  });

  it("rejects a non-last user, another user's absent message and an already superseded target", () => {
    const rows = [row("u1", "USER"), row("a1", "ASSISTANT"), row("u2", "USER"), row("old", "USER", "COMPLETE", new Date())];
    for (const id of ["u1", "foreign", "old"]) expect(() => planLastUserMessageEdit(rows, id)).toThrow(ChatEditConflictError);
  });

  it("turns a concurrent supersede count mismatch into the required conflict", () => {
    expect(() => assertSupersedeCount(2, 1)).toThrow("对话内容已发生变化，请刷新后重试。");
  });
});
