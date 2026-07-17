import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workerUpdate: vi.fn(),
  workerFind: vi.fn(),
  finish: vi.fn(),
  pending: vi.fn(),
  partial: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("@/lib/database/prisma", () => ({ prisma: { brainstormWorker: { updateMany: mocks.workerUpdate, findMany: mocks.workerFind } } }));
vi.mock("@/features/tools/usage", () => ({
  finishRecoverableToolRun: mocks.finish,
  isToolRunPending: mocks.pending,
  persistToolRunPartial: mocks.partial,
}));
vi.mock("@/features/generation/durable-cancellation", () => ({
  createDurableCancellationController: async () => ({ signal: new AbortController().signal, dispose: mocks.dispose }),
}));

import { runBrainstormService } from "@/features/tools/brainstorm/service";
import type { AiProvider, BrainstormGenerationConfig } from "@/lib/ai/types";

const successfulWorkers = ["ANALYST", "CREATIVE", "CRITIC", "PLANNER"].map((role, position) => ({ role, position, outputText: `${role} output` }));
const config: BrainstormGenerationConfig = {
  workerModel: "worker-model",
  synthesisModel: "synthesis-model",
  temperature: 0.6,
  workerMaxOutputTokens: 1400,
  synthesisMaxOutputTokens: 2600,
  requestTimeoutMs: 180000,
  dailyLimit: 3,
  maxConcurrency: 4,
  workerModelSource: "brainstorm",
  synthesisModelSource: "synthesis",
};

function providerWithFailure(failedRole?: string) {
  const streamText = vi.fn((request: Parameters<AiProvider["streamText"]>[0]) => ({
    async *[Symbol.asyncIterator]() {
      const system = request.messages[0]?.content ?? "";
      if (failedRole && system.includes(failedRole === "ANALYST" ? "分析研究员" : failedRole)) throw new Error("provider failed");
      yield request.model === "synthesis-model" ? "## 综合结论\n结果" : "确定信息与建议";
    },
  }));
  return { provider: { streamText } satisfies AiProvider, streamText };
}

describe("brainstorm orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workerUpdate.mockResolvedValue({ count: 1 });
    mocks.workerFind.mockResolvedValue(successfulWorkers);
    mocks.finish.mockResolvedValue({ count: 1 });
    mocks.pending.mockResolvedValue(true);
    mocks.partial.mockResolvedValue({ count: 1 });
  });

  it("calls four workers once and the coordinator once", async () => {
    const { provider, streamText } = providerWithFailure();
    const send = vi.fn(() => true);
    await runBrainstormService({ userId: "owner", runId: "run", prompt: "problem", saveHistory: true, provider, config, send });
    expect(streamText).toHaveBeenCalledTimes(5);
    expect(streamText.mock.calls.filter(([request]) => request.model === "worker-model")).toHaveLength(4);
    expect(streamText.mock.calls.filter(([request]) => request.model === "synthesis-model")).toHaveLength(1);
    expect(send).toHaveBeenCalledWith("done", expect.objectContaining({ runId: "run" }));
  });

  it("continues when one worker fails and still synthesizes successful workers", async () => {
    const { provider, streamText } = providerWithFailure("ANALYST");
    mocks.workerFind.mockResolvedValue(successfulWorkers.slice(1));
    await runBrainstormService({ userId: "owner", runId: "run", prompt: "problem", saveHistory: true, provider, config, send: () => true });
    expect(streamText).toHaveBeenCalledTimes(5);
    expect(mocks.workerUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ERROR" }) }));
    expect(mocks.finish).toHaveBeenCalledWith("owner", "run", "COMPLETE", expect.anything());
  });

  it("does not call the coordinator when fewer than two workers succeed", async () => {
    const { provider, streamText } = providerWithFailure();
    mocks.workerFind.mockResolvedValue(successfulWorkers.slice(0, 1));
    await runBrainstormService({ userId: "owner", runId: "run", prompt: "problem", saveHistory: false, provider, config, send: () => true });
    expect(streamText).toHaveBeenCalledTimes(4);
    expect(mocks.finish).toHaveBeenCalledWith("owner", "run", "ERROR", { errorCode: "INSUFFICIENT_WORKERS" });
  });

  it("cannot overwrite a durable cancelled terminal state", async () => {
    const { provider } = providerWithFailure();
    mocks.finish.mockResolvedValue({ count: 0 });
    const send = vi.fn(() => true);
    await runBrainstormService({ userId: "owner", runId: "run", prompt: "problem", saveHistory: true, provider, config, send });
    expect(send).not.toHaveBeenCalledWith("done", expect.anything());
    expect(send).toHaveBeenCalledWith("cancelled", expect.anything());
  });
});
