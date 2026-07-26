import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  messageFindFirst: vi.fn(),
  messageFindMany: vi.fn(),
  conversationFindFirst: vi.fn(),
  profileFindFirst: vi.fn(),
  personaFindFirst: vi.fn(),
  memoryFindFirst: vi.fn(),
  memoryFindMany: vi.fn(),
  memoryCreate: vi.fn(),
  memoryUpdate: vi.fn(),
  memoryUpdateMany: vi.fn(),
  memoryCount: vi.fn(),
  proposalFindFirst: vi.fn(),
  proposalFindMany: vi.fn(),
  proposalCreateMany: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/features/memory/provider", () => ({
  requestMemoryModelText: async (input: unknown) => ({
    text: await mocks.collect(input),
    modelUsed: "memory-model",
  }),
}));
vi.mock("@/lib/ai/registry", () => ({
  getMemoryAiProvider: () => ({
    config: { model: "memory-model", temperature: 0.1, maxOutputTokens: 1000 },
    fallbackModel: "shared-model",
    provider: {},
  }),
}));
vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    message: {
      findFirst: mocks.messageFindFirst,
      findMany: mocks.messageFindMany,
    },
    memory: {
      findFirst: mocks.memoryFindFirst,
      findMany: mocks.memoryFindMany,
      create: mocks.memoryCreate,
      update: mocks.memoryUpdate,
      updateMany: mocks.memoryUpdateMany,
      count: mocks.memoryCount,
    },
    memoryProposal: {
      findFirst: mocks.proposalFindFirst,
      findMany: mocks.proposalFindMany,
      createMany: mocks.proposalCreateMany,
    },
    profile: { findFirst: mocks.profileFindFirst },
    persona: { findFirst: mocks.personaFindFirst },
    conversation: { findFirst: mocks.conversationFindFirst },
    $transaction: mocks.transaction,
  },
}));

import { extractAndPersistMemoryProposals } from "@/features/memory/extractor";

const input = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  conversationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  sourceMessageId: "11111111-1111-4111-8111-111111111111",
  assistantMessageId: "22222222-2222-4222-8222-222222222222",
  currentUserMessage: "以后回答请先给结论，再解释过程。",
  assistantResponse: "明白了。",
  recentTurns: [],
};

const createOperation = {
  action: "CREATE",
  content: "用户偏好回答时先给结论，再解释过程",
  category: "preference",
  scope: "GLOBAL",
  importance: 4,
  topicKey: "preference.answer_style",
  keywords: ["回答风格", "先给结论"],
  confidence: 0.95,
  reasonCode: "preference",
};

function transactionClient() {
  return {
    message: { findFirst: mocks.messageFindFirst },
    conversation: { findFirst: mocks.conversationFindFirst },
    profile: { findFirst: mocks.profileFindFirst },
    persona: { findFirst: mocks.personaFindFirst },
    memory: {
      findFirst: mocks.memoryFindFirst,
      findMany: mocks.memoryFindMany,
      create: mocks.memoryCreate,
      update: mocks.memoryUpdate,
      updateMany: mocks.memoryUpdateMany,
      count: mocks.memoryCount,
    },
    memoryProposal: {
      findFirst: mocks.proposalFindFirst,
      findMany: mocks.proposalFindMany,
      createMany: mocks.proposalCreateMany,
    },
    $queryRaw: mocks.queryRaw,
  };
}

function eligibleImplicit(personaId: string | null = null) {
  mocks.messageFindFirst
    .mockResolvedValueOnce({ id: input.sourceMessageId, conversation: { personaId } })
    .mockResolvedValueOnce({ id: input.assistantMessageId })
    .mockResolvedValueOnce({ id: input.sourceMessageId });
  mocks.proposalFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
}

describe("trusted memory proposal extraction", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.messageFindMany.mockResolvedValue([]);
    mocks.memoryFindFirst.mockResolvedValue(null);
    mocks.memoryFindMany.mockResolvedValue([]);
    mocks.memoryCount.mockResolvedValue(0);
    mocks.memoryCreate.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333" });
    mocks.memoryUpdate.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333" });
    mocks.memoryUpdateMany.mockResolvedValue({ count: 1 });
    mocks.proposalCreateMany.mockResolvedValue({ count: 1 });
    mocks.proposalFindMany.mockResolvedValue([]);
    mocks.queryRaw.mockResolvedValue([{ memoryEnabled: true }]);
    mocks.profileFindFirst.mockResolvedValue({ id: input.userId });
    mocks.conversationFindFirst.mockResolvedValue({ id: input.conversationId });
    mocks.transaction.mockImplementation(async (callback) => callback(transactionClient()));
  });

  it("persists an implicit fact only as a pending proposal", async () => {
    eligibleImplicit();
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [createOperation] }));

    await expect(extractAndPersistMemoryProposals(input)).resolves.toEqual({
      proposed: 1,
      created: 0,
      updated: 0,
      memoryIds: [],
    });
    expect(mocks.proposalCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        userId: input.userId,
        action: "CREATE",
        status: "PENDING",
        sourceConversationId: input.conversationId,
        sourceMessageId: input.sourceMessageId,
        dedupeKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      })],
      skipDuplicates: true,
    });
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
    expect(mocks.memoryUpdateMany).not.toHaveBeenCalled();
  });

  it.each([
    { action: "IGNORE", confidence: 1, reasonCode: "temporary" },
    { ...createOperation, confidence: 0.5 },
    { ...createOperation, reasonCode: "temporary" },
    { ...createOperation, reasonCode: "uncertain" },
    { ...createOperation, reasonCode: "sensitive" },
    { ...createOperation, content: "api_key=abcdefghijklmnop1234" },
  ])("does not create a proposal for ignored, weak, unsafe, or credential output", async (operation) => {
    eligibleImplicit();
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [operation] }));
    await expect(extractAndPersistMemoryProposals(input)).resolves.toEqual({
      proposed: 0,
      created: 0,
      updated: 0,
      memoryIds: [],
    });
    expect(mocks.proposalCreateMany).not.toHaveBeenCalled();
  });

  it("requires traceable USER evidence for implicit proposals", async () => {
    eligibleImplicit();
    mocks.collect.mockResolvedValue(JSON.stringify({
      operations: [{ ...createOperation, content: "用户的显卡是 RTX 5090" }],
    }));
    await extractAndPersistMemoryProposals(input);
    expect(mocks.proposalCreateMany).not.toHaveBeenCalled();
  });

  it("does not call the provider when memory is disabled or messages are ineligible", async () => {
    mocks.messageFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: input.assistantMessageId });
    await expect(extractAndPersistMemoryProposals(input)).resolves.toEqual({
      proposed: 0,
      created: 0,
      updated: 0,
      memoryIds: [],
    });
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("suppresses an equivalent rejected fact even from a replayed source", async () => {
    eligibleImplicit();
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [createOperation] }));
    mocks.proposalFindMany.mockImplementationOnce(async (args) => [{
      suppressionKey: args.where.suppressionKey.in[0],
    }]);
    await extractAndPersistMemoryProposals(input);
    expect(mocks.collect).toHaveBeenCalled();
    expect(mocks.proposalCreateMany).not.toHaveBeenCalled();
  });

  it("captures the target updatedAt snapshot for UPDATE", async () => {
    const targetId = "44444444-4444-4444-8444-444444444444";
    const snapshot = new Date("2026-07-24T00:00:00Z");
    eligibleImplicit();
    mocks.memoryFindMany
      .mockResolvedValueOnce([{
        id: targetId,
        content: "用户偏好详细回答",
        category: "preference",
        scope: "GLOBAL",
        importance: 3,
        updatedAt: snapshot,
        revision: 4,
        topicKey: "preference.answer_style",
        keywords: ["回答"],
      }])
      .mockResolvedValueOnce([]);
    mocks.memoryFindFirst.mockResolvedValueOnce({ id: targetId, revision: 4 });
    mocks.collect.mockResolvedValue(JSON.stringify({
      operations: [{
        ...createOperation,
        action: "UPDATE",
        existingMemoryId: targetId,
      }],
    }));
    await extractAndPersistMemoryProposals(input);
    expect(mocks.proposalCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        action: "UPDATE",
        targetMemoryId: targetId,
        targetMemoryUpdatedAt: snapshot,
        targetMemoryRevision: 4,
      })],
    }));
  });

  it("converts same-topic CREATE into a version-protected UPDATE proposal", async () => {
    const snapshot = new Date("2026-07-24T00:00:00Z");
    eligibleImplicit();
    mocks.memoryFindFirst
      .mockResolvedValueOnce({
        id: "55555555-5555-4555-8555-555555555555",
        updatedAt: snapshot,
        revision: 7,
      })
      .mockResolvedValueOnce({
        id: "55555555-5555-4555-8555-555555555555",
        revision: 7,
      });
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [createOperation] }));
    await extractAndPersistMemoryProposals(input);
    expect(mocks.proposalCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        action: "UPDATE",
        targetMemoryUpdatedAt: snapshot,
        targetMemoryRevision: 7,
      })],
    }));
  });

  it("deduplicates equivalent operations in one model batch before INSERT", async () => {
    eligibleImplicit();
    mocks.collect.mockResolvedValue(JSON.stringify({
      operations: [
        createOperation,
        {
          ...createOperation,
          content: "用户偏好回答时先给结论, 再解释过程!!!",
          keywords: ["先给结论", "回答风格", "回答风格"],
        },
      ],
    }));
    await extractAndPersistMemoryProposals(input);
    const call = mocks.proposalCreateMany.mock.calls[0]?.[0];
    expect(call.data).toHaveLength(1);
  });

  it("keeps two genuinely different facts from the same source message", async () => {
    const multiFactInput = {
      ...input,
      currentUserMessage: "我偏好回答先给结论，而且我的默认语言是中文。",
    };
    eligibleImplicit();
    mocks.collect.mockResolvedValue(JSON.stringify({
      operations: [
        createOperation,
        {
          ...createOperation,
          content: "用户的默认语言是中文",
          category: "profile",
          topicKey: "profile.default_language",
          keywords: ["默认语言", "中文"],
          reasonCode: "stable_fact",
        },
      ],
    }));
    await extractAndPersistMemoryProposals(multiFactInput);
    const call = mocks.proposalCreateMany.mock.calls[0]?.[0];
    expect(call.data).toHaveLength(2);
    expect(new Set(call.data.map((row: { dedupeKey: string }) => row.dedupeKey)).size).toBe(2);
  });

  it("routes a non-command statement containing '记住' to Proposal", async () => {
    const ordinary = {
      ...input,
      currentUserMessage: "我终于记住了：我的电脑配置是 RTX 5080。",
    };
    eligibleImplicit();
    mocks.collect.mockResolvedValue(JSON.stringify({
      operations: [{
        ...createOperation,
        content: "用户的电脑配置是 RTX 5080",
        category: "profile",
        topicKey: "profile.computer_configuration",
        keywords: ["电脑配置", "RTX 5080"],
        reasonCode: "stable_fact",
      }],
    }));
    await expect(extractAndPersistMemoryProposals(ordinary)).resolves.toMatchObject({
      proposed: 1,
      created: 0,
      updated: 0,
    });
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
    expect(mocks.proposalCreateMany).toHaveBeenCalledTimes(1);
  });

  it("preserves explicit 'remember this' as a trusted formal write", async () => {
    const explicit = {
      ...input,
      currentUserMessage: "以后记得回答时先给结论，再解释过程。",
    };
    mocks.messageFindFirst
      .mockResolvedValueOnce({ id: input.sourceMessageId, conversation: { personaId: null } })
      .mockResolvedValueOnce({ id: input.assistantMessageId })
      .mockResolvedValueOnce({ id: input.sourceMessageId })
      .mockResolvedValueOnce({ id: input.sourceMessageId });
    mocks.memoryFindFirst.mockResolvedValue(null);
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [createOperation] }));
    await expect(extractAndPersistMemoryProposals(explicit)).resolves.toEqual({
      proposed: 0,
      created: 1,
      updated: 0,
      memoryIds: ["33333333-3333-4333-8333-333333333333"],
    });
    expect(mocks.memoryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: input.userId,
        origin: "AUTO_EXTRACTED",
        sourceMessageId: input.sourceMessageId,
      }),
      select: { id: true },
    });
    expect(mocks.proposalCreateMany).not.toHaveBeenCalled();
  });
});
