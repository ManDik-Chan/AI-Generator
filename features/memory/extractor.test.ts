import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  messageFindFirst: vi.fn(),
  messageFindMany: vi.fn(),
  memoryFindFirst: vi.fn(),
  memoryFindMany: vi.fn(),
  memoryCreate: vi.fn(),
  memoryUpdateMany: vi.fn(),
  memoryCount: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/ai/collect-text", () => ({ collectGeneratedText: mocks.collect }));
vi.mock("@/features/memory/provider", () => ({ requestMemoryModelText: async (input: unknown) => ({ text: await mocks.collect(input), modelUsed: "memory-model" }) }));
vi.mock("@/lib/ai/registry", () => ({
  getMemoryAiProvider: () => ({ config: { model: "memory-model", temperature: 0.1, maxOutputTokens: 1000 }, fallbackModel: "shared-model", provider: {} }),
}));
vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    message: { findFirst: mocks.messageFindFirst, findMany: mocks.messageFindMany },
    memory: { findFirst: mocks.memoryFindFirst, findMany: mocks.memoryFindMany, create: mocks.memoryCreate, updateMany: mocks.memoryUpdateMany, count: mocks.memoryCount },
    $transaction: mocks.transaction,
  },
}));

import { extractAndPersistMemories } from "@/features/memory/extractor";
import { AiProviderError } from "@/lib/ai/errors";

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
    mocks.messageFindMany.mockResolvedValue([]);
    mocks.memoryCount.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (callback) => callback({ message: { findFirst: mocks.messageFindFirst }, memory: { findFirst: mocks.memoryFindFirst, findMany: mocks.memoryFindMany, create: mocks.memoryCreate, updateMany: mocks.memoryUpdateMany, count: mocks.memoryCount } }));
    mocks.memoryCreate.mockResolvedValue({ id: "memory-new" });
    mocks.memoryUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("creates an AUTO_EXTRACTED memory with server-owned source fields", async () => {
    eligible();
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [{ action: "CREATE", content: "用户偏好先给结论，再解释过程", category: "preference", scope: "GLOBAL", importance: 4, topicKey: "preference.answer_style", keywords: ["回答风格", "先给结论"], confidence: 0.95, reasonCode: "preference" }] }));
    await expect(extractAndPersistMemories(input)).resolves.toEqual({ created: 1, updated: 0 });
    expect(mocks.collect).toHaveBeenCalledWith(expect.objectContaining({ request: expect.objectContaining({ messages: [expect.objectContaining({ role: "system" }), expect.objectContaining({ role: "user" })], thinking: "disabled" }) }));
    expect(mocks.memoryCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "user-a", origin: "AUTO_EXTRACTED", enabled: true, sourceConversationId: "conversation-a", sourceMessageId: input.sourceMessageId }) });
  });

  it("converts CREATE to UPDATE when the same scoped topic already exists", async () => {
    eligible();
    mocks.memoryFindFirst.mockResolvedValueOnce({ id: "same-topic" });
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [{ action: "CREATE", content: "用户电脑已升级到 RTX 5080", category: "profile", scope: "GLOBAL", importance: 4, topicKey: "profile.computer_configuration", keywords: ["电脑配置", "RTX 5080"], confidence: 0.98, reasonCode: "stable_fact" }] }));
    await expect(extractAndPersistMemories(input)).resolves.toEqual({ created: 0, updated: 1 });
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
    expect(mocks.memoryUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "same-topic", userId: "user-a" }, data: expect.objectContaining({ keywords: ["电脑配置", "RTX 5080"] }) }));
  });

  it("rejects CREATE at capacity while leaving UPDATE available", async () => {
    eligible(); mocks.memoryCount.mockResolvedValue(300);
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [{ action: "CREATE", content: "用户长期使用机械键盘", category: "preference", scope: "GLOBAL", importance: 3, topicKey: "preference.keyboard", keywords: ["键盘", "机械键盘"], confidence: 0.96, reasonCode: "preference" }] }));
    await expect(extractAndPersistMemories(input)).resolves.toEqual({ created: 0, updated: 0 });
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
  });

  it("ignores low-confidence and credential operations", async () => {
    eligible();
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [
      { action: "CREATE", content: "用户今天想写一篇文章", category: "other", scope: "GLOBAL", importance: 2, topicKey: "other.temporary", keywords: ["文章"], confidence: 0.5, reasonCode: "temporary" },
      { action: "CREATE", content: "api_key=abcdefghijklmnop1234", category: "other", scope: "GLOBAL", importance: 5, topicKey: "other.secret", keywords: ["敏感信息"], confidence: 0.99, reasonCode: "sensitive" },
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
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [{ action: "CREATE", content: "用户与该人格长期一起准备考试", category: "relationship", scope: "PERSONA", importance: 4, topicKey: "relationship.exam", keywords: ["考试", "学习伙伴"], confidence: 0.95, reasonCode: "relationship" }] }));
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

  it("wraps provider failures with the exact stage and configured model without persisting", async () => {
    eligible();
    mocks.collect.mockRejectedValue(new AiProviderError("AUTHENTICATION", "secret provider body", 401));
    await expect(extractAndPersistMemories(input)).rejects.toMatchObject({
      stage: "provider_request",
      explicitIntent: undefined,
      configuredModel: "memory-model",
      originalError: expect.objectContaining({ code: "AUTHENTICATION", status: 401 }),
    });
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
    expect(mocks.memoryUpdateMany).not.toHaveBeenCalled();
  });

  it("loads earlier USER messages for an explicit previous-context request and creates one consolidated configuration", async () => {
    eligible();
    mocks.messageFindMany.mockResolvedValue([
      { role: "ASSISTANT", content: "你的配置包括这些硬件。" },
      { role: "USER", content: "我的显卡是 RTX 5070 Ti，处理器是 Intel Core i5-12600K，显示器是 2K 240Hz。" },
    ]);
    mocks.collect.mockResolvedValue('```json\n{"operations":[{"action":"CREATE","content":"用户的电脑配置为：RTX 5070 Ti 显卡、Intel Core i5-12600K 处理器、2K 240Hz 显示器。","category":"profile","scope":"GLOBAL","importance":4,"topicKey":"profile.computer_configuration","keywords":["电脑配置","GPU","CPU"],"confidence":0.98,"reasonCode":"stable_fact"}]}\n```');
    const result = await extractAndPersistMemories({ ...input, currentUserMessage: "我需要你记住我的电脑配置。" });
    expect(result).toEqual({ created: 1, updated: 0 });
    expect(mocks.messageFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 30, where: expect.objectContaining({ conversationId: "conversation-a", conversation: { userId: "user-a" } }) }));
    expect(mocks.memoryCreate).toHaveBeenCalledTimes(1);
    expect(mocks.memoryCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ content: expect.stringContaining("RTX 5070 Ti") }) });
  });

  it("does not save hardware suggested only by the assistant", async () => {
    eligible();
    mocks.messageFindMany.mockResolvedValue([{ role: "ASSISTANT", content: "我推荐 RTX 5090。" }, { role: "USER", content: "我想升级电脑，但还没有决定型号。" }]);
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [{ action: "CREATE", content: "用户的显卡是 RTX 5090", category: "profile", scope: "GLOBAL", importance: 4, topicKey: "profile.computer_configuration", keywords: ["显卡", "RTX 5090"], confidence: 0.99, reasonCode: "stable_fact" }] }));
    await extractAndPersistMemories({ ...input, currentUserMessage: "对，就这些，帮我记住。" });
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
  });

  it("allows a confirmed assistant summary only when earlier USER evidence exists", async () => {
    eligible();
    mocks.messageFindMany.mockResolvedValue([{ role: "ASSISTANT", content: "你的显卡是 RTX 5070 Ti。" }, { role: "USER", content: "我的显卡是 RTX 5070 Ti。" }]);
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [{ action: "CREATE", content: "用户的显卡是 RTX 5070 Ti", category: "profile", scope: "GLOBAL", importance: 4, topicKey: "profile.computer_configuration", keywords: ["显卡", "RTX 5070 Ti"], confidence: 0.99, reasonCode: "stable_fact" }] }));
    await extractAndPersistMemories({ ...input, currentUserMessage: "对，就这些，帮我记住。" });
    expect(mocks.memoryCreate).toHaveBeenCalledOnce();
  });

  it("requests JSON repair at most once", async () => {
    eligible();
    mocks.collect.mockResolvedValueOnce("not json").mockResolvedValueOnce(JSON.stringify({ operations: [] }));
    await extractAndPersistMemories(input);
    expect(mocks.collect).toHaveBeenCalledTimes(2);
    expect(mocks.collect.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ request: expect.objectContaining({ messages: [expect.objectContaining({ role: "system" }), expect.objectContaining({ role: "user" })], thinking: "disabled", temperature: 0 }) }));

    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.messageFindMany.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (callback) => callback({ message: { findFirst: mocks.messageFindFirst }, memory: { findFirst: mocks.memoryFindFirst, findMany: mocks.memoryFindMany, create: mocks.memoryCreate, updateMany: mocks.memoryUpdateMany, count: mocks.memoryCount } }));
    eligible();
    mocks.collect.mockResolvedValue("still invalid");
    await expect(extractAndPersistMemories(input)).rejects.toBeTruthy();
    expect(mocks.collect).toHaveBeenCalledTimes(2);
  });

  it("updates a consolidated computer configuration instead of creating a conflicting GPU memory", async () => {
    const candidateId = "66666666-6666-4666-8666-666666666666";
    eligible();
    mocks.messageFindMany.mockResolvedValue([{ role: "USER", content: "我的电脑原来是 RTX 5070 Ti、i5-12600K 和 2K 240Hz。" }]);
    mocks.memoryFindMany.mockReset().mockResolvedValueOnce([{ id: candidateId, content: "用户的电脑配置为：RTX 5070 Ti 显卡、Intel Core i5-12600K 处理器、2K 240Hz 显示器。", category: "profile", scope: "GLOBAL", importance: 4, topicKey: "profile.computer_configuration", keywords: ["RTX 5070 Ti", "i5-12600K", "2K 240Hz"], updatedAt: new Date() }]).mockResolvedValueOnce([]);
    mocks.collect.mockResolvedValue(JSON.stringify({ operations: [{ action: "UPDATE", existingMemoryId: candidateId, content: "用户的电脑配置为：RTX 5080 显卡、Intel Core i5-12600K 处理器、2K 240Hz 显示器。", category: "profile", scope: "GLOBAL", importance: 4, topicKey: "profile.computer_configuration", keywords: ["RTX 5080", "i5-12600K", "2K 240Hz"], confidence: 0.99, reasonCode: "stable_fact" }] }));
    await extractAndPersistMemories({ ...input, currentUserMessage: "我的显卡换成 RTX 5080 了，记住一下。" });
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
    expect(mocks.memoryUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: candidateId, userId: "user-a" }, data: expect.objectContaining({ content: "用户的电脑配置为：RTX 5080 显卡、Intel Core i5-12600K 处理器、2K 240Hz 显示器。", topicKey: "profile.computer_configuration", keywords: ["RTX 5080", "i5-12600K", "2K 240Hz"], sourceMessageId: input.sourceMessageId }) }));
    expect(mocks.memoryUpdateMany.mock.calls[0]?.[0]?.data.content).not.toContain("RTX 5070 Ti");
  });
});
