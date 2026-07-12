import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), updateMany: vi.fn(), requireUser: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/database/prisma", () => ({ prisma: { persona: { create: mocks.create, updateMany: mocks.updateMany } } }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { archivePersonaAction, createPersonaAction, restorePersonaAction, updatePersonaAction } from "@/features/persona/actions";

describe("persona mutations", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ id: "owner" }); });

  it("creates a persona with an automatically built system prompt", async () => {
    mocks.create.mockResolvedValue({ id: "p1" });
    await expect(createPersonaAction({ name: "小岚", personality: "温和" })).resolves.toMatchObject({ success: true, id: "p1" });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ userId: "owner", name: "小岚" });
    expect(mocks.create.mock.calls[0][0].data.systemPrompt).toContain("小岚");
  });

  it("updates only an owned persona and rejects a missing owner match", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const result = await updatePersonaAction("550e8400-e29b-41d4-a716-446655440001", { name: "小岚", personality: "温和" });
    expect(result.success).toBe(false);
    expect(mocks.updateMany.mock.calls[0][0].where).toEqual({ id: "550e8400-e29b-41d4-a716-446655440001", userId: "owner" });
  });

  it("clears optional fields to null when editing", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await updatePersonaAction("550e8400-e29b-41d4-a716-446655440001", { name: "小岚", personality: "温和", description: "" });
    expect(mocks.updateMany.mock.calls[0][0].data.description).toBeNull();
  });

  it("archives and restores without deleting conversations or messages", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await archivePersonaAction("550e8400-e29b-41d4-a716-446655440001");
    expect(mocks.updateMany.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);
    await restorePersonaAction("550e8400-e29b-41d4-a716-446655440001");
    expect(mocks.updateMany.mock.calls[1][0].data).toEqual({ archivedAt: null });
  });
});
