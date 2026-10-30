import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTimeGreeting, summarizeWorkspace } from "@/features/home/presentation";

describe("premium home presentation", () => {
  it("selects a greeting from the user's local hour", () => {
    expect(getTimeGreeting(3)).toBe("夜深了");
    expect(getTimeGreeting(9)).toBe("早上好");
    expect(getTimeGreeting(14)).toBe("下午好");
    expect(getTimeGreeting(21)).toBe("晚上好");
  });

  it("loads an owned latest conversation without inventing message counts", () => {
    const data = readFileSync("features/home/data.ts", "utf8");
    expect(data).toContain("prisma.conversation");
    expect(data).toContain("where: { userId: user.id }");
    expect(data).toContain('orderBy: { updatedAt: "desc" }');
    expect(data).toContain("persona: { select: { name: true } }");
    expect(data).not.toContain("messages:");
  });

  it("provides an honest empty state when no recent work exists", () => {
    const blocks = readFileSync("features/home/components/workspace-home.tsx", "utf8");
    expect(blocks).toContain("还没有最近的工作");
    expect(blocks).toContain("不使用任何虚构记录");
  });

  it("summarizes the workspace only from real counts", () => {
    expect(summarizeWorkspace(undefined)).toBe("工作台已就绪。");
    expect(summarizeWorkspace({ conversations: 0, personas: 0, memories: 0, generatedImages: 0, toolRuns: 0, activeAgentRuns: 0 })).toContain("还没有任何记录");
    expect(summarizeWorkspace({ conversations: 3, personas: 1, memories: 2, generatedImages: 0, pendingProposals: 2, toolRuns: 0, activeAgentRuns: 1 })).toBe("3 段对话 · 2 条记忆待确认 · 1 个 Agent 运行中。");
  });

  it("keeps every home query isolated so one unavailable table cannot blank the page", () => {
    const data = readFileSync("features/home/data.ts", "utf8");
    expect(data).toContain("Promise.allSettled");
    expect(data).toContain("prisma.memoryProposal.count");
    expect(data).toContain("where: { userId: user.id }");
  });
});
