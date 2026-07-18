import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  status: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("@/lib/auth/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock("@/features/agents/queries", () => ({ getOwnedAgentRunStatus: mocks.status }));
vi.mock("@/features/agents/run-state", () => ({ reconcileStaleAgentRun: mocks.reconcile }));

import { GET } from "@/app/api/agents/[agentRunId]/status/route";

const runId = "dbcc9495-6f97-4ed6-8562-31a73d92a9cc";

describe("Agent status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("returns the compact owner status without invoking the full detail query", async () => {
    mocks.status.mockResolvedValue({ id: runId, status: "COMPLETE", startedAt: new Date().toISOString() });
    const response = await GET(new Request(`http://localhost/api/agents/${runId}/status`), { params: Promise.resolve({ agentRunId: runId }) });
    expect(response.status).toBe(200);
    expect(mocks.status).toHaveBeenCalledWith("user-1", runId);
    expect(mocks.status).toHaveBeenCalledOnce();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("reconciles an expired PENDING status and reads the terminal snapshot once more", async () => {
    mocks.status
      .mockResolvedValueOnce({ id: runId, status: "PENDING", startedAt: "2020-01-01T00:00:00.000Z" })
      .mockResolvedValueOnce({ id: runId, status: "ERROR", startedAt: "2020-01-01T00:00:00.000Z" });
    const response = await GET(new Request(`http://localhost/api/agents/${runId}/status`), { params: Promise.resolve({ agentRunId: runId }) });
    expect(response.status).toBe(200);
    expect(mocks.reconcile).toHaveBeenCalledOnce();
    expect(mocks.status).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({ status: "ERROR" });
  });
});
