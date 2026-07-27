import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findFirst: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    memory: {
      updateMany: mocks.updateMany,
      findFirst: mocks.findFirst,
    },
  },
}));

import {
  reviewLegacyMemory,
  updateOwnedMemoryAfterManualReview,
} from "@/features/memory/review-service";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const memoryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = new Date("2026-07-27T01:37:53.000Z");

describe("legacy memory review service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      (callback: (transaction: {
        memory: {
          findFirst: typeof mocks.findFirst;
          updateMany: typeof mocks.updateMany;
        };
      }) => unknown) => callback({
        memory: {
          findFirst: mocks.findFirst,
          updateMany: mocks.updateMany,
        },
      }),
    );
  });

  it("atomically changes only owned legacy verification fields", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await expect(reviewLegacyMemory(userId, memoryId, now)).resolves.toEqual({
      success: true,
      idempotent: false,
      verificationMethod: "MANUAL_REVIEW",
      verifiedAt: now,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: memoryId,
        userId,
        verificationMethod: "LEGACY_UNREVIEWED",
      },
      data: {
        verificationMethod: "MANUAL_REVIEW",
        verifiedAt: now,
      },
    });
  });

  it("returns idempotent success after an already completed review", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findFirst.mockResolvedValue({
      verificationMethod: "MANUAL_REVIEW",
      verifiedAt: now,
    });
    await expect(reviewLegacyMemory(userId, memoryId, now)).resolves.toEqual({
      success: true,
      idempotent: true,
      verificationMethod: "MANUAL_REVIEW",
      verifiedAt: now,
    });
  });

  it("does not reveal a cross-owner memory", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findFirst.mockResolvedValue(null);
    await expect(reviewLegacyMemory(userId, memoryId, now)).resolves.toEqual({
      success: false,
      code: "NOT_FOUND",
    });
  });

  it("maps a sanitized manual edit to MANUAL_REVIEW", async () => {
    mocks.findFirst.mockResolvedValue({
      content: "用户偏好先给结论",
      category: "preference",
      scope: "GLOBAL",
      personaId: null,
      importance: 4,
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await updateOwnedMemoryAfterManualReview(userId, memoryId, {
      content: "用户偏好先给结论和证据",
      category: "preference",
      scope: "GLOBAL",
      personaId: null,
      importance: 4,
      enabled: true,
    }, now);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: memoryId,
        userId,
        content: "用户偏好先给结论",
        category: "preference",
        scope: "GLOBAL",
        personaId: null,
        importance: 4,
      },
      data: {
        content: "用户偏好先给结论和证据",
        category: "preference",
        scope: "GLOBAL",
        personaId: null,
        importance: 4,
        enabled: true,
        verificationMethod: "MANUAL_REVIEW",
        verifiedAt: now,
      },
    });
  });

  it("does not change verification when the form only toggles enabled", async () => {
    mocks.findFirst.mockResolvedValue({
      content: "用户偏好先给结论",
      category: "preference",
      scope: "GLOBAL",
      personaId: null,
      importance: 4,
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(updateOwnedMemoryAfterManualReview(userId, memoryId, {
      content: "用户偏好先给结论",
      category: "preference",
      scope: "GLOBAL",
      personaId: null,
      importance: 4,
      enabled: false,
    }, now)).resolves.toEqual({ count: 1 });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: memoryId,
        userId,
        content: "用户偏好先给结论",
        category: "preference",
        scope: "GLOBAL",
        personaId: null,
        importance: 4,
      },
      data: {
        content: "用户偏好先给结论",
        category: "preference",
        scope: "GLOBAL",
        personaId: null,
        importance: 4,
        enabled: false,
      },
    });
  });
});
