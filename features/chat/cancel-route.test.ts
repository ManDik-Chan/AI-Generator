import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  cancelAgent: vi.fn(),
  updateMany: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/auth/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock("@/features/agents/run-state", () => ({ cancelAgentRunForAssistantMessage: mocks.cancelAgent }));
vi.mock("@/lib/database/prisma", () => ({
  prisma: { message: { updateMany: mocks.updateMany, findFirst: mocks.findFirst } },
}));

import { POST } from "@/app/api/chat/messages/[assistantMessageId]/cancel/route";

const messageId = "dbcc9495-6f97-4ed6-8562-31a73d92a9cc";

describe("chat assistant cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("cancels the owning pending Agent run instead of only the message", async () => {
    mocks.cancelAgent.mockResolvedValue("CANCELLED");
    const response = await POST(new Request("http://localhost/cancel"), { params: Promise.resolve({ assistantMessageId: messageId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "CANCELLED" });
    expect(mocks.cancelAgent).toHaveBeenCalledWith("user-1", messageId);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("still cancels a chat message that has no pending Agent run", async () => {
    mocks.cancelAgent.mockResolvedValue(null);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const response = await POST(new Request("http://localhost/cancel"), { params: Promise.resolve({ assistantMessageId: messageId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "CANCELLED" });
    expect(mocks.updateMany).toHaveBeenCalledOnce();
  });
});
