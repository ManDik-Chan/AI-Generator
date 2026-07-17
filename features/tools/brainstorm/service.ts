import "server-only";

import type { BrainstormWorkerRole } from "@prisma/client";

import { createDurableCancellationController } from "@/features/generation/durable-cancellation";
import { BRAINSTORM_WORKERS } from "@/features/tools/brainstorm/constants";
import { createBrainstormRunDeadline } from "@/features/tools/brainstorm/deadline";
import { buildBrainstormSynthesisPrompt, buildBrainstormWorkerPrompt } from "@/features/tools/brainstorm/prompts";
import { TOOL_OUTPUT_MAX_CHARS } from "@/features/tools/constants";
import { ToolOutputGuard } from "@/features/tools/output-guard";
import { finishRecoverableToolRun, isToolRunPending, persistToolRunPartial } from "@/features/tools/usage";
import { publicToolError, toolErrorCode } from "@/features/tools/utils";
import { AiProviderError } from "@/lib/ai/errors";
import type { AiProvider, BrainstormGenerationConfig } from "@/lib/ai/types";
import { prisma } from "@/lib/database/prisma";

interface BrainstormServiceInput {
  userId: string;
  runId: string;
  prompt: string;
  saveHistory: boolean;
  provider: AiProvider;
  config: BrainstormGenerationConfig;
  send(event: string, data: unknown): boolean;
}

export async function collectBrainstormWorkerOutput(
  provider: AiProvider,
  request: Parameters<AiProvider["streamText"]>[0],
) {
  const guard = new ToolOutputGuard();
  let rawLength = 0;
  let safeOutput = "";

  for await (const delta of provider.streamText(request)) {
    rawLength += delta.length;
    if (rawLength > TOOL_OUTPUT_MAX_CHARS) {
      throw new AiProviderError("INVALID_RESPONSE", "Worker output exceeded the safe storage limit.");
    }
    safeOutput += guard.push(delta);
  }

  safeOutput += guard.flush();
  safeOutput = safeOutput.trim();
  if (!safeOutput) throw new AiProviderError("EMPTY_RESPONSE", "Worker returned no text.");
  return safeOutput;
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, maximum: number) {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      try { results[index] = { status: "fulfilled", value: await tasks[index]() }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(maximum, tasks.length) }, () => worker()));
  return results;
}

function publicErrorForCode(code: string, fallbackError: unknown) {
  if (code === "TIMEOUT") return publicToolError(new AiProviderError("TIMEOUT", "Brainstorm run deadline exceeded."));
  return publicToolError(fallbackError);
}

async function finishTimedOutRun(userId: string, runId: string) {
  await prisma.brainstormWorker.updateMany({
    where: { toolRunId: runId, userId, status: "PENDING" },
    data: { status: "ERROR", errorCode: "TIMEOUT", completedAt: new Date() },
  });
  return finishRecoverableToolRun(userId, runId, "ERROR", { errorCode: "TIMEOUT" });
}

export async function runBrainstormService(input: BrainstormServiceInput) {
  const cancellation = await createDurableCancellationController({
    isPending: () => isToolRunPending(input.userId, input.runId),
    taskType: "BRAINSTORM",
    taskId: input.runId,
  });
  const deadline = createBrainstormRunDeadline(cancellation.signal, input.config.totalTimeoutMs);
  const startedAt = Date.now();
  let synthesisSafeOutput = "";

  try {
    if (cancellation.signal.aborted) {
      input.send("cancelled", { runId: input.runId, status: "CANCELLED" });
      return;
    }

    const tasks = BRAINSTORM_WORKERS.map((worker) => async () => {
      const started = await prisma.brainstormWorker.updateMany({
        where: { toolRunId: input.runId, userId: input.userId, role: worker.role, status: "PENDING" },
        data: { startedAt: new Date() },
      });
      if (!started.count) return;
      input.send("worker_started", { role: worker.role, label: worker.label });
      const workerStartedAt = Date.now();

      try {
        const prompt = buildBrainstormWorkerPrompt(worker.role, input.prompt);
        const output = await collectBrainstormWorkerOutput(input.provider, {
          messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
          model: input.config.workerModel,
          temperature: input.config.temperature,
          maxOutputTokens: input.config.workerMaxOutputTokens,
          thinking: "disabled",
          signal: deadline.signal,
        });
        if (deadline.signal.aborted) {
          throw new AiProviderError(deadline.didTimeout() ? "TIMEOUT" : "ABORTED", "Brainstorm worker was stopped before persistence.");
        }
        const completed = await prisma.brainstormWorker.updateMany({
          where: { toolRunId: input.runId, userId: input.userId, role: worker.role, status: "PENDING" },
          data: { status: "COMPLETE", outputText: output, completedAt: new Date() },
        });
        if (completed.count) {
          input.send("worker_done", { role: worker.role, label: worker.label, output });
          console.info("brainstorm_worker_completed", {
            runId: input.runId,
            role: worker.role,
            status: "COMPLETE",
            durationMs: Date.now() - workerStartedAt,
          });
        }
      } catch (error) {
        const stillPending = await isToolRunPending(input.userId, input.runId);
        const code = deadline.didTimeout() && stillPending ? "TIMEOUT" : toolErrorCode(error);
        const failed = await prisma.brainstormWorker.updateMany({
          where: { toolRunId: input.runId, userId: input.userId, role: worker.role, status: "PENDING" },
          data: { status: code === "CANCELLED" ? "CANCELLED" : "ERROR", errorCode: code, completedAt: new Date() },
        });
        if (failed.count) {
          const normalized = publicErrorForCode(code, error);
          input.send("worker_error", { role: worker.role, label: worker.label, code, message: normalized.message });
        }
        console.warn("brainstorm_worker_finished", {
          runId: input.runId,
          role: worker.role,
          status: code === "CANCELLED" ? "CANCELLED" : "ERROR",
          errorCode: code,
          durationMs: Date.now() - workerStartedAt,
        });
      }
    });
    await runWithConcurrency(tasks, input.config.maxConcurrency);

    if (deadline.didTimeout()) {
      const failed = await finishTimedOutRun(input.userId, input.runId);
      input.send(
        failed.count ? "error" : "cancelled",
        failed.count
          ? { code: "TIMEOUT", message: publicErrorForCode("TIMEOUT", null).message }
          : { runId: input.runId, status: "CANCELLED" },
      );
      return;
    }

    if (!await isToolRunPending(input.userId, input.runId)) {
      input.send("cancelled", { runId: input.runId, status: "CANCELLED" });
      return;
    }

    const successful = await prisma.brainstormWorker.findMany({
      where: { toolRunId: input.runId, userId: input.userId, status: "COMPLETE", outputText: { not: null } },
      orderBy: { position: "asc" },
      select: { role: true, outputText: true },
    });
    if (successful.length < 2) {
      const failed = await finishRecoverableToolRun(input.userId, input.runId, "ERROR", { errorCode: "INSUFFICIENT_WORKERS" });
      if (failed.count) {
        input.send("error", { code: "INSUFFICIENT_WORKERS", message: "成功完成的 Worker 少于两个，无法生成可靠的综合结论。" });
      }
      return;
    }

    input.send("synthesis_started", { successfulWorkers: successful.length });
    const synthesisPrompt = buildBrainstormSynthesisPrompt(
      input.prompt,
      successful.map((worker) => ({ role: worker.role as BrainstormWorkerRole, output: worker.outputText! })),
    );
    const guard = new ToolOutputGuard();
    let rawLength = 0;
    let persistedLength = 0;
    let lastPersistedAt = Date.now();

    for await (const delta of input.provider.streamText({
      messages: [{ role: "system", content: synthesisPrompt.system }, { role: "user", content: synthesisPrompt.user }],
      model: input.config.synthesisModel,
      temperature: input.config.temperature,
      maxOutputTokens: input.config.synthesisMaxOutputTokens,
      thinking: "disabled",
      signal: deadline.signal,
    })) {
      rawLength += delta.length;
      if (rawLength > TOOL_OUTPUT_MAX_CHARS) {
        throw new AiProviderError("INVALID_RESPONSE", "Synthesis output exceeded the safe storage limit.");
      }

      const safeDelta = guard.push(delta);
      if (safeDelta) {
        synthesisSafeOutput += safeDelta;
        input.send("synthesis_delta", { text: safeDelta });
      }
      if (
        synthesisSafeOutput.length > persistedLength
        && (Date.now() - lastPersistedAt >= 750 || synthesisSafeOutput.length - persistedLength >= 1024)
      ) {
        const persisted = await persistToolRunPartial(input.userId, input.runId, synthesisSafeOutput);
        if (!persisted.count) {
          input.send("cancelled", { runId: input.runId, status: "CANCELLED" });
          return;
        }
        persistedLength = synthesisSafeOutput.length;
        lastPersistedAt = Date.now();
      }
    }

    const safeTail = guard.flush();
    if (safeTail) {
      synthesisSafeOutput += safeTail;
      input.send("synthesis_delta", { text: safeTail });
    }
    if (!synthesisSafeOutput.trim()) {
      throw new AiProviderError("EMPTY_RESPONSE", "Synthesis returned no text.");
    }
    if (deadline.signal.aborted) {
      throw new AiProviderError(deadline.didTimeout() ? "TIMEOUT" : "ABORTED", "Brainstorm synthesis was stopped before persistence.");
    }

    const completed = await finishRecoverableToolRun(input.userId, input.runId, "COMPLETE", {
      outputText: synthesisSafeOutput,
    });
    if (completed.count) input.send("done", { runId: input.runId, status: "COMPLETE", saved: input.saveHistory });
    else input.send("cancelled", { runId: input.runId, status: "CANCELLED" });
    console.info("brainstorm_run_completed", {
      runId: input.runId,
      status: completed.count ? "COMPLETE" : "CANCELLED",
      workerSuccessCount: successful.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    if (deadline.didTimeout() && await isToolRunPending(input.userId, input.runId)) {
      if (synthesisSafeOutput) {
        await persistToolRunPartial(input.userId, input.runId, synthesisSafeOutput).catch(() => ({ count: 0 }));
      }
      const failed = await finishTimedOutRun(input.userId, input.runId).catch(() => ({ count: 0 }));
      input.send(
        failed.count ? "error" : "cancelled",
        failed.count
          ? { code: "TIMEOUT", message: publicErrorForCode("TIMEOUT", error).message }
          : { runId: input.runId, status: "CANCELLED" },
      );
      console.error("brainstorm_run_failed", {
        runId: input.runId,
        status: failed.count ? "ERROR" : "CANCELLED",
        errorCode: failed.count ? "TIMEOUT" : "CANCELLED",
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    const normalized = publicToolError(error);
    const failed = await finishRecoverableToolRun(input.userId, input.runId, "ERROR", { errorCode: normalized.code })
      .catch(() => ({ count: 0 }));
    input.send(
      failed.count ? "error" : "cancelled",
      failed.count
        ? { code: normalized.code, message: normalized.message }
        : { runId: input.runId, status: "CANCELLED" },
    );
    console.error("brainstorm_run_failed", {
      runId: input.runId,
      status: failed.count ? "ERROR" : "CANCELLED",
      errorCode: normalized.code,
      durationMs: Date.now() - startedAt,
    });
  } finally {
    deadline.dispose();
    cancellation.dispose();
  }
}
