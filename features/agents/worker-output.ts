import "server-only";

import type { AiProvider, AgentGenerationConfig } from "@/lib/ai/types";
import { ToolOutputGuard } from "@/features/tools/output-guard";
import { buildAgentWorkerPrompt } from "@/features/agents/worker-prompts";
import { workerDeliverableSchema, type ParsedWorkerDeliverable, type WorkerContextEnvelope } from "@/features/agents/worker-contracts";

async function collectGuardedWorkerText(provider: AiProvider, request: Parameters<AiProvider["streamText"]>[0]) {
  const guard = new ToolOutputGuard();
  let output = "";
  for await (const delta of provider.streamText(request)) output += guard.push(delta);
  output += guard.flush();
  return output.trim();
}

export async function collectWorkerDeliverable(input: {
  provider: AiProvider;
  config: AgentGenerationConfig;
  context: WorkerContextEnvelope;
  signal?: AbortSignal;
}): Promise<ParsedWorkerDeliverable> {
  const prompt = buildAgentWorkerPrompt(input.context);
  const safeRaw = await collectGuardedWorkerText(input.provider, {
    messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
    model: input.config.workerModel,
    temperature: input.config.temperature,
    maxOutputTokens: input.config.workerMaxOutputTokens,
    thinking: "disabled",
    signal: input.signal,
  });
  try {
    const parsed = workerDeliverableSchema.parse(JSON.parse(safeRaw));
    return { ...parsed, structured: true };
  } catch {
    if (!safeRaw) throw new Error("Worker returned no safe output.");
    return {
      workSummary: "Worker 返回了未通过结构化校验的安全文本交付物。",
      findings: [],
      assumptions: [],
      risks: [],
      recommendations: [],
      finalDeliverable: safeRaw.slice(0, 40_000),
      structured: false,
    };
  }
}
