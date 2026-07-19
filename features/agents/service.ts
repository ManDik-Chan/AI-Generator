import "server-only";

import { createAgentRunDeadline } from "@/features/agents/deadline";
import { reserveLeaderProviderCall } from "@/features/agents/events";
import { buildAgentLeaderPrompt, streamAgentLeader } from "@/features/agents/leader";
import { runAgentPlanningPhase } from "@/features/agents/planning-service";
import { loadAgentRuntimeContext } from "@/features/agents/runtime-context";
import { finishAgentRun, getAgentRunTerminalState, isAgentRunPending, persistAgentAssistantPartial } from "@/features/agents/run-state";
import { runAgentWorkerPool } from "@/features/agents/worker-pool";
import { createDurableCancellationController } from "@/features/generation/durable-cancellation";
import { AiProviderError, toPublicAiError } from "@/lib/ai/errors";
import type { AgentGenerationConfig, AiProvider } from "@/lib/ai/types";
import { prisma } from "@/lib/database/prisma";

interface AgentServiceInput {
  userId: string;
  runId: string;
  provider: AiProvider;
  config: AgentGenerationConfig;
  send(event: string, data: unknown): boolean;
}

function safeErrorCode(error: unknown) {
  if (error instanceof AiProviderError) return error.code;
  if (error instanceof Error && error.name === "UnsafeToolOutputError") return "UNSAFE_OUTPUT";
  return "AGENT_ERROR";
}

async function sendObservedAgentState(input: Pick<AgentServiceInput, "userId" | "runId" | "send">) {
  const terminal = await getAgentRunTerminalState(input.userId, input.runId).catch(() => null);
  if (terminal?.status === "CANCELLED") {
    input.send("cancelled", { runId: input.runId, status: "CANCELLED" });
    return;
  }
  if (terminal?.status === "COMPLETE") {
    input.send("done", { runId: input.runId, status: "COMPLETE" });
    return;
  }
  if (terminal?.status === "ERROR") {
    input.send("error", { code: terminal.errorCode ?? "AGENT_ERROR", message: "Agent 运行已由服务器收敛到失败终态。" });
    return;
  }
  input.send("error", { code: "PERSISTENCE_ERROR", message: "Agent 终态尚未持久化，请稍后刷新运行状态。" });
}

export async function runAgentService(input: AgentServiceInput) {
  const cancellation = await createDurableCancellationController({
    isPending: () => isAgentRunPending(input.userId, input.runId),
    taskType: "AGENT",
    taskId: input.runId,
  });
  const deadline = createAgentRunDeadline(cancellation.signal, input.config.totalTimeoutMs);
  const startedAt = Date.now();
  let leaderContent = "";
  try {
    if (cancellation.signal.aborted) {
      await sendObservedAgentState(input);
      return;
    }
    const context = await loadAgentRuntimeContext(input.userId, input.runId);
    if (!context) {
      await sendObservedAgentState(input);
      return;
    }

    input.send("planning_started", { runId: input.runId });
    const planning = await runAgentPlanningPhase({
      userId: input.userId,
      runId: input.runId,
      context: {
        userProblem: context.userProblem,
        mode: context.mode,
        conversationSummary: context.conversationSummary,
        personaSummary: context.personaSummary,
        memorySummary: context.memorySummary,
      },
      provider: input.provider,
      config: input.config,
      signal: deadline.signal,
    });
    input.send(planning.fallback ? "plan_fallback" : "plan_ready", {
      runId: input.runId,
      overview: planning.plan.overview,
      workers: planning.plan.workers.map((worker) => ({
        key: worker.key, name: worker.name, title: worker.title, objective: worker.objective,
        expectedDeliverable: worker.expectedDeliverable, priority: worker.priority, dependsOn: worker.dependsOn,
      })),
      ...(planning.errorCode ? { code: planning.errorCode } : {}),
    });
    input.send("workers_created", { runId: input.runId, count: planning.plan.workers.length });
    for (const worker of planning.plan.workers) {
      input.send("worker_queued", { workerKey: worker.key, name: worker.name, title: worker.title, priority: worker.priority, dependsOn: worker.dependsOn });
    }

    const workers = await runAgentWorkerPool({
      userId: input.userId,
      runId: input.runId,
      userProblem: context.userProblem,
      planOverview: planning.plan.overview,
      conversationSummary: context.conversationSummary,
      personaSummary: context.personaSummary,
      memorySummary: context.memorySummary,
      provider: input.provider,
      config: input.config,
      signal: deadline.signal,
      didTimeout: deadline.didTimeout,
      send: input.send,
    });

    if (deadline.didTimeout()) {
      const content = "Agent 运行已达到总时限。已完成的 Worker 结果仍保留在运行详情中。";
      const finished = await finishAgentRun({ userId: input.userId, runId: input.runId, status: "ERROR", content, errorCode: "TIMEOUT", timeout: true });
      if (finished) input.send("error", { code: "TIMEOUT", message: content });
      else await sendObservedAgentState(input);
      return;
    }
    if (!await isAgentRunPending(input.userId, input.runId)) {
      await sendObservedAgentState(input);
      return;
    }

    const successful = workers.filter((worker) => worker.status === "COMPLETE");
    if (successful.length < 2) {
      const content = "成功完成的 Worker 少于两个，Leader 未启动。请在运行详情中查看各 Worker 的状态与安全交付物。";
      const finished = await finishAgentRun({ userId: input.userId, runId: input.runId, status: "ERROR", content, errorCode: "INSUFFICIENT_WORKERS" });
      if (finished) input.send("error", { code: "INSUFFICIENT_WORKERS", message: content });
      else await sendObservedAgentState(input);
      return;
    }

    if (!await reserveLeaderProviderCall(input.userId, input.runId)) {
      if (!await isAgentRunPending(input.userId, input.runId)) {
        await sendObservedAgentState(input);
        return;
      }
      throw new Error("Leader Provider call could not be reserved.");
    }
    input.send("synthesis_started", { runId: input.runId, successfulWorkers: successful.length });
    const prompt = buildAgentLeaderPrompt({
      userProblem: context.userProblem,
      mode: context.mode,
      planOverview: planning.plan.overview,
      conversationSummary: context.conversationSummary,
      personaSummary: context.personaSummary,
      memorySummary: context.memorySummary,
      workers,
    });
    let persistedLength = 0;
    let lastPersistedAt = Date.now();
    leaderContent = await streamAgentLeader({
      provider: input.provider,
      config: input.config,
      prompt,
      signal: deadline.signal,
      onSafeDelta: async (text) => {
        leaderContent += text;
        input.send("synthesis_delta", { text });
        if (Date.now() - lastPersistedAt >= 750 || leaderContent.length - persistedLength >= 1024) {
          if (!await persistAgentAssistantPartial(input.userId, input.runId, leaderContent)) {
            throw new DOMException("Agent run was cancelled", "AbortError");
          }
          persistedLength = leaderContent.length;
          lastPersistedAt = Date.now();
        }
      },
    });
    if (deadline.signal.aborted) throw new AiProviderError(deadline.didTimeout() ? "TIMEOUT" : "ABORTED", "Agent Leader stopped before persistence.");
    const completed = await finishAgentRun({ userId: input.userId, runId: input.runId, status: "COMPLETE", content: leaderContent });
    if (!completed) {
      await sendObservedAgentState(input);
      return;
    }
    if (context.selectedMemoryIds.length) {
      await prisma.memory.updateMany({
        where: { userId: input.userId, id: { in: context.selectedMemoryIds } },
        data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
      }).catch(() => ({ count: 0 }));
    }
    input.send("done", { runId: input.runId, status: "COMPLETE" });
    console.info("agent_run_completed", { runId: input.runId, status: "COMPLETE", workerSuccessCount: successful.length, durationMs: Date.now() - startedAt });
  } catch (error) {
    if (deadline.didTimeout() && await isAgentRunPending(input.userId, input.runId)) {
      const content = leaderContent || "Agent 运行已达到总时限。已完成的 Worker 结果仍保留在运行详情中。";
      const finished = await finishAgentRun({ userId: input.userId, runId: input.runId, status: "ERROR", content, errorCode: "TIMEOUT", timeout: true }).catch(() => false);
      if (finished) input.send("error", { code: "TIMEOUT", message: "Agent 运行已达到总时限。" });
      else await sendObservedAgentState(input);
      return;
    }
    if (!await isAgentRunPending(input.userId, input.runId)) {
      await sendObservedAgentState(input);
      return;
    }
    const code = safeErrorCode(error);
    const publicError = toPublicAiError(error);
    const content = leaderContent || "Agent 运行未能完成。已完成的 Worker 结果仍保留在运行详情中。";
    const failed = await finishAgentRun({ userId: input.userId, runId: input.runId, status: "ERROR", content, errorCode: code }).catch(() => false);
    if (failed) input.send("error", { code, message: publicError });
    else await sendObservedAgentState(input);
    console.error("agent_run_failed", { runId: input.runId, status: failed ? "ERROR" : "PERSISTENCE_UNCONFIRMED", errorCode: failed ? code : "PERSISTENCE_ERROR", durationMs: Date.now() - startedAt });
  } finally {
    deadline.dispose();
    cancellation.dispose();
  }
}
