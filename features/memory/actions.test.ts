import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  deleteMany: vi.fn(),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    memory: { deleteMany: mocks.deleteMany },
  },
}));
vi.mock("@/features/memory/access", () => ({ validateMemoryRelations: vi.fn() }));
vi.mock("@/features/memory/embedding-lifecycle", () => ({
  syncMemoryEmbeddingSafely: vi.fn(),
}));
vi.mock("@/features/memory/proposal-service", () => ({
  acceptMemoryProposal: vi.fn(),
  rejectMemoryProposal: vi.fn(),
}));
vi.mock("@/features/memory/queries", () => ({
  getMemories: vi.fn(),
  getPendingMemoryProposals: vi.fn(),
}));
vi.mock("@/features/memory/trusted-write", () => ({
  TrustedMemoryWriteError: class TrustedMemoryWriteError extends Error {},
  writeTrustedMemoryChange: vi.fn(),
}));

import { deleteMemoryAction } from "@/features/memory/actions";

const memoryId = "550e8400-e29b-41d4-a716-446655440001";

function knownPrismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("sensitive database detail", {
    clientVersion: "6.19.3",
    code,
  });
}

describe("memory deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  });

  it("deletes an owned memory and revalidates the memory page", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteMemoryAction(memoryId)).resolves.toMatchObject({
      success: true,
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: memoryId, userId: "owner-id" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/memories");
  });

  it.each(["P2003", "P2014"])(
    "classifies known Prisma relation conflict %s as CONFLICT",
    async (code) => {
      mocks.deleteMany.mockRejectedValue(knownPrismaError(code));

      await expect(deleteMemoryAction(memoryId)).resolves.toMatchObject({
        success: false,
        code: "CONFLICT",
      });
    },
  );

  it("returns a generic failure and logs only a sanitized error code for unknown errors", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.deleteMany.mockRejectedValue(
      new Error("postgresql://secret-user:secret-password@example.invalid/database"),
    );

    await expect(deleteMemoryAction(memoryId)).resolves.toEqual({
      success: false,
      message: "记忆删除失败，请稍后重试。",
      fieldErrors: undefined,
      code: "FAILED",
    });
    expect(errorLog).toHaveBeenCalledWith("memory_delete_failed", {
      userId: "owner-id",
      memoryId,
      errorCode: "Error",
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret-password");
    errorLog.mockRestore();
  });
});
