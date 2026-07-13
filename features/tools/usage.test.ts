import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  $transaction: async (callback: (transaction: unknown) => unknown) => callback({ profile: { findUnique: mocks.profile }, toolRun: { count: mocks.count, create: mocks.create } }),
  profile: { findUnique: mocks.profile },
  toolRun: { count: mocks.count, updateMany: mocks.updateMany },
} }));

import { createPendingToolRun, createPendingVisionToolRun, DailyToolLimitError, finishToolRun, getVisionUsage } from "@/features/tools/usage";

const input = { userId: "user", tool: "SUMMARIZE" as const, title: "title", inputText: "input", options: {}, retainContent: true, dailyLimit: 30 };
describe("tool usage and terminal state", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.profile.mockResolvedValue({ role: "USER" }); mocks.count.mockResolvedValue(2); mocks.create.mockResolvedValue({ id: "run" }); mocks.updateMany.mockResolvedValue({ count: 1 }); });
  it("creates one counted run and returns usage", async () => expect(await createPendingToolRun(input)).toMatchObject({ runId: "run", used: 3, remaining: 27 }));
  it("rejects users at the daily limit before creating", async () => { mocks.count.mockResolvedValue(30); await expect(createPendingToolRun(input)).rejects.toBeInstanceOf(DailyToolLimitError); expect(mocks.create).not.toHaveBeenCalled(); });
  it("keeps the existing ADMIN bypass policy", async () => { mocks.profile.mockResolvedValue({ role: "ADMIN" }); mocks.count.mockResolvedValue(99); await expect(createPendingToolRun(input)).resolves.toMatchObject({ runId: "run" }); });
  it("does not retain text when privacy saving is disabled", async () => { await createPendingToolRun({ ...input, retainContent: false }); expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: null, inputText: null, retainContent: false }) })); });
  it("only allows a PENDING run to transition to a terminal state", async () => { await finishToolRun("user", "run", "COMPLETE", { outputText: "done" }); expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "run", userId: "user", status: "PENDING" } })); });
  it("counts vision runs independently and creates IMAGE_ANALYZE atomically", async () => { const result = await createPendingVisionToolRun({ ...input, dailyLimit: 10 }); expect(result).toMatchObject({ used: 3, remaining: 7 }); expect(mocks.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ type: "IMAGE_ANALYZE" }) })); expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "IMAGE_ANALYZE" }) })); });
  it("decrements a regular user's remaining vision quota on the first valid run", async () => { mocks.count.mockResolvedValue(0); await expect(createPendingVisionToolRun({ ...input, dailyLimit: 10 })).resolves.toMatchObject({ used: 1, remaining: 9, unlimited: false }); });
  it("blocks concurrent-safe vision creation at its own limit", async () => { mocks.count.mockResolvedValue(10); await expect(createPendingVisionToolRun({ ...input, dailyLimit: 10 })).rejects.toBeInstanceOf(DailyToolLimitError); expect(mocks.create).not.toHaveBeenCalled(); });
  it("does not block admins and returns their real incremented usage", async () => { mocks.profile.mockResolvedValue({ role: "ADMIN" }); mocks.count.mockResolvedValue(12); await expect(createPendingVisionToolRun({ ...input, dailyLimit: 10 })).resolves.toMatchObject({ used: 13, unlimited: true }); expect(mocks.create).toHaveBeenCalledOnce(); });
  it("reports the admin's actual daily usage with unlimited=true", async () => { mocks.profile.mockResolvedValue({ role: "ADMIN" }); mocks.count.mockResolvedValue(12); await expect(getVisionUsage("user", 10)).resolves.toEqual({ limit: 10, used: 12, remaining: 10, unlimited: true }); });
});
