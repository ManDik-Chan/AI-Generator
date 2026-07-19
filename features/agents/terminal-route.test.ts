import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), terminal: vi.fn() }));

vi.mock("@/lib/auth/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock("@/features/agents/queries", () => ({ getOwnedAgentRunTerminal: mocks.terminal }));

import { GET } from "@/app/api/agents/[agentRunId]/terminal/route";

const runId = "dbcc9495-6f97-4ed6-8562-31a73d92a9cc";

describe("Agent terminal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("returns one owner-scoped terminal snapshot with no-store caching", async () => {
    mocks.terminal.mockResolvedValue({ id: runId, status: "COMPLETE", assistantMessage: { content: "final" } });
    const response = await GET(new Request(`http://localhost/api/agents/${runId}/terminal`), { params: Promise.resolve({ agentRunId: runId }) });
    expect(response.status).toBe(200);
    expect(mocks.terminal).toHaveBeenCalledOnce();
    expect(mocks.terminal).toHaveBeenCalledWith("user-1", runId);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("stops safely for unauthenticated and unavailable runs", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await GET(new Request(`http://localhost/api/agents/${runId}/terminal`), { params: Promise.resolve({ agentRunId: runId }) })).status).toBe(401);
    mocks.terminal.mockResolvedValueOnce(null);
    expect((await GET(new Request(`http://localhost/api/agents/${runId}/terminal`), { params: Promise.resolve({ agentRunId: runId }) })).status).toBe(404);
  });
});
