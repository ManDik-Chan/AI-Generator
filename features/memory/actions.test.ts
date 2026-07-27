import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  deleteMany: vi.fn(),
  reviewLegacyMemory: vi.fn(),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  updateOwnedMemoryAfterManualReview: vi.fn(),
  writeTrustedMemoryChange: vi.fn(),
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
  writeTrustedMemoryChange: mocks.writeTrustedMemoryChange,
}));
vi.mock("@/features/memory/review-service", () => ({
  reviewLegacyMemory: mocks.reviewLegacyMemory,
  updateOwnedMemoryAfterManualReview: mocks.updateOwnedMemoryAfterManualReview,
}));

import {
  createMemoryAction,
  deleteMemoryAction,
  markMemoryReviewedAction,
} from "@/features/memory/actions";

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
    mocks.writeTrustedMemoryChange.mockResolvedValue({
      memoryId,
      created: true,
      updated: false,
      idempotent: false,
    });
  });

  it("forces browser-created memory through the manual verification mapping", async () => {
    await expect(createMemoryAction({
      content: "用户偏好简洁回答",
      category: "preference",
      scope: "GLOBAL",
      importance: 4,
      enabled: true,
      origin: "CHAT_MESSAGE",
      sourceConversationId: "550e8400-e29b-41d4-a716-446655440002",
      sourceMessageId: "550e8400-e29b-41d4-a716-446655440003",
    })).resolves.toMatchObject({ success: true, id: memoryId });

    expect(mocks.writeTrustedMemoryChange).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-id",
        origin: "MANUAL",
        verificationSource: "MANUAL_CREATE",
      }),
    );
    const write = mocks.writeTrustedMemoryChange.mock.calls[0]?.[0];
    expect(write).not.toHaveProperty("sourceConversationId");
    expect(write).not.toHaveProperty("sourceMessageId");
  });

  it("maps an owner-scoped review miss to NOT_FOUND", async () => {
    mocks.reviewLegacyMemory.mockResolvedValue({
      success: false,
      code: "NOT_FOUND",
    });

    await expect(markMemoryReviewedAction(memoryId)).resolves.toMatchObject({
      success: false,
      code: "NOT_FOUND",
    });
    expect(mocks.reviewLegacyMemory).toHaveBeenCalledWith(
      "owner-id",
      memoryId,
    );
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
