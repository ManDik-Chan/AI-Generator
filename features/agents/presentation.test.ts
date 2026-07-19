import { describe, expect, it } from "vitest";

import { getAgentRunProgressLabel } from "@/features/agents/presentation";

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
