import "server-only";

import type { BrainstormWorkerRole } from "@prisma/client";

import { BRAINSTORM_WORKERS } from "@/features/tools/brainstorm/constants";
import { buildBrainstormSynthesisPrompt, buildBrainstormWorkerPrompt } from "@/features/tools/brainstorm/prompts";
import { ToolOutputGuard } from "@/features/tools/output-guard";
import { TOOL_OUTPUT_MAX_CHARS } from "@/features/tools/constants";
import { finishRecoverableToolRun, isToolRunPending, persistToolRunPartial } from "@/features/tools/usage";
import { publicToolError, toolErrorCode } from "@/features/tools/utils";
import { createDurableCancellationController } from "@/features/generation/durable-cancellation";
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

async function collectWorkerOutput(provider: AiProvider, request: Parameters<AiProvider["streamText"]>[0]) {
  let output = "";
  for await (const delta of provider.streamText(request)) {
    if (output.length + delta.length > TOOL_OUTPUT_MAX_CHARS) throw new AiProviderError("INVALID_RESPONSE", "Worker output exceeded the safe storage limit.");
    output += delta;
  }
  if (!output.trim()) throw new AiProviderError("EMPTY_RESPONSE", "Worker returned no text.");
  return output.trim();
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

export async function runBrainstormService(input: BrainstormServiceInput) {
  const cancellation = await createDurableCancellationController({
    isPending: () => isToolRunPending(input.userId, input.runId),
    taskType: "BRAINSTORM",
    taskId: input.runId,
  });
  const startedAt = Date.now();
  try {
    if (cancellation.signal.aborted) { input.send("cancelled", { runId: input.runId, status: "CANCELLED" }); return; }
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
        const output = await collectWorkerOutput(input.provider, {
          messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
          model: input.config.workerModel,
          temperature: input.config.temperature,
          maxOutputTokens: input.config.workerMaxOutputTokens,
          thinking: "disabled",
          signal: cancellation.signal,
        });
        const completed = await prisma.brainstormWorker.updateMany({
          where: { toolRunId: input.runId, userId: input.userId, role: worker.role, status: "PENDING" },
          data: { status: "COMPLETE", outputText: output, completedAt: new Date() },
        });
        if (completed.count) {
          input.send("worker_done", { role: worker.role, label: worker.label, output });
          console.info("brainstorm_worker_completed", { runId: input.runId, role: worker.role, status: "COMPLETE", durationMs: Date.now() - workerStartedAt });
        }
      } catch (error) {
        const code = toolErrorCode(error);
        const failed = await prisma.brainstormWorker.updateMany({
          where: { toolRunId: input.runId, userId: input.userId, role: worker.role, status: "PENDING" },
          data: { status: code === "CANCELLED" ? "CANCELLED" : "ERROR", errorCode: code, completedAt: new Date() },
        });
        if (failed.count) input.send("worker_error", { role: worker.role, label: worker.label, code, message: publicToolError(error).message });
        console.warn("brainstorm_worker_finished", { runId: input.runId, role: worker.role, status: code === "CANCELLED" ? "CANCELLED" : "ERROR", errorCode: code, durationMs: Date.now() - workerStartedAt });
      }
    });
    await runWithConcurrency(tasks, input.config.maxConcurrency);

    if (!await isToolRunPending(input.userId, input.runId)) { input.send("cancelled", { runId: input.runId, status: "CANCELLED" }); return; }
    const successful = await prisma.brainstormWorker.findMany({
      where: { toolRunId: input.runId, userId: input.userId, status: "COMPLETE", outputText: { not: null } },
      orderBy: { position: "asc" },
      select: { role: true, outputText: true },
    });
    if (successful.length < 2) {
      const failed = await finishRecoverableToolRun(input.userId, input.runId, "ERROR", { errorCode: "INSUFFICIENT_WORKERS" });
      if (failed.count) input.send("error", { code: "INSUFFICIENT_WORKERS", message: "成功完成的 Worker 少于两个，无法生成可靠的综合结论。" });
      return;
    }

    input.send("synthesis_started", { successfulWorkers: successful.length });
    const synthesisPrompt = buildBrainstormSynthesisPrompt(input.prompt, successful.map((worker) => ({ role: worker.role as BrainstormWorkerRole, output: worker.outputText! })));
    const guard = new ToolOutputGuard();
    let output = "";
    let persistedLength = 0;
    let lastPersistedAt = Date.now();
    for await (const delta of input.provider.streamText({
      messages: [{ role: "system", content: synthesisPrompt.system }, { role: "user", content: synthesisPrompt.user }],
      model: input.config.synthesisModel,
      temperature: input.config.temperature,
      maxOutputTokens: input.config.synthesisMaxOutputTokens,
      thinking: "disabled",
      signal: cancellation.signal,
    })) {
      if (output.length + delta.length > TOOL_OUTPUT_MAX_CHARS) throw new AiProviderError("INVALID_RESPONSE", "Synthesis output exceeded the safe storage limit.");
      output += delta;
      const safe = guard.push(delta);
      if (safe) input.send("synthesis_delta", { text: safe });
      if (Date.now() - lastPersistedAt >= 750 || output.length - persistedLength >= 1024) {
        const persisted = await persistToolRunPartial(input.userId, input.runId, output);
        if (!persisted.count) { input.send("cancelled", { runId: input.runId, status: "CANCELLED" }); return; }
        persistedLength = output.length;
        lastPersistedAt = Date.now();
      }
    }
    const final = guard.flush();
    if (final) input.send("synthesis_delta", { text: final });
    const completed = await finishRecoverableToolRun(input.userId, input.runId, "COMPLETE", { outputText: output });
    if (completed.count) input.send("done", { runId: input.runId, status: "COMPLETE", saved: input.saveHistory });
    else input.send("cancelled", { runId: input.runId, status: "CANCELLED" });
    console.info("brainstorm_run_completed", { runId: input.runId, status: completed.count ? "COMPLETE" : "CANCELLED", workerSuccessCount: successful.length, durationMs: Date.now() - startedAt });
  } catch (error) {
    const normalized = publicToolError(error);
    const failed = await finishRecoverableToolRun(input.userId, input.runId, "ERROR", { errorCode: normalized.code }).catch(() => ({ count: 0 }));
    input.send(failed.count ? "error" : "cancelled", failed.count ? { code: normalized.code, message: normalized.message } : { runId: input.runId, status: "CANCELLED" });
    console.error("brainstorm_run_failed", { runId: input.runId, status: failed.count ? "ERROR" : "CANCELLED", errorCode: normalized.code, durationMs: Date.now() - startedAt });
  } finally {
    cancellation.dispose();
  }
}
