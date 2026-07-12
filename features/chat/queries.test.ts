import { describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/database/prisma", () => ({ prisma: { conversation: { findFirst, findMany: vi.fn() } } }));
import { getConversationDetail } from "@/features/chat/queries";

describe("conversation detail query", () => {
  it("requests only active messages and returns a refresh-consistent view", async () => {
    findFirst.mockResolvedValue({
      id: "c1", title: "title", updatedAt: new Date("2026-07-12T00:00:00Z"),
      messages: [{ id: "u2", role: "USER", content: "edited", status: "COMPLETE", createdAt: new Date("2026-07-12T00:00:01Z") }],
    });
    const result = await getConversationDetail("owner", "c1");
    expect(findFirst.mock.calls[0][0].select.messages.where).toEqual({ supersededAt: null });
    expect(result?.messages.map((message) => message.content)).toEqual(["edited"]);
  });
});
