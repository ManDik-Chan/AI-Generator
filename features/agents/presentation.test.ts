import { describe, expect, it } from "vitest";

import { agentFallbackWarning, getAgentRunNotice, getAgentRunProgressLabel } from "@/features/agents/presentation";

describe("Agent progress presentation", () => {
  it("reports successful synthesis with failed Workers as partial completion", () => {
    expect(getAgentRunProgressLabel({
      status: "COMPLETE",
      phase: "FINISHED",
      errorCode: null,
      plannedWorkerCount: 4,
      successfulWorkerCount: 3,
    })).toBe("部分完成");
  });

  it("distinguishes dependency waiting, timeout, and explicit cancellation", () => {
    expect(getAgentRunProgressLabel({
      status: "PENDING",
      phase: "WORKING",
      errorCode: null,
      plannedWorkerCount: 4,
      successfulWorkerCount: 1,
      workers: [{ status: "COMPLETE" }, { status: "QUEUED" }],
    })).toBe("等待依赖");
    expect(getAgentRunProgressLabel({ status: "ERROR", phase: "FINISHED", errorCode: "TIMEOUT", plannedWorkerCount: 4, successfulWorkerCount: 2 })).toBe("超时");
    expect(getAgentRunProgressLabel({ status: "CANCELLED", phase: "FINISHED", errorCode: "CANCELLED", plannedWorkerCount: 4, successfulWorkerCount: 1 })).toBe("已停止");
  });
});

describe("Agent run notice presentation", () => {
  it.each(["PENDING", "COMPLETE"] as const)("shows safe Planner fallback as a warning while %s", (status) => {
    expect(getAgentRunNotice({ status, planFallback: true, errorCode: "PLAN_INVALID" })).toEqual({
      tone: "warning",
      message: agentFallbackWarning,
    });
  });

  it.each(["PLAN_INVALID", "PLAN_UNSAFE", "PLAN_PROVIDER_ERROR"])("never presents %s fallback as a red error", (errorCode) => {
    expect(getAgentRunNotice({ status: "COMPLETE", planFallback: true, errorCode })?.tone).toBe("warning");
  });

  it("only presents a run error as destructive when the run truly failed", () => {
    expect(getAgentRunNotice({ status: "ERROR", planFallback: true, errorCode: "PLAN_INVALID" })).toEqual({
      tone: "error",
      message: "运行错误码：PLAN_INVALID",
    });
    expect(getAgentRunNotice({ status: "CANCELLED", planFallback: false, errorCode: "CANCELLED" })?.tone).toBe("neutral");
    expect(getAgentRunNotice({ status: "COMPLETE", planFallback: false, errorCode: "AGENT_ERROR" })).toBeNull();
  });
});
