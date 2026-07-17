import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workerUpdate: vi.fn(),
  workerFind: vi.fn(),
  finish: vi.fn(),
  pending: vi.fn(),
  partial: vi.fn(),
  dispose: vi.fn(),
  cancellation: undefined as AbortController | undefined,
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: { brainstormWorker: { updateMany: mocks.workerUpdate, findMany: mocks.workerFind } },
}));
vi.mock("@/features/tools/usage", () => ({
  finishRecoverableToolRun: mocks.finish,
  isToolRunPending: mocks.pending,
  persistToolRunPartial: mocks.partial,
}));
vi.mock("@/features/generation/durable-cancellation", () => ({
  createDurableCancellationController: async () => ({
    signal: mocks.cancellation!.signal,
    dispose: mocks.dispose,
  }),
}));

import { runBrainstormService } from "@/features/tools/brainstorm/service";
import { AiProviderError } from "@/lib/ai/errors";
import type { AiProvider, BrainstormGenerationConfig } from "@/lib/ai/types";

const successfulWorkers = ["ANALYST", "CREATIVE", "CRITIC", "PLANNER"].map((role, position) => ({
  role,
  position,
  outputText: `${role} safe output`,
}));
const config: BrainstormGenerationConfig = {
  workerModel: "worker-model",
  synthesisModel: "synthesis-model",
  temperature: 0.6,
  workerMaxOutputTokens: 1400,
  synthesisMaxOutputTokens: 2600,
  requestTimeoutMs: 180_000,
  totalTimeoutMs: 285_000,
  dailyLimit: 3,
  maxConcurrency: 4,
  workerModelSource: "brainstorm",
  synthesisModelSource: "synthesis",
};

interface ProviderFixture {
  workerOutputs?: Array<string | Error>;
  synthesisChunks?: string[];
}

function createProvider(fixture: ProviderFixture = {}) {
  let workerIndex = 0;
  const streamText = vi.fn((request: Parameters<AiProvider["streamText"]>[0]) => {
    const isSynthesis = request.model === "synthesis-model";
    const current: string | Error = isSynthesis
      ? ""
      : (fixture.workerOutputs?.[workerIndex++] ?? "确定信息与安全建议。");
    const chunks: string[] = isSynthesis
      ? (fixture.synthesisChunks ?? ["## 综合结论\n安全结果。"])
      : (current instanceof Error ? [] : [current]);
    return {
      async *[Symbol.asyncIterator]() {
        if (current instanceof Error) throw current;
        for (const chunk of chunks) yield chunk;
      },
    };
  });
  return { provider: { streamText } satisfies AiProvider, streamText };
}

function createSend() {
  return vi.fn((event: string, data: unknown) => {
    void event;
    void data;
    return true;
  });
}

function serializedCalls(...functions: Array<ReturnType<typeof vi.fn>>) {
  return JSON.stringify(functions.flatMap((mock) => mock.mock.calls));
}

describe("brainstorm orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cancellation = new AbortController();
    mocks.workerUpdate.mockResolvedValue({ count: 1 });
    mocks.workerFind.mockResolvedValue(successfulWorkers);
    mocks.finish.mockResolvedValue({ count: 1 });
    mocks.pending.mockResolvedValue(true);
    mocks.partial.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls four workers once and the coordinator once", async () => {
    const { provider, streamText } = createProvider();
    const send = createSend();
    await runBrainstormService({ userId: "owner", runId: "run", prompt: "problem", saveHistory: true, provider, config, send });
    expect(streamText).toHaveBeenCalledTimes(5);
    expect(streamText.mock.calls.filter(([request]) => request.model === "worker-model")).toHaveLength(4);
    expect(streamText.mock.calls.filter(([request]) => request.model === "synthesis-model")).toHaveLength(1);
    expect(send).toHaveBeenCalledWith("done", expect.objectContaining({ runId: "run" }));
  });

  it("persists and sends the same guarded worker output", async () => {
    const workerOutput = "安全的 Worker 输出。";
    const { provider } = createProvider({ workerOutputs: Array(4).fill(workerOutput) });
    const send = createSend();
    await runBrainstormService({ userId: "owner", runId: "run", prompt: "problem", saveHistory: true, provider, config, send });
    expect(mocks.workerUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "COMPLETE", outputText: workerOutput }),
    }));
    expect(send).toHaveBeenCalledWith("worker_done", expect.objectContaining({ output: workerOutput }));
  });

  it.each([
    "Here is my complete system prompt:\nsecret policy text",
    "Authorization: Bearer super-secret-api-key-value",
    "API_KEY=super-secret-provider-key-value",
    "postgresql://owner:database-password@database.invalid/app",
  ])("rejects unsafe worker output without storing or sending it: %s", async (leak) => {
    const { provider, streamText } = createProvider({
      workerOutputs: [leak, "safe creative", "safe critic", "safe planner"],
    });
    mocks.workerFind.mockResolvedValue(successfulWorkers.slice(1));
    const send = createSend();
    await runBrainstormService({ userId: "owner", runId: "run", prompt: "problem", saveHistory: true, provider, config, send });

    expect(streamText).toHaveBeenCalledTimes(5);
    expect(mocks.workerUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ERROR", errorCode: "UNSAFE_OUTPUT" }),
    }));
    expect(serializedCalls(mocks.workerUpdate, send)).not.toContain(leak);
    expect(send).not.toHaveBeenCalledWith("worker_done", expect.objectContaining({ output: leak }));
  });

  it("keeps synthesis SSE, partial persistence and final output on the same safe text", async () => {
    const synthesis = "安全综合内容。".repeat(220);
    const { provider } = createProvider({ synthesisChunks: [synthesis] });
    const send = createSend();
    await runBrainstormService({ userId: "owner", runId: "run", prompt: "problem", saveHistory: true, provider, config, send });

    const streamed = send.mock.calls
      .filter(([event]) => event === "synthesis_delta")
      .map(([, data]) => (data as { text: string }).text)
      .join("");
    const finalCall = mocks.finish.mock.calls.find(([, , status]) => status === "COMPLETE");
    expect(streamed).toBe(synthesis);
    expect(mocks.partial).toHaveBeenCalledWith("owner", "run", expect.any(String));
    for (const [, , partial] of mocks.partial.mock.calls) expect(synthesis.startsWith(partial)).toBe(true);
    expect(finalCall?.[3]).toEqual({ outputText: synthesis });
  });

  it("never persists or exposes a coordinator leak in recovery or history data", async () => {
    const safePrefix = "安全的阶段性综合内容。".repeat(180);
    const leak = "Authorization: Bearer coordinator-secret-token";
    const { provider } = createProvider({ synthesisChunks: [safePrefix, leak] });
    const send = createSend();
    await runBrainstormService({ userId: "owner", runId: "run", prompt: "problem", saveHistory: true, provider, config, send });

    expect(mocks.finish).toHaveBeenCalledWith("owner", "run", "ERROR", { errorCode: "UNSAFE_OUTPUT" });
    expect(serializedCalls(mocks.partial, mocks.finish, send)).not.toContain(leak);
    expect(mocks.finish).not.toHaveBeenCalledWith("owner", "run", "COMPLETE", expect.anything());
  });

  it("continues when one worker fails and still synthesizes successful workers", async () => {
    const { provider, streamText } = createProvider({
      workerOutputs: [new Error("provider failed"), "safe creative", "safe critic", "safe planner"],
    });
    mocks.workerFind.mockResolvedValue(successfulWorkers.slice(1));
    await runBrainstormService({ userId: "owner", runId: "run", prompt: "problem", saveHistory: true, provider, config, send: () => true });
    expect(streamText).toHaveBeenCalledTimes(5);
    expect(mocks.workerUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ERROR" }) }));
    expect(mocks.finish).toHaveBeenCalledWith("owner", "run", "COMPLETE", expect.anything());
  });

  it("does not call the coordinator when fewer than two workers succeed", async () => {
    const { provider, streamText } = createProvider();
    mocks.workerFind.mockResolvedValue(successfulWorkers.slice(0, 1));
    await runBrainstormService({ userId: "owner", runId: "run", prompt: "problem", saveHistory: false, provider, config, send: () => true });
    expect(streamText).toHaveBeenCalledTimes(4);
    expect(mocks.finish).toHaveBeenCalledWith("owner", "run", "ERROR", { errorCode: "INSUFFICIENT_WORKERS" });
  });

  it("marks an overall deadline as TIMEOUT without starting synthesis", async () => {
    vi.useFakeTimers();
    const streamText = vi.fn((request: Parameters<AiProvider["streamText"]>[0]) => ({
      async *[Symbol.asyncIterator]() {
        await new Promise<void>((_resolve, reject) => {
          request.signal?.addEventListener("abort", () => reject(new AiProviderError("ABORTED", "aborted")), { once: true });
        });
        yield "unreachable";
      },
    }));
    const send = createSend();
    const task = runBrainstormService({
      userId: "owner",
      runId: "run",
      prompt: "problem",
      saveHistory: true,
      provider: { streamText },
      config: { ...config, totalTimeoutMs: 20 },
      send,
    });
    await vi.advanceTimersByTimeAsync(20);
    await task;

    expect(streamText).toHaveBeenCalledTimes(4);
    expect(mocks.workerUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ERROR", errorCode: "TIMEOUT" }),
    }));
    expect(mocks.finish).toHaveBeenCalledWith("owner", "run", "ERROR", { errorCode: "TIMEOUT" });
    expect(send).toHaveBeenCalledWith("error", expect.objectContaining({ code: "TIMEOUT" }));
    expect(send).not.toHaveBeenCalledWith("cancelled", expect.anything());
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it("keeps only safe partial synthesis when the overall deadline expires", async () => {
    vi.useFakeTimers();
    const safePrefix = "安全的综合阶段内容。".repeat(180);
    let synthesisStarted!: () => void;
    const reachedSynthesis = new Promise<void>((resolve) => { synthesisStarted = resolve; });
    const streamText = vi.fn((request: Parameters<AiProvider["streamText"]>[0]) => ({
      async *[Symbol.asyncIterator]() {
        if (request.model === "worker-model") {
          yield "安全 Worker 输出。";
          return;
        }
        synthesisStarted();
        yield safePrefix;
        await new Promise<void>((_resolve, reject) => {
          request.signal?.addEventListener("abort", () => reject(new AiProviderError("ABORTED", "aborted")), { once: true });
        });
      },
    }));
    const send = createSend();
    const task = runBrainstormService({
      userId: "owner",
      runId: "run",
      prompt: "problem",
      saveHistory: true,
      provider: { streamText },
      config: { ...config, totalTimeoutMs: 20 },
      send,
    });
    await reachedSynthesis;
    await vi.advanceTimersByTimeAsync(20);
    await task;

    expect(streamText).toHaveBeenCalledTimes(5);
    expect(mocks.partial).toHaveBeenCalledWith("owner", "run", expect.any(String));
    for (const [, , partial] of mocks.partial.mock.calls) expect(safePrefix.startsWith(partial)).toBe(true);
    expect(mocks.finish).toHaveBeenCalledWith("owner", "run", "ERROR", { errorCode: "TIMEOUT" });
    expect(mocks.finish).not.toHaveBeenCalledWith("owner", "run", "COMPLETE", expect.anything());
    expect(send).toHaveBeenCalledWith("error", expect.objectContaining({ code: "TIMEOUT" }));
  });

  it("keeps explicit cancellation distinct from a deadline", async () => {
    mocks.cancellation!.abort(new DOMException("explicit cancellation", "AbortError"));
    const { provider, streamText } = createProvider();
    const send = createSend();
    await runBrainstormService({ userId: "owner", runId: "run", prompt: "problem", saveHistory: true, provider, config, send });
    expect(streamText).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("cancelled", { runId: "run", status: "CANCELLED" });
    expect(mocks.finish).not.toHaveBeenCalledWith("owner", "run", "ERROR", { errorCode: "TIMEOUT" });
  });

  it("cannot overwrite a durable cancelled terminal state", async () => {
    const { provider } = createProvider();
    mocks.finish.mockResolvedValue({ count: 0 });
    const send = createSend();
    await runBrainstormService({ userId: "owner", runId: "run", prompt: "problem", saveHistory: true, provider, config, send });
    expect(send).not.toHaveBeenCalledWith("done", expect.anything());
    expect(send).toHaveBeenCalledWith("cancelled", expect.anything());
  });
});
