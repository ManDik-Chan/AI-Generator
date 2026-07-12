import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/database/prisma", () => ({ prisma: { message: { updateMany } } }));
import { finalizeAssistantMessage } from "@/features/chat/persistence";

describe("assistant finalization", () => {
  beforeEach(() => updateMany.mockReset());

  it("finalizes only an active pending assistant", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await expect(finalizeAssistantMessage("a1", "done", "COMPLETE")).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "a1", status: "PENDING", supersededAt: null }, data: { content: "done", status: "COMPLETE" } });
  });

  it("does not let a late stream overwrite a superseded assistant", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(finalizeAssistantMessage("a1", "late", "COMPLETE")).resolves.toBe(false);
  });
});
