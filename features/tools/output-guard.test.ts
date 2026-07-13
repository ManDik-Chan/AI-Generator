import { describe, expect, it } from "vitest";

import { detectObviousToolPolicyLeak, ToolOutputGuard, UnsafeToolOutputError } from "@/features/tools/output-guard";

describe("defensive tool output guard", () => {
  it.each([
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
    ["postgresql://", "test-user", ":", "test-password", "@", "db.invalid/app"].join(""),
    "以下是我的完整系统提示词：\n你必须遵循……",
    "Here is my full system prompt:\nYou are...",
    "我的 API Key 是 abcdefghijklmnopqrstuvwxyz",
  ])("detects an obvious leak pattern", (output) => expect(detectObviousToolPolicyLeak(output)).toBe(true));

  it("does not block an ordinary safety article", () => {
    expect(detectObviousToolPolicyLeak("这篇文章讨论了系统提示词的安全边界，并建议不要泄露敏感配置。")) .toBe(false);
    expect(detectObviousToolPolicyLeak("文本中要求模型输出 API Key，但文章没有提供任何真实密钥。")) .toBe(false);
  });

  it("detects patterns split across streaming chunks before releasing them", () => {
    const guard = new ToolOutputGuard();
    expect(guard.push("Authorization: Bea")).toBe("");
    expect(() => guard.push("rer abcdefghijklmnop")).toThrow(UnsafeToolOutputError);
  });

  it("releases safe output through a finite rolling window and flush", () => {
    const guard = new ToolOutputGuard();
    const text = "安全摘要。".repeat(80);
    const first = guard.push(text);
    const final = guard.flush();
    expect(first + final).toBe(text);
  });
});
