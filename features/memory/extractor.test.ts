import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  messageFindFirst: vi.fn(),
  memoryFindFirst: vi.fn(),
  memoryFindMany: vi.fn(),
  memoryCreate: vi.fn(),
  memoryUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/ai/collect-text", () => ({ collectGeneratedText: mocks.collect }));
vi.mock("@/lib/ai/registry", () => ({
  getMemoryAiProvider: () => ({ config: { model: "memory-model", temperature: 0.1, maxOutputTokens: 1000 }, provider: {} }),
}));
vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    message: { findFirst: mocks.messageFindFirst },
    memory: { findFirst: mocks.memoryFindFirst, findMany: mocks.memoryFindMany, create: mocks.memoryCreate, updateMany: mocks.memoryUpdateMany },
    $transaction: mocks.transaction,
  },
}));

import { extractAndPersistMemories } from "@/features/memory/extractor";

const input = {
  userId: "user-a",
  conversationId: "conversation-a",
  sourceMessageId: "11111111-1111-4111-8111-111111111111",
  assistantMessageId: "22222222-2222-4222-8222-222222222222",
  currentUserMessage: "以后回答请先给结论，再解释过程。",
  assistantResponse: "明白了。",
  recentTurns: [],
};

function eligible(personaId: string | null = null) {
  mocks.messageFindFirst
    .mockResolvedValueOnce({ id: input.sourceMessageId, conversation: { personaId } })
    .mockResolvedValueOnce({ id: input.assistantMessageId })
    .mockResolvedValueOnce({ id: input.sourceMessageId });
  mocks.memoryFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
  mocks.memoryFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
}

describe("automatic memory persistence", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.transaction.mockImplementation(async (callback) => callback({ message: { findFirst: mocks.messageFindFirst }, memory: { findFirst: mocks.memoryFindFirst, findMany: mocks.memoryFindMany, create: mocks.memoryCreate, updateMany: mocks.memoryUpdateMany } }));
    mocks.memoryCreate.mockResolvedValue({ id: "memory-new" });
    mocks.memoryUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("creates an AUTO_EXTRACTED memory with server-owned source fields", async () => {
    eligible();
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [{ action: "CREATE", content: "用户偏好先给结论，再解释过程", category: "preference", scope: "GLOBAL", importance: 4, confidence: 0.95, reasonCode: "preference" }] }));
    await expect(extractAndPersistMemories(input)).resolves.toEqual({ created: 1, updated: 0 });
    expect(mocks.memoryCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "user-a", origin: "AUTO_EXTRACTED", enabled: true, sourceConversationId: "conversation-a", sourceMessageId: input.sourceMessageId }) });
  });

  it("ignores low-confidence and credential operations", async () => {
    eligible();
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [
      { action: "CREATE", content: "用户今天想写一篇文章", category: "other", scope: "GLOBAL", importance: 2, confidence: 0.5, reasonCode: "temporary" },
      { action: "CREATE", content: "api_key=abcdefghijklmnop1234", category: "other", scope: "GLOBAL", importance: 5, confidence: 0.99, reasonCode: "sensitive" },
    ] }));
    await extractAndPersistMemories(input);
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
  });

  it("updates only an existing candidate whitelist ID", async () => {
    const candidateId = "33333333-3333-4333-8333-333333333333";
    eligible();
    mocks.memoryFindMany.mockReset().mockResolvedValueOnce([{ id: candidateId, content: "用户喜欢详细回答", category: "preference", scope: "GLOBAL", importance: 3, updatedAt: new Date() }]).mockResolvedValueOnce([]);
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [{ action: "UPDATE", existingMemoryId: candidateId, content: "用户偏好简洁并先给结论", category: "preference", scope: "GLOBAL", importance: 4, confidence: 0.96, reasonCode: "preference" }] }));
    await expect(extractAndPersistMemories(input)).resolves.toEqual({ created: 0, updated: 1 });
    expect(mocks.memoryUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: candidateId, userId: "user-a" } }));
  });

  it("rejects a model UPDATE ID outside the candidate whitelist", async () => {
    eligible();
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [{ action: "UPDATE", existingMemoryId: "44444444-4444-4444-8444-444444444444", content: "用户偏好简洁回答", category: "preference", scope: "GLOBAL", importance: 4, confidence: 0.96, reasonCode: "preference" }] }));
    await extractAndPersistMemories(input);
    expect(mocks.memoryUpdateMany).not.toHaveBeenCalled();
  });

  it("maps PERSONA scope only to the current conversation persona", async () => {
    eligible("55555555-5555-4555-8555-555555555555");
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [{ action: "CREATE", content: "用户与该人格长期一起准备考试", category: "relationship", scope: "PERSONA", importance: 4, confidence: 0.95, reasonCode: "relationship" }] }));
    await extractAndPersistMemories({ ...input, persona: { id: "55555555-5555-4555-8555-555555555555", name: "学习伙伴" } });
    expect(mocks.memoryCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ scope: "PERSONA", personaId: "55555555-5555-4555-8555-555555555555" }) });
  });

  it("is idempotent when this source message was already processed", async () => {
    mocks.messageFindFirst.mockResolvedValueOnce({ id: input.sourceMessageId, conversation: { personaId: null } }).mockResolvedValueOnce({ id: input.assistantMessageId });
    mocks.memoryFindFirst.mockResolvedValueOnce({ id: "existing" });
    await expect(extractAndPersistMemories(input)).resolves.toEqual({ created: 0, updated: 0 });
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("does not call the model when eligibility checks fail", async () => {
    mocks.messageFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: input.assistantMessageId });
    await expect(extractAndPersistMemories(input)).resolves.toEqual({ created: 0, updated: 0 });
    expect(mocks.collect).not.toHaveBeenCalled();
  });
});
