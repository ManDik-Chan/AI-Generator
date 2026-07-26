import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  proposalFindFirst: vi.fn(),
  proposalUpdateMany: vi.fn(),
  profileFindFirst: vi.fn(),
  personaFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
  messageFindFirst: vi.fn(),
  memoryFindFirst: vi.fn(),
  memoryFindMany: vi.fn(),
  memoryCreate: vi.fn(),
  memoryUpdate: vi.fn(),
  memoryUpdateMany: vi.fn(),
  memoryCount: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import {
  acceptMemoryProposal,
  rejectMemoryProposal,
} from "@/features/memory/proposal-service";
import { runSerializableMemoryTransaction } from "@/features/memory/trusted-write";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const proposalId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sourceConversationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const sourceMessageId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const memoryId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const snapshot = new Date("2026-07-24T00:00:00Z");

const baseProposal = {
  id: proposalId,
  userId,
  personaId: null,
  action: "CREATE" as const,
  status: "PENDING" as const,
  targetMemoryId: null,
  targetMemoryUpdatedAt: null,
  targetMemoryRevision: null,
  resolvedMemoryId: null,
  content: "用户偏好回答时先给结论，再解释过程",
  category: "preference",
  scope: "GLOBAL" as const,
  importance: 4,
  topicKey: "preference.answer_style",
  keywords: ["回答风格", "先给结论"],
  confidence: 0.95,
  reasonCode: "preference",
  sourceConversationId,
  sourceMessageId,
  dedupeKey: "a".repeat(64),
  suppressionKey: "b".repeat(64),
  expiresAt: new Date("2026-08-23T00:00:00Z"),
  resolvedAt: null,
  createdAt: snapshot,
  updatedAt: snapshot,
};

function transactionClient() {
  return {
    memoryProposal: {
      findFirst: mocks.proposalFindFirst,
      updateMany: mocks.proposalUpdateMany,
    },
    profile: { findFirst: mocks.profileFindFirst },
    persona: { findFirst: mocks.personaFindFirst },
    conversation: { findFirst: mocks.conversationFindFirst },
    message: { findFirst: mocks.messageFindFirst },
    memory: {
      findFirst: mocks.memoryFindFirst,
      findMany: mocks.memoryFindMany,
      create: mocks.memoryCreate,
      update: mocks.memoryUpdate,
      updateMany: mocks.memoryUpdateMany,
      count: mocks.memoryCount,
    },
    $queryRaw: mocks.queryRaw,
  };
}

describe("trusted memory proposal resolution", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.transaction.mockImplementation(async (callback) => callback(transactionClient()));
    mocks.proposalFindFirst.mockResolvedValue(baseProposal);
    mocks.proposalUpdateMany.mockResolvedValue({ count: 1 });
    mocks.profileFindFirst.mockResolvedValue({ id: userId });
    mocks.conversationFindFirst.mockResolvedValue({ id: sourceConversationId });
    mocks.messageFindFirst.mockResolvedValue({ id: sourceMessageId });
    mocks.memoryFindFirst.mockResolvedValue(null);
    mocks.memoryFindMany.mockResolvedValue([]);
    mocks.memoryCount.mockResolvedValue(0);
    mocks.memoryCreate.mockResolvedValue({ id: memoryId });
    mocks.memoryUpdate.mockResolvedValue({ id: memoryId });
    mocks.memoryUpdateMany.mockResolvedValue({ count: 1 });
    mocks.queryRaw.mockResolvedValue([{ memoryEnabled: true }]);
  });

  it("retries PostgreSQL 40001 when Prisma wraps raw SQL as P2010", async () => {
    mocks.transaction
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
        "could not serialize access due to concurrent update",
        {
          code: "P2010",
          clientVersion: Prisma.prismaVersion.client,
          meta: { code: "40001" },
        },
      ))
      .mockResolvedValueOnce("retried");

    await expect(runSerializableMemoryTransaction(async () => "unused"))
      .resolves.toBe("retried");
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });

  it("accepts CREATE exactly once and atomically resolves the proposal", async () => {
    await expect(acceptMemoryProposal(userId, proposalId)).resolves.toMatchObject({
      success: true,
      memoryId,
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.memoryCreate).toHaveBeenCalledTimes(1);
    expect(mocks.proposalUpdateMany).toHaveBeenCalledWith({
      where: { id: proposalId, userId, status: "PENDING" },
      data: expect.objectContaining({
        status: "ACCEPTED",
        resolvedMemoryId: memoryId,
        resolvedAt: expect.any(Date),
      }),
    });
  });

  it("makes a repeated accept idempotent", async () => {
    mocks.proposalFindFirst.mockResolvedValue({
      ...baseProposal,
      status: "ACCEPTED",
      resolvedMemoryId: memoryId,
      resolvedAt: new Date(),
    });
    await expect(acceptMemoryProposal(userId, proposalId)).resolves.toEqual({
      success: true,
      stateChanged: false,
      finalStatus: "ACCEPTED",
      memoryId,
      idempotent: true,
      message: "这条建议已经确认。",
    });
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
    expect(mocks.memoryUpdateMany).not.toHaveBeenCalled();
  });

  it("accepts UPDATE only against the matching version snapshot", async () => {
    mocks.proposalFindFirst.mockResolvedValue({
      ...baseProposal,
      action: "UPDATE",
      targetMemoryId: memoryId,
      targetMemoryUpdatedAt: snapshot,
      targetMemoryRevision: 1,
    });
    mocks.memoryFindFirst
      .mockResolvedValueOnce({
        id: memoryId,
        scope: "GLOBAL",
        personaId: null,
        enabled: true,
        revision: 1,
      })
      .mockResolvedValueOnce(null);
    await expect(acceptMemoryProposal(userId, proposalId)).resolves.toMatchObject({
      success: true,
      memoryId,
    });
    expect(mocks.memoryUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: memoryId,
        userId,
        enabled: true,
        revision: 1,
      },
    }));
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
  });

  it("keeps an UPDATE proposal pending when the target changed", async () => {
    mocks.proposalFindFirst.mockResolvedValue({
      ...baseProposal,
      action: "UPDATE",
      targetMemoryId: memoryId,
      targetMemoryUpdatedAt: snapshot,
      targetMemoryRevision: 1,
    });
    mocks.memoryFindFirst.mockResolvedValue({
      id: memoryId,
      scope: "GLOBAL",
      personaId: null,
      enabled: true,
      revision: 2,
    });
    await expect(acceptMemoryProposal(userId, proposalId)).resolves.toEqual({
      success: false,
      stateChanged: false,
      finalStatus: "PENDING",
      code: "CONFLICT",
      message: "原记忆已发生变化，请刷新后检查最新版本。",
    });
    expect(mocks.memoryUpdateMany).not.toHaveBeenCalled();
    expect(mocks.proposalUpdateMany).not.toHaveBeenCalled();
  });

  it("never downgrades a deleted UPDATE target to CREATE", async () => {
    mocks.proposalFindFirst.mockResolvedValue({
      ...baseProposal,
      action: "UPDATE",
      targetMemoryId: memoryId,
      targetMemoryUpdatedAt: snapshot,
      targetMemoryRevision: 1,
    });
    await expect(acceptMemoryProposal(userId, proposalId)).resolves.toEqual({
      success: false,
      stateChanged: false,
      finalStatus: "PENDING",
      code: "CONFLICT",
      message: "原记忆已不存在，不能改为新增记忆。",
    });
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
  });

  it("revalidates edited content and rejects server-owned field forgery", async () => {
    const edited = {
      content: "用户偏好简洁回答",
      category: "preference" as const,
      scope: "GLOBAL" as const,
      importance: 4,
      topicKey: "preference.answer_style",
      keywords: ["简洁"],
      userId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    };
    await expect(acceptMemoryProposal(userId, proposalId, edited as never)).resolves.toMatchObject({
      success: false,
      code: "INVALID_INPUT",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("blocks acceptance while the master memory switch is off", async () => {
    mocks.queryRaw.mockResolvedValue([{ memoryEnabled: false }]);
    await expect(acceptMemoryProposal(userId, proposalId)).resolves.toEqual({
      success: false,
      stateChanged: false,
      finalStatus: "PENDING",
      code: "MEMORY_DISABLED",
      message: "请先开启长期记忆，再确认这条建议。",
    });
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
    expect(mocks.proposalUpdateMany).not.toHaveBeenCalled();
  });

  it("expires stale proposals instead of writing formal memory", async () => {
    mocks.proposalFindFirst.mockResolvedValue({
      ...baseProposal,
      expiresAt: new Date("2026-01-01T00:00:00Z"),
    });
    await expect(acceptMemoryProposal(userId, proposalId)).resolves.toEqual({
      success: false,
      stateChanged: true,
      finalStatus: "EXPIRED",
      code: "EXPIRED",
      message: "这条建议已过期，不能确认。",
    });
    expect(mocks.proposalUpdateMany).toHaveBeenCalledWith({
      where: { id: proposalId, userId, status: "PENDING" },
      data: { status: "EXPIRED", resolvedAt: expect.any(Date) },
    });
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
  });

  it("rejects only the owner's pending proposal without touching Memory", async () => {
    await expect(rejectMemoryProposal(userId, proposalId)).resolves.toEqual({
      success: true,
      stateChanged: true,
      finalStatus: "REJECTED",
      message: "建议已拒绝，不会写入长期记忆。",
    });
    expect(mocks.proposalUpdateMany).toHaveBeenCalledWith({
      where: { id: proposalId, userId, status: "PENDING" },
      data: { status: "REJECTED", resolvedAt: expect.any(Date) },
    });
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
    expect(mocks.memoryUpdateMany).not.toHaveBeenCalled();
  });

  it("returns one unauthorized result for a foreign proposal id", async () => {
    mocks.proposalFindFirst.mockResolvedValue(null);
    await expect(acceptMemoryProposal(userId, proposalId)).resolves.toEqual({
      success: false,
      stateChanged: false,
      finalStatus: "PENDING",
      code: "NOT_FOUND",
      message: "建议不存在或无权访问。",
    });
  });
});
