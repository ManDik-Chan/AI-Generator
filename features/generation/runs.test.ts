import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deleteMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/database/prisma", () => ({ prisma: { generationRun: mocks } }));

import { createGenerationRun, getGenerationRun } from "@/features/generation/runs";

describe("GenerationRun expiry cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.create.mockResolvedValue({ id: "new-run" });
    mocks.findFirst.mockResolvedValue(null);
  });

  it("physically deletes expired runs before creating a new run", async () => {
    await createGenerationRun({ userId: "owner", type: "PERSONA_DRAFT", input: { description: "private" } });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lte: expect.any(Date) } } });
    expect(mocks.create).toHaveBeenCalled();
  });

  it("retains unexpired runs by using an expiry predicate", async () => {
    await getGenerationRun("owner", "run");
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "run", userId: "owner", expiresAt: { gt: expect.any(Date) } } }));
  });

  it("does not block a new run or log its input when cleanup fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.deleteMany.mockRejectedValueOnce(new Error("cleanup unavailable"));
    await expect(createGenerationRun({ userId: "owner", type: "PERSONA_AVATAR", input: { prompt: "secret prompt" } })).resolves.toEqual({ id: "new-run" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret prompt");
    warn.mockRestore();
  });
});
