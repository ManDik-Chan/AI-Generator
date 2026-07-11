import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteMany } = vi.hoisted(() => ({ deleteMany: vi.fn() }));

vi.mock("@/lib/database/prisma", () => ({
  prisma: { conversation: { deleteMany } },
}));

import { deleteOwnedConversation, ownedConversationWhere } from "@/features/chat/access";

describe("conversation ownership", () => {
  beforeEach(() => deleteMany.mockReset());

  it("always scopes access to both conversation and user", () => {
    expect(ownedConversationWhere("user-a", "conversation-a")).toEqual({ id: "conversation-a", userId: "user-a" });
  });

  it("denies a non-owner delete when no owned row matches", async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteOwnedConversation("user-b", "conversation-a")).resolves.toBe(false);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "conversation-a", userId: "user-b" } });
  });

  it("allows deletion only when one owned row matches", async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    await expect(deleteOwnedConversation("user-a", "conversation-a")).resolves.toBe(true);
  });
});
