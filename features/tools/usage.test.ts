import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  $transaction: async (callback: (transaction: unknown) => unknown) => callback({ profile: { findUnique: mocks.profile }, toolRun: { count: mocks.count, create: mocks.create } }),
  toolRun: { updateMany: mocks.updateMany },
} }));

import { createPendingToolRun, DailyToolLimitError, finishToolRun } from "@/features/tools/usage";

const input = { userId: "user", tool: "SUMMARIZE" as const, title: "title", inputText: "input", options: {}, retainContent: true, dailyLimit: 30 };
describe("tool usage and terminal state", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.profile.mockResolvedValue({ role: "USER" }); mocks.count.mockResolvedValue(2); mocks.create.mockResolvedValue({ id: "run" }); mocks.updateMany.mockResolvedValue({ count: 1 }); });
  it("creates one counted run and returns usage", async () => expect(await createPendingToolRun(input)).toMatchObject({ runId: "run", used: 3, remaining: 27 }));
  it("rejects users at the daily limit before creating", async () => { mocks.count.mockResolvedValue(30); await expect(createPendingToolRun(input)).rejects.toBeInstanceOf(DailyToolLimitError); expect(mocks.create).not.toHaveBeenCalled(); });
  it("keeps the existing ADMIN bypass policy", async () => { mocks.profile.mockResolvedValue({ role: "ADMIN" }); mocks.count.mockResolvedValue(99); await expect(createPendingToolRun(input)).resolves.toMatchObject({ runId: "run" }); });
  it("does not retain text when privacy saving is disabled", async () => { await createPendingToolRun({ ...input, retainContent: false }); expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: null, inputText: null, retainContent: false }) })); });
  it("only allows a PENDING run to transition to a terminal state", async () => { await finishToolRun("user", "run", "COMPLETE", { outputText: "done" }); expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "run", userId: "user", status: "PENDING" } })); });
});
