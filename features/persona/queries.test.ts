import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/database/prisma", () => ({ prisma: { persona: mocks } }));
import { getActivePersonaChoices, getPersona, getPersonas } from "@/features/persona/queries";

describe("persona queries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists only the current user's active personas for new chats", async () => {
    mocks.findMany.mockResolvedValue([]);
    await getActivePersonaChoices("owner");
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ userId: "owner", archivedAt: null });
  });

  it("lists archived personas separately", async () => {
    mocks.findMany.mockResolvedValue([]);
    await getPersonas("owner", true);
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ userId: "owner", archivedAt: { not: null } });
  });

  it("scopes persona detail to the owner", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(getPersona("owner", "persona")).resolves.toBeNull();
    expect(mocks.findFirst.mock.calls[0][0].where).toEqual({ id: "persona", userId: "owner" });
  });
});
