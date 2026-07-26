import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manager = readFileSync(
  "features/memory/components/memory-manager.tsx",
  "utf8",
);
const card = readFileSync(
  "features/memory/components/memory-proposal-card.tsx",
  "utf8",
);
const actions = readFileSync("features/memory/actions.ts", "utf8");

describe("trusted memory proposal UI contract", () => {
  it("clearly separates proposals from confirmed memory", () => {
    expect(manager).toContain("AI 建议记住");
    expect(manager).toContain("确认后才会用于未来对话");
    expect(manager).toContain("这些建议尚未进入长期记忆");
    expect(manager).toContain("已确认的正式记忆");
    expect(manager).toContain("唯一召回真相源");
  });

  it("offers only per-proposal accept, edit-and-accept, and reject", () => {
    expect(card).toContain("acceptMemoryProposalAction");
    expect(card).toContain("acceptEditedMemoryProposalAction");
    expect(card).toContain("rejectMemoryProposalAction");
    expect(card).not.toMatch(/批量接受|acceptAll|selectedProposalIds/);
  });

  it("stacks UPDATE comparison on narrow screens", () => {
    expect(card).toContain('className="mt-4 grid gap-3 md:grid-cols-2"');
    expect(card).toContain("当前正式记忆");
    expect(card).toContain("AI 建议内容");
  });

  it("catches client failures and removes database-terminal cards", () => {
    expect(card).toContain("try {");
    expect(card).toContain("网络或服务暂时不可用");
    expect(card).toContain("result.stateChanged");
    expect(card).toContain('result.finalStatus !== "PENDING"');
    expect(manager).toContain("visibleProposals");
    expect(manager).toContain("if (result.success) setMemoryEnabled(nextEnabled)");
    expect(actions).toContain("memory_resolution_snapshot_failed");
    expect(manager).toContain("router.refresh()");
  });

  it("uses a minimal derived browser DTO", () => {
    const types = readFileSync("features/memory/types.ts", "utf8");
    expect(types).toContain("actionLabel");
    expect(types).toContain("confidenceLabel");
    expect(types).toContain("currentTargetContent");
    expect(types).toContain("canAccept");
    expect(types).toContain("conflictState");
    expect(types).not.toContain("reasonCode");
    expect(types).not.toContain("targetMemoryId");
    expect(types).not.toContain("targetMemoryUpdatedAt");
    expect(types).not.toContain("sourceMessageId");
    expect(types).not.toContain("userId");
  });

  it("does not show proposals as indexed or counted formal memory", () => {
    expect(card).not.toMatch(/已索引|语义索引正常|useCount/);
    expect(manager).toContain("{memories.length}");
    expect(manager).not.toContain("memories.length + proposals.length");
  });
});
