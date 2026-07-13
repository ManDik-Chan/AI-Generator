import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { memoryKeywordsSchema, memoryTopicKeySchema } from "@/features/memory/schemas";
import { getMemoryMaxTotal } from "@/features/memory/constants";
import { selectRelevantMemories } from "@/features/memory/selection";

const candidate = (id: string, content: string, extra: Record<string, unknown> = {}) => ({ id, content, category: "profile", scope: "GLOBAL" as const, importance: 3, enabled: true, updatedAt: "2026-07-13T00:00:00Z", ...extra });

describe("memory governance contract", () => {
  it("validates topic keys and normalizes keywords", () => {
    expect(memoryTopicKeySchema.parse("profile.computer_configuration")).toBe("profile.computer_configuration");
    expect(memoryTopicKeySchema.safeParse("Profile/Computer").success).toBe(false);
    expect(memoryKeywordsSchema.parse([" CPU ", "CPU", "处理器"])).toEqual(["CPU", "处理器"]);
    expect(memoryKeywordsSchema.safeParse(Array.from({ length: 13 }, (_, index) => `k${index}`)).success).toBe(false);
    expect(memoryKeywordsSchema.safeParse(["api_key=abcdefghijklmnop1234"]).success).toBe(false);
  });

  it("uses a safe default capacity", () => {
    expect(getMemoryMaxTotal({})).toBe(300);
    expect(getMemoryMaxTotal({ MEMORY_MAX_TOTAL: "20" })).toBe(20);
  });

  it("boosts keyword matches and recalls CPU configuration", () => {
    const selected = selectRelevantMemories({ currentMessage: "我用的 CPU 是什么？", recentUserMessages: [], candidates: [candidate("other", "用户喜欢深色主题"), candidate("pc", "用户的电脑配置包含 i5-12600K", { topicKey: "profile.computer_configuration", keywords: ["电脑配置", "处理器", "CPU"] })], maxItems: 8, maxChars: 2400 });
    expect(selected[0]?.id).toBe("pc");
  });

  it("boosts pinned memories without bypassing disabled filtering", () => {
    const selected = selectRelevantMemories({ currentMessage: "偏好", recentUserMessages: [], candidates: [candidate("normal", "用户偏好简洁"), candidate("pin", "用户偏好深色", { pinned: true }), candidate("off", "用户偏好禁用", { pinned: true, enabled: false })], maxItems: 8, maxChars: 2400 });
    expect(selected[0]?.id).toBe("pin");
    expect(selected.map((memory) => memory.id)).not.toContain("off");
  });

  it("selects at most one memory per topic and supports overview intent", () => {
    const selected = selectRelevantMemories({ currentMessage: "你记得我什么？", recentUserMessages: [], candidates: [candidate("new", "新配置", { topicKey: "profile.computer", pinned: true }), candidate("old", "旧配置", { topicKey: "profile.computer", importance: 5 }), candidate("goal", "用户长期目标", { topicKey: "goal.study", importance: 4 })], maxItems: 8, maxChars: 2400 });
    expect(selected.filter((memory) => memory.topicKey === "profile.computer")).toHaveLength(1);
    expect(selected.map((memory) => memory.id)).toContain("goal");
  });

  it("adds independent schema migration defaults and checks", () => {
    const migration = readFileSync("prisma/migrations/20260713110000_add_memory_governance/migration.sql", "utf8");
    expect(migration).toContain('"keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]');
    expect(migration).toContain('"pinned" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('"use_count" INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('CHECK ("use_count" >= 0)');
    expect(readFileSync("prisma/migrations/20260713010000_add_memory_foundation/migration.sql", "utf8")).not.toContain("topic_key");
  });

  it("increments only injected memories after successful completion", () => {
    const route = readFileSync("app/api/chat/route.ts", "utf8");
    expect(route).toContain("useCount: { increment: 1 }");
    expect(route.indexOf("useCount: { increment: 1 }")).toBeGreaterThan(route.indexOf('finalizeAssistantMessage(assistantMessageId, fullContent, "COMPLETE")'));
  });

  it("keeps pinning owned and exposes governance UI without internal topics", () => {
    const actions = readFileSync("features/memory/actions.ts", "utf8");
    const manager = readFileSync("features/memory/components/memory-manager.tsx", "utf8");
    expect(actions).toContain("setMemoryPinnedAction");
    expect(actions).toContain("where: { id, userId: user.id }");
    expect(manager).toContain("已使用 {memories.length} / {maxTotal} 条记忆");
    expect(manager).toContain("同主题可能重复");
    expect(manager).not.toContain("{memory.topicKey}</");
  });
});
