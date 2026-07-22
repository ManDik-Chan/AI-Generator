import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  aggregate: vi.fn(),
  ledgerCreate: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
  workerCreateMany: vi.fn(),
  workerUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  $transaction: (callback: (transaction: unknown) => unknown, options?: unknown) => mocks.transaction(callback, options),
  profile: { findUnique: mocks.profile },
  usageLedger: { aggregate: mocks.aggregate },
  toolRun: { updateMany: mocks.updateMany },
} }));

import { createPendingBrainstormToolRun, createPendingImageGenerationToolRun, createPendingToolRun, createPendingVisionToolRun, DailyToolLimitError, finishToolRun, getBrainstormUsage, getImageGenerationUsage, getVisionUsage } from "@/features/tools/usage";

const input = { userId: "user", tool: "SUMMARIZE" as const, title: "title", inputText: "input", options: {}, retainContent: true, dailyLimit: 30 };
describe("tool usage and terminal state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.mockResolvedValue({ role: "USER" });
    mocks.aggregate.mockResolvedValue({ _sum: { units: 2 } });
    mocks.ledgerCreate.mockResolvedValue({ id: "usage" });
    mocks.create.mockResolvedValue({ id: "run" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findMany.mockResolvedValue([]);
    mocks.workerCreateMany.mockResolvedValue({ count: 4 });
    mocks.workerUpdateMany.mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation(async (callback: (transaction: unknown) => unknown) => callback({
      profile: { findUnique: mocks.profile },
      usageLedger: { aggregate: mocks.aggregate, create: mocks.ledgerCreate },
      toolRun: {
        create: mocks.create,
        findMany: mocks.findMany,
        updateMany: mocks.updateMany,
      },
      brainstormWorker: {
        createMany: mocks.workerCreateMany,
        updateMany: mocks.workerUpdateMany,
      },
    }));
  });
  it("creates one counted run and returns usage", async () => expect(await createPendingToolRun(input)).toMatchObject({ runId: "run", used: 3, remaining: 27 }));
  it("rejects users at the daily limit before creating", async () => { mocks.aggregate.mockResolvedValue({ _sum: { units: 30 } }); await expect(createPendingToolRun(input)).rejects.toBeInstanceOf(DailyToolLimitError); expect(mocks.create).not.toHaveBeenCalled(); });
  it("keeps the existing ADMIN bypass policy and records real usage", async () => { mocks.profile.mockResolvedValue({ role: "ADMIN" }); mocks.aggregate.mockResolvedValue({ _sum: { units: 99 } }); await expect(createPendingToolRun(input)).resolves.toMatchObject({ runId: "run" }); expect(mocks.ledgerCreate).toHaveBeenCalledOnce(); });
  it("does not retain text when privacy saving is disabled", async () => { await createPendingToolRun({ ...input, retainContent: false }); expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: null, inputText: null, retainContent: false }) })); });
  it("only allows a PENDING run to transition to a terminal state", async () => { await finishToolRun("user", "run", "COMPLETE", { outputText: "done" }); expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "run", userId: "user", status: "PENDING" } })); });
  it("counts vision runs independently and creates IMAGE_ANALYZE plus immutable usage atomically", async () => { const result = await createPendingVisionToolRun({ ...input, dailyLimit: 10 }); expect(result).toMatchObject({ used: 3, remaining: 7 }); expect(mocks.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ capability: "IMAGE_ANALYZE" }) })); expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "IMAGE_ANALYZE" }) })); expect(mocks.ledgerCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ capability: "IMAGE_ANALYZE", runId: "run" }) })); });
  it("decrements a regular user's remaining vision quota on the first valid run", async () => { mocks.aggregate.mockResolvedValue({ _sum: { units: 0 } }); await expect(createPendingVisionToolRun({ ...input, dailyLimit: 10 })).resolves.toMatchObject({ used: 1, remaining: 9, unlimited: false }); });
  it("blocks concurrent-safe vision creation at its own limit", async () => { mocks.aggregate.mockResolvedValue({ _sum: { units: 10 } }); await expect(createPendingVisionToolRun({ ...input, dailyLimit: 10 })).rejects.toBeInstanceOf(DailyToolLimitError); expect(mocks.create).not.toHaveBeenCalled(); });
  it("does not block admins and returns their real incremented usage", async () => { mocks.profile.mockResolvedValue({ role: "ADMIN" }); mocks.aggregate.mockResolvedValue({ _sum: { units: 12 } }); await expect(createPendingVisionToolRun({ ...input, dailyLimit: 10 })).resolves.toMatchObject({ used: 13, unlimited: true }); expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.ledgerCreate).toHaveBeenCalledOnce(); });
  it("reports the admin's actual daily usage with unlimited=true", async () => { mocks.profile.mockResolvedValue({ role: "ADMIN" }); mocks.aggregate.mockResolvedValue({ _sum: { units: 12 } }); await expect(getVisionUsage("user", 10)).resolves.toEqual({ limit: 10, used: 12, remaining: 10, unlimited: true }); });
  it("counts image generation independently and stores only the server options", async () => { mocks.aggregate.mockResolvedValue({ _sum: { units: 0 } }); await expect(createPendingImageGenerationToolRun({ userId: "user", title: "image", inputText: "safe prompt", options: { style: "AUTO", size: "1280x1280" }, dailyLimit: 5 })).resolves.toMatchObject({ used: 1, remaining: 4, unlimited: false }); expect(mocks.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ capability: "IMAGE_GENERATE" }) })); expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "IMAGE_GENERATE", retainContent: true }) })); });
  it("blocks regular image generation at its independent limit", async () => { mocks.aggregate.mockResolvedValue({ _sum: { units: 5 } }); await expect(createPendingImageGenerationToolRun({ userId: "user", title: "image", inputText: "safe prompt", options: {}, dailyLimit: 5 })).rejects.toBeInstanceOf(DailyToolLimitError); expect(mocks.create).not.toHaveBeenCalled(); });
  it("keeps image generation unlimited for admins while reporting actual usage", async () => { mocks.profile.mockResolvedValue({ role: "ADMIN" }); mocks.aggregate.mockResolvedValue({ _sum: { units: 8 } }); await expect(createPendingImageGenerationToolRun({ userId: "user", title: "image", inputText: "safe prompt", options: {}, dailyLimit: 5 })).resolves.toMatchObject({ used: 9, remaining: 5, unlimited: true }); await expect(getImageGenerationUsage("user", 5)).resolves.toEqual({ limit: 5, used: 8, remaining: 5, unlimited: true }); });
  it("creates one ToolRun followed by four workers in the same Serializable transaction", async () => {
    mocks.aggregate.mockResolvedValue({ _sum: { units: 0 } });
    await expect(createPendingBrainstormToolRun({
      userId: "user",
      prompt: "problem",
      title: "brainstorm",
      retainContent: true,
      dailyLimit: 3,
      options: { workerVersion: "phase-7a1-v1" },
    })).resolves.toMatchObject({ runId: "run", used: 1, remaining: 2, unlimited: false });

    expect(mocks.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ capability: "BRAINSTORM" }) }));
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "BRAINSTORM", userId: "user" }),
      select: { id: true },
    }));
    expect(mocks.create.mock.calls[0]?.[0].data).not.toHaveProperty("brainstormWorkers");
    expect(mocks.workerCreateMany).toHaveBeenCalledOnce();
    expect(mocks.workerCreateMany).toHaveBeenCalledWith({
      data: [
        { toolRunId: "run", userId: "user", role: "ANALYST", position: 0, status: "PENDING" },
        { toolRunId: "run", userId: "user", role: "CREATIVE", position: 1, status: "PENDING" },
        { toolRunId: "run", userId: "user", role: "CRITIC", position: 2, status: "PENDING" },
        { toolRunId: "run", userId: "user", role: "PLANNER", position: 3, status: "PENDING" },
      ],
    });
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.workerCreateMany.mock.invocationCallOrder[0]!);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("does not create workers when ToolRun creation fails", async () => {
    mocks.aggregate.mockResolvedValue({ _sum: { units: 0 } });
    mocks.create.mockRejectedValueOnce(new Error("tool run create failed"));
    await expect(createPendingBrainstormToolRun({ userId: "user", prompt: "problem", title: "brainstorm", retainContent: true, dailyLimit: 3, options: {} }))
      .rejects.toThrow("tool run create failed");
    expect(mocks.workerCreateMany).not.toHaveBeenCalled();
  });

  it("rejects the atomic transaction when worker createMany fails", async () => {
    mocks.aggregate.mockResolvedValue({ _sum: { units: 0 } });
    mocks.workerCreateMany.mockRejectedValueOnce(new Error("worker create failed"));
    await expect(createPendingBrainstormToolRun({ userId: "user", prompt: "problem", title: "brainstorm", retainContent: true, dailyLimit: 3, options: {} }))
      .rejects.toThrow("worker create failed");
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.workerCreateMany).toHaveBeenCalledOnce();
  });

  it("blocks users at the brainstorm limit before creating a ToolRun or workers", async () => {
    mocks.aggregate.mockResolvedValue({ _sum: { units: 3 } });
    await expect(createPendingBrainstormToolRun({ userId: "user", prompt: "problem", title: "brainstorm", retainContent: true, dailyLimit: 3, options: {} }))
      .rejects.toBeInstanceOf(DailyToolLimitError);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.workerCreateMany).not.toHaveBeenCalled();
  });

  it("keeps the ADMIN brainstorm bypass and reports real incremented usage", async () => {
    mocks.profile.mockResolvedValue({ role: "ADMIN" });
    mocks.aggregate.mockResolvedValue({ _sum: { units: 3 } });
    await expect(createPendingBrainstormToolRun({ userId: "user", prompt: "problem", title: "brainstorm", retainContent: true, dailyLimit: 3, options: {} }))
      .resolves.toMatchObject({ used: 4, remaining: 3, unlimited: true });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.workerCreateMany).toHaveBeenCalledOnce();
    await expect(getBrainstormUsage("user", 3)).resolves.toEqual({ limit: 3, used: 3, remaining: 3, unlimited: true });
  });
  it("uses short recovery rather than permanent history when brainstorm saving is off", async () => { mocks.aggregate.mockResolvedValue({ _sum: { units: 0 } }); await createPendingBrainstormToolRun({ userId: "user", prompt: "private problem", title: "private", retainContent: false, dailyLimit: 3, options: {} }); expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: null, inputText: "private problem", retainContent: false, recoveryExpiresAt: expect.any(Date) }) })); });
});
